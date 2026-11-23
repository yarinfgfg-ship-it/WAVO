/* Bulk lyrics sync for the WAVO catalog.
   For every song in public/wavo/songs.js it looks up LRCLIB (search + the
   hand-verified picks from extras.js), falls back to lyrics.ovh for plain
   text, and writes public/wavo/lyrics/{yt}.json — so the player loads
   lyrics from its own origin first and only goes to the network when a
   song has nothing stored.

   Resumable: files that already exist are skipped, so it is safe to re-run.
   `--only=yt1,yt2,...` restricts the run to those videos (used by
   auto-add-songs.mjs for just the newly added songs — a partial run does
   not rewrite lyrics-report.json). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "public", "wavo", "songs.js");
const outDir = path.join(root, "public", "wavo", "lyrics");
fs.mkdirSync(outDir, { recursive: true });

const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",").map((s) => s.trim()).filter(Boolean)) : null;

const src = fs.readFileSync(catalogPath, "utf8");
const allSongs = JSON.parse(src.slice(src.indexOf("=") + 1).trim().replace(/;$/, ""));
const songs = only ? allSongs.filter((s) => only.has(s.yt)) : allSongs;
console.log(`${only ? `--only: ${songs.length}/${allSongs.length} selected` : `catalog: ${songs.length} songs`}`);

/* ---- matching copied from public/wavo/extras.js so the stored files pass
       the app's own score() when it re-checks them ---- */
const FIN = { "\u05db": "\u05db", "\u05dd": "\u05de", "\u05df": "\u05e0", "\u05e3": "\u05e4", "\u05e5": "\u05e6" };
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\u0591-\u05c7]/g, "")
    .replace(/[\u05da\u05dd\u05df\u05e3\u05e5]/g, (c) => FIN[c])
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(
      /(official|video|clip|lyrics?|audio|visualizer|prod\.?.*|feat\.?.*|ft\.?.*|\u05e7\u05dc\u05d9\u05e4 \u05e8\u05e9\u05d9|\u05d4\u05e7\u05dc\u05d9\u05e4 \u05d4\u05e8\u05e9\u05d9|\u05e7\u05dc\u05d9\u05e4|\u05de\u05d9\u05dc\u05d9\u05dd|\u05e8\u05e9\u05de\u05d9|\u05d2\u05e8\u05e1\u05d4 \u05e8\u05e9\u05de\u05d9|\u05d2\u05e8\u05e1\u05d4|- topic|topic)/g,
      " ",
    )
    .replace(/[^\u05d0-\u05eaa-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function splitTitle(t, a) {
  const parts = String(t || "")
    .split(/\s[-|\u2013\u2014]\s|\s*[|]\s*/)
    .map(norm)
    .filter(Boolean);
  const na = norm(a);
  if (parts.length < 2) return { title: norm(t), alt: "" };
  const keep = parts.filter((p) => !(na && (p.includes(na) || na.includes(p))));
  const title = keep[0] || parts[parts.length - 1];
  const alt = parts.find((p) => p !== title) || "";
  return { title, alt };
}

/* raw cleaner for SEARCH QUERIES — same as norm() but WITHOUT folding final
   Hebrew letters (ן ם ן ף ץ). LRCLIB matches words exactly, so a folded
   query like "אביב גפנ" finds nothing while "אביב גפן" hits. */
const qclean = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\u0591-\u05c7]/g, "")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(
      /(official|video|clip|lyrics?|audio|visualizer|prod\.?.*|feat\.?.*|ft\.?.*|\u05e7\u05dc\u05d9\u05e4 \u05e8\u05e9\u05d9|\u05d4\u05e7\u05dc\u05d9\u05e4 \u05d4\u05e8\u05e9\u05d9|\u05e7\u05dc\u05d9\u05e4|\u05de\u05d9\u05dc\u05d9\u05dd|\u05e8\u05e9\u05de\u05d9|\u05d2\u05e8\u05e1\u05d4 \u05e8\u05e9\u05de\u05d9|\u05d2\u05e8\u05e1\u05d4|- topic|topic)/g,
      " ",
    )
    .replace(/[^\u05d0-\u05eaa-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function splitQuery(t, a) {
  const parts = String(t || "")
    .split(/\s[-|\u2013\u2014]\s|\s*[|]\s*/)
    .map(qclean)
    .filter(Boolean);
  const na = qclean(a);
  if (parts.length < 2) return { title: qclean(t), artist: na };
  const keep = parts.filter((p) => !(na && (p.includes(na) || na.includes(p))));
  const title = keep[0] || parts[parts.length - 1];
  return { title, artist: na };
}

const words = (s) => s.split(" ").filter((w) => w.length > 1);
const overlap = (x, y) => {
  const A = words(x),
    B = new Set(words(y));
  return A.length ? A.filter((w) => B.has(w)).length / A.length : 0;
};

function score(x, t, artists, d) {
  const xt = norm(x.trackName),
    xa = norm(x.artistName);
  if (!xt || !(x.syncedLyrics || x.plainLyrics)) return -99;
  const titleSim = xt === t ? 1 : xt.includes(t) || t.includes(xt) ? 0.8 : overlap(t, xt);
  if (titleSim < 0.5) return -99;
  const artistOk = artists.some((a) => a && xa && (xa.includes(a) || a.includes(xa) || overlap(a, xa + " " + xt) >= 0.5));
  let s = titleSim * 5;
  if (artistOk) s += 5;
  let durOk = false;
  if (d && x.duration) {
    const diff = Math.abs(d - x.duration);
    durOk = diff <= 8;
    if (diff <= 4) s += 3;
    else if (diff <= 12) s += 1;
    else if (diff < 70) s -= Math.min(diff / 15, 3);
    else s -= 4;
  }
  if (!artistOk && !durOk && !(titleSim === 1 && words(t).length >= 2)) return -99;
  if (x.syncedLyrics) s += 1.5;
  if (x.instrumental) s -= 10;
  return s;
}

/* manual corrections already shipped in extras.js */
const KNOWN = {
  "yt:EJ60iieMQAY": 20918849, "yt:wQIwVqlHDVs": 30100172, "yt:RVnZ9CRVris": 39834608,
  "yt:uaOPKIHk-tU": 18281874, "yt:yQ-cYqBzFkc": 23681211, "yt:VoV4G5IqFzs": 20902828,
  "yt:55Uca4kSzVk": 20638657, "yt:yaL_8gRQ-UQ": 40211898, "yt:ONxDKF5ZYDs": 13046551,
  "yt:TOR0BCA4SgA": 16509545, "yt:4D-Qcrbe0Bg": 7468516, "yt:zZW__pBCLRg": 16776764,
  "yt:re3Gj-Q70Bc": 14363573,
};

/* ---- text hygiene: strip pictographic emoji / music-note glyphs so stored
       lyrics stay clean. The player applies the same filter at render time. ---- */
const cleanText = (s) =>
  String(s || "")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u266A\u266B]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n/g, "\n")
    .trim();

/* ---- network ---- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(qs) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch("https://lrclib.net/api/" + qs, {
        headers: { "User-Agent": "WAVO-catalog-lyrics/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (r.status === 404) return null;
      if (r.status === 429) {
        await sleep(4000 * (attempt + 1));
        continue;
      }
      if (!r.ok) {
        await sleep(1200);
        continue;
      }
      return await r.json();
    } catch {
      await sleep(1200);
    }
  }
  return undefined; // network trouble — caller treats as "try later"
}

async function lookup(s) {
  const { title, alt } = splitTitle(s.t, s.a); // normalized — for scoring
  const q = splitQuery(s.t, s.a); // raw — for the search query itself
  const a = norm(s.a);
  const artists = [a, alt].filter(Boolean);
  let best = null;
  let bestScore = -1;
  const consider = (list) => {
    for (const x of list || []) {
      if (!x || typeof x !== "object") continue;
      const sc = score(x, title, artists, s.d);
      if (sc > bestScore) {
        bestScore = sc;
        best = x;
      }
    }
  };

  const knownId = KNOWN["yt:" + s.yt];
  if (knownId) {
    const x = await api(String(knownId));
    if (x && (x.syncedLyrics || x.plainLyrics)) {
      return { src: "LRCLIB", id: x.id, plain: x.plainLyrics || "", synced: x.syncedLyrics || "", score: 99 };
    }
  }

  if (!(bestScore >= 10 && best && best.syncedLyrics)) {
    consider(await api("search?" + new URLSearchParams({ track_name: q.title, artist_name: q.artist })));
  }
  if (!(bestScore >= 10 && best && best.syncedLyrics)) {
    const tries = [
      { q: `${q.title} ${q.artist}`.trim() },
      q.title !== norm(s.t) ? { track_name: norm(s.t) } : null,
      q.artist && q.title !== q.artist ? { q: q.title } : null,
    ].filter(Boolean);
    const [r1, r2, r3] = await Promise.all(tries.map((p) => api("search?" + new URLSearchParams(p))));
    consider(r1);
    consider(r2);
    consider(r3);
  }
  if (best && bestScore >= 5) {
    return { src: "LRCLIB", id: best.id, plain: best.plainLyrics || "", synced: best.syncedLyrics || "", score: bestScore };
  }

  /* plain-only second source — raw strings, same reason as above */
  for (const ar of [...new Set([s.a, q.artist].filter(Boolean))]) {
    try {
      const r = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(ar)}/${encodeURIComponent(q.title)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const j = await r.json();
        if (j && j.lyrics && j.lyrics.trim()) {
          return { src: "lyrics.ovh", id: 0, plain: j.lyrics.trim(), synced: "", score: 0 };
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/* ---- pool ---- */
const CONC = 4;
let cursor = 0;
let done = 0;
let synced = 0;
let plain = 0;
let none = 0;
let failed = 0;
const missing = [];

async function worker() {
  for (;;) {
    const i = cursor++;
    if (i >= songs.length) return;
    const s = songs[i];
    if (!/^[\w-]{11}$/.test(s.yt || "")) {
      none++;
      done++;
      continue;
    }
    const file = path.join(outDir, s.yt + ".json");
    if (fs.existsSync(file)) {
      done++;
      continue;
    }
    let rec = null;
    try {
      rec = await lookup(s);
    } catch {
      rec = null;
    }
    if (rec && (rec.plain || rec.synced)) {
      const body = {
        v: 1,
        t: cleanText(s.t),
        a: s.a,
        d: s.d || 0,
        src: rec.src,
        id: rec.id || 0,
        plain: cleanText(rec.plain),
        synced: cleanText(rec.synced),
        at: Date.now(),
      };
      fs.writeFileSync(file, JSON.stringify(body), "utf8");
      if (rec.synced) synced++;
      else plain++;
    } else if (rec === null) {
      none++;
      missing.push(`${s.t} - ${s.a}`);
    } else {
      failed++; // network trouble — leave no file so a re-run retries it
    }
    done++;
    if (done % 100 === 0) {
      console.log(`progress ${done}/${songs.length}  synced=${synced} plain=${plain} none=${none} retry=${failed}`);
    }
    await sleep(150);
  }
}

await Promise.all(Array.from({ length: CONC }, () => worker()));

const report = {
  at: new Date().toISOString(),
  total: songs.length,
  withSynced: synced,
  withPlainOnly: plain,
  none,
  networkRetry: failed,
  missing,
};
if (!only) fs.writeFileSync(path.join(root, "scripts", "lyrics-report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`DONE synced=${synced} plainOnly=${plain} none=${none} retry=${failed} (of ${songs.length})`);
