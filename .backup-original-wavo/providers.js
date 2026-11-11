/* Provider adapters — official APIs only, full songs only.
   audius  : full tracks, public API, no key           (its own catalog, mostly electronic/creator music)
   yt      : YouTube Data API through the local proxy  (needs YOUTUBE_API_KEY in .env)
   catalog : the built-in verified song list           (plays through the YouTube IFrame API)
*/
const APP = "WAVO-web";
const AUDIUS_HOST = "https://api.audius.co/v1";

async function req(url, ms = 9000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { "App-Name": APP } });
    if (r.status === 429) throw new Error("הספק מגביל את מספר הבקשות — נסה שוב בעוד רגע");
    if (!r.ok && r.status !== 501) throw new Error("שגיאת רשת " + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

const cleanYt = (t) =>
  t.replace(/\s*[-|(]\s*(קליפ|הקליפ|Official Video|Lyrics|Video)\b[^)\]}|]*/gi, "")
   .replace(/\((?:Prod|Produced|Music)[^)]*\)/gi, "")
   .replace(/\s*[-|]\s*$/, "")
   .trim() || t;

/* ---------- Audius ---------- */
async function audiusSearch(q, n = 12) {
  const d = await req(`${AUDIUS_HOST}/tracks/search?${new URLSearchParams({ query: q, app_name: APP })}`);
  return (d.data || [])
    .filter((x) => x.stream && x.stream.url)
    .slice(0, n)
    .map((x) => ({
      uid: "audius:" + x.track_id,
      src: "audius",
      t: x.title,
      a: x.user ? x.user.name : "אמן",
      al: x.album || "",
      d: x.duration || 0,
      art: x.artwork ? x.artwork["480x480"] || x.artwork["150x150"] : "",
      stream: x.stream.url + (x.stream.url.includes("?") ? "&" : "?") + "format=mp3-0",
      link: x.permalinks ? "https://audius.co/" + x.permalinks.slug : "",
      genre: x.genre || "",
      full: true,
    }));
}

/* ---------- YouTube Data API (via local proxy) ---------- */
/* החיפוש מחזיר גם טריילרים, קריוקי וקטעי סרטים — אלה לא שירים. */
const NOT_A_SONG = /קריוקי|karaoke|טריילר|trailer|movie\s*clip|movieclips|open\s*matte|קטע\s*מה|מתוך\s*הסרט|חדשות|ראיון|ניאונט|תגובה|react|מילים|lyrics|קאבר|\bcover\b|mashup|#shorts|full\s*album|פלייליסט|playlist|teaser|תקדין/i;
const official = (c) => /official|הערוץ הרשמי|רשמי|vevo/i.test(c || "");
const heCore = (w) => w.replace(/^[בהולשכמ]+/, "").replace(/[ותים]+$/, "");

/* לפחות מחצית מהמילים של המבקש חייבות להופיע בכותרת או בשם הערוץ */
function songish(title, channel, q) {
  if (NOT_A_SONG.test(title) || NOT_A_SONG.test(channel)) return false;
  const hay = normKey(title + " " + channel);
  const toks = normKey(q).split(" ").filter((w) => w.length > 2);
  if (!toks.length) return true;
  let hit = 0;
  for (const w of toks) {
    const core = heCore(w);
    if (hay.includes(w) || (core.length > 3 && hay.includes(core)) || hay.includes(w.slice(0, 4)) || wordScore(w, hay.split(" "))) hit++;
  }
  return hit / toks.length >= 0.5;
}

/* "מור - מטריקס" בערוץ "מור" → הכותרת צריכה להישאר "מטריקס" */
function stripArtist(title, channel) {
  const cw = normKey(channel).split(" ")[0];
  if (!cw || cw.length < 3) return title;
  const re = new RegExp("^\\s*" + cw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[-–|:]\\s*", "i");
  return title.replace(re, "").trim() || title;
}

async function ytSearch(q, n = 10) {
  const d = await req("/api/yt/search?" + new URLSearchParams({ q, max: "40" }), 14000);
  if (d.error) {
    const e = new Error(d.error.message || "YouTube API לא זמין");
    e.noKey = d.error.code === 501;
    throw e;
  }
  const kept = (d.items || []).filter((x) =>
    x.embed && x.dur >= 60 && x.dur <= 900 && songish(x.title, x.channel, q));
  kept.sort((a, b) => (official(b.channel) - official(a.channel)) || (b.dur - a.dur));
  return kept.slice(0, n).map((x) => ({
    uid: "yt:" + x.id,
    src: "yt",
    t: stripArtist(cleanYt(x.title), x.channel),
    a: x.channel,
    al: "",
    d: x.dur,
    art: x.thumb || thumb(x.id),
    vid: x.id,
    link: "https://www.youtube.com/watch?v=" + x.id,
    full: true,
  }));
}

/* ---------- built-in catalog (forgiving search) ---------- */
const FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
const fold = (w) => w.replace(/[ךםןףץ]/g, (c) => FINALS[c]).replace(/[יו]/g, "");
const stem = (w) => {
  let x = w.replace(/^(וה|שה|וב|ול|ומ|כש|מה|ה|ו|ב|ל|ש|מ|כ)(?=..)/, "");
  x = x.replace(/(ים|ות|ית|ה|ת)$/, (m) => (x.length - m.length >= 2 ? "" : m));
  return fold(x);
};
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const r = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = r[0]; r[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = r[j];
      r[j] = Math.min(r[j] + 1, r[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return r[b.length];
}
function wordScore(q, words) {
  const qs = stem(q);
  let best = 0;
  for (const w of words) {
    if (w === q) return 1;
    const ws = stem(w);
    if (ws === qs && qs) { best = Math.max(best, 0.95); continue; }
    if (w.startsWith(q) || (qs.length >= 2 && ws.startsWith(qs))) { best = Math.max(best, 0.85); continue; }
    if (q.length >= 3 && (w.includes(q) || (qs.length >= 3 && ws.includes(qs)))) { best = Math.max(best, 0.7); continue; }
    const lim = qs.length >= 6 ? 2 : qs.length >= 3 ? 1 : 0;
    if (lim && lev(qs, ws) <= lim) best = Math.max(best, 0.65);
  }
  return best;
}
const SONG_WORDS = [];
function fuzzyScore(q, s, i) {
  const words = SONG_WORDS[i] || (SONG_WORDS[i] = normKey(s.t, s.a).split(" "));
  const qw = normKey(q, "").split(" ").filter(Boolean);
  if (!qw.length) return 0;
  let sum = 0, miss = 0;
  for (const w of qw) { const v = wordScore(w, words); if (!v) miss++; sum += v; }
  if (miss > Math.floor(qw.length / 3)) return 0;
  let sc = sum / qw.length;
  const whole = normKey(s.t, s.a);
  if (whole.includes(normKey(q, "").trim())) sc += 0.5;
  if (stem(normKey(s.t, "").replace(/ /g, "")) === stem(normKey(q, "").replace(/ /g, ""))) sc += 0.6;
  return sc;
}
function catalogSearch(q, n = 20) {
  return songs
    .map((s, i) => ({ s, i, sc: fuzzyScore(q, s, i) }))
    .filter((x) => x.sc >= 0.6)
    .sort((a, b) => b.sc - a.sc)
    .filter((x, _, arr) => x.sc >= arr[0].sc * 0.6)
    .slice(0, n)
    .map(({ s, i }) => ({
      uid: "yt:" + s.yt,
      src: "catalog",
      t: s.t,
      a: s.a,
      al: "",
      d: s.d,
      art: thumb(s.yt),
      vid: s.yt,
      i,
      link: "https://www.youtube.com/watch?v=" + s.yt,
      full: true,
    }));
}

/* ---------- unified search ---------- */
const normKey = (t, a) =>
  `${t} ${a}`
    .toLowerCase()
    .replace(/[^\u05d0-\u05eaa-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const PROVIDERS = [
  { id: "catalog", run: async (q) => catalogSearch(q) },
  { id: "yt", run: (q) => ytSearch(q) },
  { id: "audius", run: (q) => audiusSearch(q) },
];

/**
 * Runs every provider in parallel and reports each one as it settles.
 * onStatus(id, state, info, items) — state: loading | ok | empty | error | off
 * Returns the merged, de-duplicated list of full songs only.
 */
async function searchAll(q, onStatus) {
  const seen = new Map();
  const merged = [];
  const runOne = async (p) => {
    if (p.id === "yt" && !YT_KEY_READY) {
      onStatus(p.id, "off", "מקור הווידאו החי כבוי — חסר מפתח ב־.env", []);
      return;
    }
    onStatus(p.id, "loading", "", []);
    try {
      const items = await p.run(q);
      const fresh = [];
      for (const it of items) {
        const k = normKey(it.t, it.a);
        if (!k || seen.has(k)) continue;
        seen.set(k, it.src);
        fresh.push(it);
      }
      merged.push(...fresh);
      onStatus(p.id, fresh.length ? "ok" : "empty", fresh.length ? `${fresh.length} תוצאות` : "אין תוצאות אצל הספק הזה", fresh);
    } catch (e) {
      onStatus(p.id, "error", e.message || "הספק לא הגיב", []);
    }
  };
  await Promise.allSettled(PROVIDERS.map(runOne));
  return merged;
}

let YT_KEY_READY = false;
async function checkProviders() {
  try {
    const d = await req("/api/health", 4000);
    YT_KEY_READY = !!d.youtube;
  } catch {
    YT_KEY_READY = false;
  }
  return YT_KEY_READY;
}
