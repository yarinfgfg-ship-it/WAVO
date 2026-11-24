/* Backfill every song uploaded to selected artist channels.
   Uses YouTube's public channel page + browse continuations (no API key),
   then the innertube player API for duration/Shorts checks. Existing catalog
   entries are never touched — new songs are appended in their own deduping
   block, so re-running the script is safe.
   `node scripts/backfill-artists.mjs [--dry-run]` */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const songsFile = path.join(root, "public", "wavo", "songs.js");
const dryRun = process.argv.includes("--dry-run");
const evaluate = (file, name) =>
  vm.runInNewContext(fs.readFileSync(file, "utf8") + `\n;${name}`, {}, { timeout: 15000 });

const songs = evaluate(songsFile, "songs");
let API_KEY = "";
let CLIENT_VER = "";

const TARGETS = [
  { a: "איתי לוי", ch: "UCKw5dh0Q1Y_SvsW4nXnLjcg" },
  { a: "אלה לי", ch: "UCgoBmbaT91LZPunrj6hK4CQ" },
  { a: "אייל גולן", ch: "UCrI0Slej0fiiwYPhR1EmFBw" },
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url, ms = 25000) => {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "he-IL,he;q=0.9,en;q=0.8" },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return await r.text();
};
const FIN = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const fold = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\u0591-\u05c7]/g, "")
    .replace(/[ךםןףץ]/g, (c) => FIN[c])
    .replace(/[^ \u05d0-\u05eaa-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const SKIP =
  /(^|[#\s])shorts?(#|\s|$)|full album|album full|all (the )?songs|האלבום|אלבום מלא|הופעה מלאה|live album|podcast|פודקאסט|behind the scenes|making of|interview|ראיון|ראיונות|חדשות|כתבה|קדימון|הכרזה|playlist|קריוקי|karaoke|טריילר|trailer|קאבר|\bcover\b|mashup|מילים|lyrics/i;

/* ---- discover every upload in a channel's Videos tab ---- */
async function allUploads(channelId) {
  const html = await get(`https://www.youtube.com/channel/${channelId}/videos`);
  const key = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html)?.[1];
  const ver = /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1];
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!key || !ver || !m) throw new Error("could not read YouTube page data");
  API_KEY = key;
  CLIENT_VER = ver;
  const data = JSON.parse(m[1]);
  const tab = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.find(
    (t) => t.tabRenderer?.content?.richGridRenderer
  );
  const grid = tab?.tabRenderer?.content?.richGridRenderer;
  if (!grid) throw new Error("no Videos grid");

  const parse = (items) => {
    const vids = [];
    let token = null;
    for (const it of items || []) {
      const l = it.richItemRenderer?.content?.lockupViewModel;
      if (l?.contentId && /^[\w-]{11}$/.test(l.contentId) && l.contentType === "LOCKUP_CONTENT_TYPE_VIDEO")
        vids.push({
          yt: l.contentId,
          raw: l.metadata?.lockupMetadataViewModel?.title?.content || "",
        });
      const t = it.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
      if (t) token = t;
    }
    return { vids, token };
  };

  let { vids, token } = parse(grid.contents);
  let pages = 1;
  while (token && pages < 250) {
    let j;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${key}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": UA,
            "X-Youtube-Client-Name": "1",
            "X-Youtube-Client-Version": ver,
          },
          body: JSON.stringify({
            context: { client: { clientName: "WEB", clientVersion: ver, hl: "he", gl: "IL" } },
            continuation: token,
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (!r.ok) throw new Error(`browse ${r.status}`);
        j = await r.json();
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        await sleep(1000 * (attempt + 1));
      }
    }
    const acts = j.onResponseReceivedActions || [];
    const items =
      acts[0]?.appendContinuationItemsAction?.continuationItems ||
      acts[0]?.reloadContinuationItemsCommand?.continuationItems ||
      [];
    const next = parse(items);
    if (!next.vids.length && !next.token) break;
    vids.push(...next.vids);
    token = next.token;
    pages++;
    await sleep(120);
  }
  console.log(`  ${channelId}: ${vids.length} uploads across ${pages} pages`);
  return { vids, key, ver };
}

/* ---- duration / Shorts check ---- */
async function meta(vid, key, ver) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${key}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": UA,
          "X-Youtube-Client-Name": "1",
          "X-Youtube-Client-Version": ver,
        },
        body: JSON.stringify({
          context: { client: { clientName: "WEB", clientVersion: ver, hl: "he", gl: "IL" } },
          videoId: vid,
        }),
        signal: AbortSignal.timeout(18000),
      });
      if (!r.ok) throw new Error(`player ${r.status}`);
      const j = await r.json();
      const mm = j.microformat?.playerMicroformatRenderer || {};
      const vd = j.videoDetails || {};
      if (!vd.lengthSeconds) return null;
      return { d: +vd.lengthSeconds, shorts: mm.isShortsEligible === true };
    } catch {
      await sleep(700 * (attempt + 1));
    }
  }
  return null;
}

const cleanTitle = (raw, artist) => {
  let t = raw.replace(/^\.+\s*/, "").trim();
  const re = new RegExp(`^\\s*${artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-–—|:]\\s*`, "i");
  t = t.replace(re, "").replace(re, ""); // some uploads repeat the artist twice
  /* "ידידים | Itay Levi - Yedidim" → keep the Hebrew title only */
  if (t.includes("|") && /[\u05d0-\u05ea]/.test(t.split("|")[0])) t = t.split("|")[0];
  t = t
    .replace(/\s*[\(\[](official (music )?video|official audio|audio|lyrics?|visualizer|clip|קליפ רשמי|הקליפ הרשמי|vevo|hd|4k|prod\.? by[^)\]]*)[\)\]]\s*/gi, " ")
    .replace(/\s*[-\u2013\u2014|]\s*(official (music )?video|official audio|lyrics?|קליפ רשמי)\s*$/ig, " ")
    .replace(/\s*[\(\[]?קליפ[\)\]]?\s*/gi, " ")
    .replace(/\b(Itay Levi|Eyal Golan|Ella Lee)( (and|&|feat\.?) [A-Za-z ]+)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t || raw;
};

/* Some artists (e.g. auto-generated "Topic" channels) do not expose a Videos
   grid, so supplement them from public YouTube search results. */
async function searchVideos(query) {
  const html = await get(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`
  );
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!m) return [];
  const out = [];
  const walk = (o) => {
    if (!o || typeof o !== "object" || out.length >= 60) return;
    const v = o.videoRenderer;
    if (v && /^[\w-]{11}$/.test(v.videoId || "")) {
      out.push({
        yt: v.videoId,
        raw: v.title?.runs?.map((x) => x.text).join("") || "",
        owner: v.ownerText?.runs?.[0]?.text || "",
      });
      return;
    }
    for (const value of Object.values(o)) walk(value);
  };
  walk(JSON.parse(m[1]));
  return out;
}

/* ---- run ---- */
const seenIds = new Set(songs.map((s) => s.yt));
const seenTitles = new Map(); // folded title -> artist
for (const s of songs) if (!seenTitles.has(fold(s.t))) seenTitles.set(fold(s.t), s.a);
const added = [];
const stats = { seen: 0, skip: 0, noMeta: 0, shorts: 0, duration: 0, dup: 0, longTitle: 0 };

async function processCandidates(candidates, artist, key, ver) {
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = candidates.slice(i, i + 4);
    const metas = await Promise.all(batch.map((v) => meta(v.yt, key, ver)));
    for (let k = 0; k < batch.length; k++) {
      const v = batch[k], m = metas[k];
      if (!m) { stats.noMeta++; continue; }
      if (m.shorts) { stats.shorts++; continue; }
      if (m.d < 60 || m.d > 900) { stats.duration++; continue; }
      const t = cleanTitle(v.raw, artist);
      if (t.length > 60) { stats.longTitle++; continue; }
      const ft = fold(t);
      if (seenTitles.has(ft)) { stats.dup++; continue; }
      added.push({ t, a: artist, d: m.d, yt: v.yt });
      seenIds.add(v.yt);
      seenTitles.set(ft, artist);
    }
    if (i % 40 === 0) console.log(`  ${added.length} added so far`);
    await sleep(200);
  }
}

console.log(`catalog: ${songs.length} songs`);
for (const target of TARGETS) {
  console.log(`scanning ${target.a} ...`);
  let scan;
  try {
    scan = await allUploads(target.ch);
  } catch (e) {
    console.error(`  scan failed: ${e.message}`);
    continue;
  }
  const { vids: uploads, key, ver } = scan;
  const fresh = uploads.filter((v) => {
    if (seenIds.has(v.yt)) { stats.seen++; return false; }
    if (SKIP.test(v.raw)) { stats.skip++; return false; }
    return true;
  });
  console.log(`  ${fresh.length} candidates after dedupe/junk filter`);

  await processCandidates(fresh, target.a, key, ver);
}

/* auto-generated Topic channels have no Videos grid — use public search */
if (API_KEY) {
  console.log("searching for more אלה לי (ALLA) songs ...");
  for (const query of ["אלה לי", "Ella Lee"]) {
    try {
      const found = await searchVideos(query);
      const candidates = found.filter(
        (v) => /אלה לי|Ella Lee/i.test(v.owner) && !seenIds.has(v.yt) && !SKIP.test(v.raw)
      );
      console.log(`  "${query}": ${found.length} results, ${candidates.length} candidates`);
      await processCandidates(candidates, "אלה לי", API_KEY, CLIENT_VER);
    } catch (e) {
      console.error(`  search failed: ${e.message}`);
    }
  }
}

console.log(`\n${added.length} new songs; skipped: ${JSON.stringify(stats)}`);
for (const s of added) console.log(`  + ${s.a} - ${s.t} (${s.d}s) ${s.yt}`);
if (dryRun || !added.length) process.exit(0);

/* append a self-contained deduping block — never rewrite existing songs */
const lines = added.map((s) => "    " + JSON.stringify(s)).join(",\n");
const block = `
/* Full-channel backfill — verified uploads, deduped by YouTube ID. */
{
  const __backfillIds = new Set(songs.map((s) => s.yt));
  [
${lines}
  ].forEach((s) => { if (!__backfillIds.has(s.yt)) { songs.push(s); __backfillIds.add(s.yt); } });
}
`;
fs.appendFileSync(songsFile, block, "utf8");
console.log(`appended to ${path.basename(songsFile)}`);

const bump = (file, re) => {
  const t = fs.readFileSync(file, "utf8");
  const m = re.exec(t);
  if (!m) { console.error(`bump: pattern not found in ${file}`); return; }
  fs.writeFileSync(file, t.replace(re, `const ${m[1]} = ${+m[2] + 1}`), "utf8");
  console.log(`bumped ${path.basename(file)} ${m[1]} ${m[2]} -> ${+m[2] + 1}`);
};
bump(path.join(root, "src", "routes", "index.tsx"), /const (SCRIPT_VERSION) = (\d+)/);
bump(path.join(root, "scripts", "ios-web.mjs"), /const (VERSION) = (\d+)/);
console.log("DONE — run scripts/fetch-lyrics.mjs --only=<new ids> if you want bundled lyrics");
