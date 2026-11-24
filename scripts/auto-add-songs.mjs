/* Auto-add newly published songs from the mapped YouTube artist channels.
   No API key: reads each channel's public RSS feed, then YouTube's innertube
   player API for duration + Shorts-eligibility, and appends anything that
   isn't in public/wavo/songs.js yet.
   Run by .github/workflows/auto-add.yml on a schedule, or locally with
   `node scripts/auto-add-songs.mjs [--dry-run]`.

   After adding it bumps the cache-bust versions (index.tsx SCRIPT_VERSION,
   ios-web.mjs VERSION) so PWAs refetch songs.js, and fetches lyrics for just
   the new videos (a lyrics failure is not fatal — the app falls back to the
   live LRCLIB lookup). */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wavoDir = path.join(root, "public", "wavo");
const dryRun = process.argv.includes("--dry-run");

/* These files contain extra append/dedupe blocks after the base array,
   so evaluate them instead of JSON.parse-ing just the first statement. */
const parseJs = (file, name) => {
  const text = fs.readFileSync(file, "utf8");
  return vm.runInNewContext(text + `\n;${name}`, {}, { timeout: 15000 });
};

const songsFile = path.join(wavoDir, "songs.js");
const songs = parseJs(songsFile, "songs");
const channels = parseJs(path.join(wavoDir, "channels.js"), "channels");
console.log(`catalog: ${songs.length} songs, ${Object.keys(channels).length} mapped artists`);

/* ---- network helpers ---- */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const get = async (url) => {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "he-IL,he;q=0.9,en;q=0.8" },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return await r.text();
};

const decodeXml = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

/* same folding as extras.js norm() — for the duplicate check only */
const FIN = { "\u05da": "\u05db", "\u05dd": "\u05de", "\u05df": "\u05e0", "\u05e3": "\u05e4", "\u05e5": "\u05e6" };
const fold = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\u0591-\u05c7]/g, "")
    .replace(/[\u05da\u05dd\u05df\u05e3\u05e5]/g, (c) => FIN[c])
    .replace(/[^ \u05d0-\u05eaa-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* obvious non-songs — duration + isShortsEligible catch most of the rest */
const SKIP =
  /(^|[#\s])shorts?(#|\s|$)|full album|album full|all (the )?songs|\u05d4\u05d0\u05dc\u05d1\u05dd|\u05d0\u05dc\u05d1\u05dd \u05de\u05dc\u05d0|\u05d4\u05d5\u05e4\u05e2\u05d4 \u05de\u05dc\u05d0\u05d4|live album|podcast|\u05e4\u05d5\u05d3\u05e7\u05d0\u05e1\u05d8|behind the scenes|making of|interview|\u05e8\u05d0\u05d9\u05d5\u05df|\u05e8\u05d0\u05d9\u05d9\u05df|\u05d7\u05d3\u05e9\u05d5\u05ea|\u05db\u05ea\u05d1\u05d4|\u05e7\u05d3\u05d9\u05de\u05d5\u05df|\u05d4\u05db\u05e8\u05d6\u05d4|playlist/i;

/* every artist name we know, to split "artist - title" video titles */
const allArtists = new Set([
  ...Object.keys(channels),
  ...songs.map((s) => s.a),
]);

/* ---- collect the feeds ---- */
const byChannel = new Map(); // channelId -> [artist names, in channels.js order]
for (const [artist, id] of Object.entries(channels)) {
  if (!id) continue;
  if (!byChannel.has(id)) byChannel.set(id, []);
  byChannel.get(id).push(artist);
}

const seenYt = new Set(songs.map((s) => s.yt));
const seenKey = new Set(songs.map((s) => fold(s.a) + "\u0001" + fold(s.t)));
const added = [];
const skipped = { seen: 0, dup: 0, badDuration: 0, skipRule: 0, noDuration: 0, feedErr: 0, shorts: 0, longTitle: 0 };

/* innertube player API (no key): duration + isShortsEligible in one call.
   isShortsEligible is the junk discriminator — every real song in the
   catalog is false; short personal clips / status posts are true. */
const meta = async (vid) => {
  try {
    await new Promise((r) => setTimeout(r, 150)); // pace the calls
    const r = await fetch("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion: "2.20250101.00.00", hl: "he", gl: "IL" } },
        videoId: vid,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json();
    const mm = j.microformat?.playerMicroformatRenderer || {};
    const vd = j.videoDetails || {};
    if (!vd.lengthSeconds) return null;
    return { d: +vd.lengthSeconds, shorts: mm.isShortsEligible === true };
  } catch {
    return null;
  }
};

for (const [channelId, channelArtists] of byChannel) {
  let xml;
  try {
    xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  } catch (e) {
    console.error(`feed failed ${channelId}: ${e.message}`);
    skipped.feedErr++;
    continue;
  }
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  for (const entry of entries) {
    const vid = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry)?.[1] || "";
    const rawTitle = decodeXml(/<media:title>([\s\S]*?)<\/media:title>/.exec(entry)?.[1] || "").trim();
    if (!/^[\w-]{11}$/.test(vid) || !rawTitle) continue;
    if (seenYt.has(vid)) {
      skipped.seen++;
      continue;
    }
    if (SKIP.test(rawTitle)) {
      skipped.skipRule++;
      continue;
    }

    /* "artist - title" → split on a known artist; else the channel's artist */
    let artist = channelArtists[0];
    let title = rawTitle.replace(/^\.+\s*/, "");
    const splitOn = (name) => {
      const m = title.match(new RegExp(`^${escapeRe(name)}\\s*[-\u2013\u2014|]\\s*(.+)$`, "i"));
      if (m) {
        artist = name;
        title = m[1];
        return true;
      }
      return false;
    };
    if (![...channelArtists, ...allArtists].some(splitOn)) {
      /* no known prefix — keep the whole title, artist stays the channel's */
    }

    title = title
      .replace(/\s*[\(\[](official (music )?video|official audio|audio|lyrics?|visualizer|clip|\u05e7\u05dc\u05d9\u05e4 \u05e8\u05e9\u05d9|\u05d4\u05e7\u05dc\u05d9\u05e4 \u05d4\u05e8\u05e9\u05d9|vevo|hd|4k)[\)\]]\s*/ig, " ")
      .replace(/\s*[-\u2013\u2014|]\s*(official (music )?video|official audio|lyrics?|\u05e7\u05dc\u05d9\u05e4 \u05e8\u05e9\u05d9)\s*$/ig, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!title) title = rawTitle;

    const m = await meta(vid);
    if (!m) {
      skipped.noDuration++;
      continue;
    }
    const d = m.d;
    if (m.shorts) {
      skipped.shorts++;
      continue;
    }
    if (d < 60 || d > 900) {
      skipped.badDuration++;
      continue;
    }
    if (title.length > 60) {
      skipped.longTitle++;
      continue;
    }
    const key = fold(artist) + "\u0001" + fold(title);
    if (seenKey.has(key)) {
      skipped.dup++;
      continue;
    }

    added.push({ t: title, a: artist, d, yt: vid });
    seenYt.add(vid);
    seenKey.add(key);
  }
}

console.log(`checked ${byChannel.size} channels — ${added.length} new songs`);
for (const s of added) console.log(`  + ${s.a} - ${s.t} (${s.d}s) ${s.yt}`);
console.log("skipped:", JSON.stringify(skipped));

if (!added.length || dryRun) process.exit(0);

/* ---- write the catalog + bump cache-bust versions ---- */
/* Append a deduping block so the verified base array and earlier append
   blocks stay intact (and re-runs remain safe). */
const lines = added.map((s) => "  " + JSON.stringify(s)).join(",\n");
fs.appendFileSync(
  songsFile,
  `\n/* Auto-added uploads — deduped by YouTube ID. */\n{\n  const __autoIds = new Set(songs.map((s) => s.yt));\n  [\n${lines}\n  ].forEach((s) => { if (!__autoIds.has(s.yt)) { songs.push(s); __autoIds.add(s.yt); } });\n}\n`,
  "utf8"
);

const bump = (file, re) => {
  const t = fs.readFileSync(file, "utf8");
  const m = re.exec(t);
  if (!m) {
    console.error(`bump: pattern not found in ${file}`);
    return;
  }
  const next = String(+m[2] + 1);
  fs.writeFileSync(file, t.replace(re, `const ${m[1]} = ${next}`), "utf8");
  console.log(`bumped ${path.basename(file)} ${m[1]} ${m[2]} -> ${next}`);
};
bump(path.join(root, "src", "routes", "index.tsx"), /const (SCRIPT_VERSION) = (\d+)/);
bump(path.join(root, "scripts", "ios-web.mjs"), /const (VERSION) = (\d+)/);

/* ---- lyrics for the new songs only (non-fatal) ---- */
const ids = added.map((s) => s.yt).join(",");
const r = spawnSync(process.execPath, [path.join(root, "scripts", "fetch-lyrics.mjs"), `--only=${ids}`], {
  stdio: "inherit",
});
if (r.status !== 0) console.error("lyrics fetch failed — the app will look them up live instead");

console.log("DONE");
