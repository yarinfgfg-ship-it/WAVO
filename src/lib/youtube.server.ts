// YouTube Data API proxy (port of the old server.py). The key stays on the server.
const API = "https://www.googleapis.com/youtube/v3/";
const TTL = 15 * 60 * 1000;
const cache = new Map<string, { at: number; data: any }>();

const QUOTA_MSG =
  "מכסת החיפושים היומית במקור הווידאו נגמרה. השירים שברשימה הפנימית עובדים כרגיל, ובמחר זה מתאפס.";
const QUOTA_REASONS = new Set(["quotaExceeded", "rateLimitExceeded", "dailyLimitExceeded", "quotaDailyLimitExceeded"]);

export const ytKey = () => (process.env["YOUTUBE_API_KEY"] || "").trim();

export const json = (code: number, obj: unknown) =>
  new Response(JSON.stringify(obj), {
    status: code,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

async function cached(url: string) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  let data: any;
  try {
    const r = await fetch(url);
    data = await r.json();
  } catch (e) {
    data = { error: { message: `Google not reachable: ${e}`, code: -1 } };
  }
  if (!data?.error) cache.set(url, { at: Date.now(), data });
  return data;
}

function isoSecs(t = "") {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(t);
  if (!m) return 0;
  const [d = 0, h = 0, mi = 0, s = 0] = m.slice(1).map((x) => (x ? +x : 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

function googleError(err: any) {
  const reasons = new Set((err?.errors || []).map((e: any) => e?.reason));
  const code = err?.code ?? 500;
  if ([...reasons].some((r) => QUOTA_REASONS.has(r as string)) || code === 403 || code === 429)
    return json(200, { error: { message: QUOTA_MSG, code: 429 } });
  return json(code >= 100 && code <= 599 ? code : 502, { error: { message: err?.message || "google error", code } });
}

async function videos(ids: string[], key: string) {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const url = `${API}videos?part=snippet,contentDetails,status&maxResults=50&id=${ids.slice(i, i + 50).join(",")}&key=${key}`;
    for (const it of (await cached(url)).items || []) {
      const sn = it.snippet, cd = it.contentDetails, st = it.status;
      if (!it.id || !sn || !cd || !st) continue;
      const th = sn.thumbnails || {};
      out.push({
        id: it.id,
        title: sn.title || "",
        channel: sn.channelTitle || "",
        channelId: sn.channelId || "",
        thumb: (th.medium || th.high || th.default || {}).url || "",
        dur: isoSecs(cd.duration),
        embed: !!st.embeddable && st.privacyStatus === "public",
      });
    }
  }
  return out;
}

const ids = (d: any) => (d.items || []).map((x: any) => x?.id?.videoId).filter(Boolean);

// Quota-free fallback: read YouTube's public results page (videos only).
const parseDur = (s = "") => s.split(":").reduce((a, x) => a * 60 + (+x || 0), 0);
export async function scrapeSearch(query: string, max = 40) {
  const hit = cache.get("scrape:" + query);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const r = await fetch(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`,
    { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "he,en" }, signal: AbortSignal.timeout(9000) },
  );
  const m = (await r.text()).match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m?.[1]) return [];
  const out: any[] = [];
  const walk = (o: any) => {
    if (!o || typeof o !== "object" || out.length >= max) return;
    const v = o.videoRenderer;
    if (v && /^[\w-]{11}$/.test(v.videoId || "")) {
      const own = v.ownerText?.runs?.[0];
      out.push({
        id: v.videoId,
        title: v.title?.runs?.map((x: any) => x.text).join("") || "",
        channel: own?.text || "",
        channelId: own?.navigationEndpoint?.browseEndpoint?.browseId || "",
        thumb: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
        dur: parseDur(v.lengthText?.simpleText),
        embed: true,
      });
      return;
    }
    for (const k in o) walk(o[k]);
  };
  walk(JSON.parse(m[1]));
  cache.set("scrape:" + query, { at: Date.now(), data: out });
  return out;
}

/* בלי API אפשר לקרוא את דף הצפייה: ytInitialPlayerResponse מספר אם
   היוצר חסם הטמעה (playableInEmbed) — בדיוק מה שקובע קוד 150 בנגן. */
const videoCache = new Map<string, { at: number; data: any }>();
export async function scrapeVideo(id: string) {
  const hit = videoCache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=he&gl=IL`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "he,en;q=0.8",
      },
      signal: AbortSignal.timeout(9000),
    });
    const m = (await r.text()).match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});/);
    if (!m?.[1]) return null;
    const pr = JSON.parse(m[1]);
    const vd = pr?.videoDetails || {};
    const st = pr?.playabilityStatus || {};
    if (!vd.videoId) return null;
    const item = {
      id: vd.videoId,
      title: vd.title || "",
      channel: vd.author || "",
      channelId: vd.channelId || "",
      thumb: `https://i.ytimg.com/vi/${vd.videoId}/mqdefault.jpg`,
      dur: Number(vd.lengthSeconds) || 0,
      embed: st.status === "OK" && st.playableInEmbed !== false,
    };
    videoCache.set(id, { at: Date.now(), data: item });
    return item;
  } catch {
    return null;
  }
}

/* כשהמכסה או הקצב נגמרים, מפסיקים לבזבז בקשות API ומגישים מהעמוד הציבורי */
let apiBlockedUntil = 0;

export async function handleYt(kind: "search" | "videos" | "channel", request: Request) {
  const key = ytKey();
  const q = new URL(request.url).searchParams;
  const query = (q.get("q") || "").trim().slice(0, 120);
  const fallback = async () => {
    try {
      return json(200, { items: await scrapeSearch(query, Math.min(parseInt(q.get("max") || "20") || 20, 40)) });
    } catch {
      return json(200, { error: { message: QUOTA_MSG, code: 429 } });
    }
  };
  if (kind === "search" && query && (!key || Date.now() < apiBlockedUntil)) return fallback();
  /* סרטונים: playableInEmbed מדף הצפייה הוא מה שקובע קוד 150 בפועל.
     שדה embeddable של ה-API מדווח "מותר" גם על סרטונים שנחסמו בפועל,
     ולכן לרשימות קטנות (השיר הנוכחי והמועמדים) קוראים את דף הצפייה. */
  if (kind === "videos") {
    const list = (q.get("id") || "").split(",").filter((x) => /^[\w-]{11}$/.test(x)).slice(0, 50);
    if (!list.length) return json(200, { items: [] });
    if (!key || list.length <= 12) {
      const scraped = (await Promise.all(list.map((id) => scrapeVideo(id)))).filter(Boolean) as any[];
      if (!key) return json(200, { items: scraped });
      const known = new Map(scraped.map((x) => [x.id, x]));
      const rest = list.filter((id) => !known.has(id));
      const apis = rest.length ? await videos(rest, key) : [];
      return json(200, { items: [...scraped, ...apis] });
    }
    return json(200, { items: await videos(list, key) });
  }
  if (!key) return json(501, { error: { message: "No YOUTUBE_API_KEY configured.", code: 501 } });
  const base = `${API}search?part=snippet&type=video&videoEmbeddable=true&relevanceLanguage=he&key=${key}`;
  let url: string;
  if (kind === "search") {
    if (!query) return json(400, { error: { message: "missing q" } });
    const max = Math.min(parseInt(q.get("max") || "20") || 20, 40);
    url = `${base}&maxResults=${max}&q=${encodeURIComponent(query)}`;
  } else {
    url = `${base}&channelId=${encodeURIComponent(q.get("id") || "")}&maxResults=40&q=${encodeURIComponent(query)}`;
  }
  const data = await cached(url);
  if (data.error && kind === "search") {
    const code = data.error?.code;
    if (code === 403 || code === 429) apiBlockedUntil = Date.now() + 10 * 60 * 1000;
    return fallback();
  }
  if (data.error) return googleError(typeof data.error === "object" ? data.error : { message: String(data.error) });
  const found = ids(data);
  return json(200, { items: found.length ? await videos(found, key) : [] });
}
