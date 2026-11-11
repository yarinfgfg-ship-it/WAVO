const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
const HEART = '<svg class="o" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20.3 5.2 13.9C3.3 12.1 2.6 10.2 2.9 8.4 3.3 6 5.4 4.3 7.9 4.6c1.7.2 3.2 1.2 4.1 2.7.9-1.5 2.4-2.5 4.1-2.7 2.5-.3 4.6 1.4 5 3.8.3 1.8-.4 3.7-2.3 5.5z"/></svg><svg class="f" viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.3 5.2 13.9C3.3 12.1 2.6 10.2 2.9 8.4 3.3 6 5.4 4.3 7.9 4.6c1.7.2 3.2 1.2 4.1 2.7.9-1.5 2.4-2.5 4.1-2.7 2.5-.3 4.6 1.4 5 3.8.3 1.8-.4 3.7-2.3 5.5z"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"/><path d="m8.4 12.3 2.4 2.4 4.8-5" fill="none" stroke="#04122a" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HEART_SOLID = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.3 5.2 13.9C3.3 12.1 2.6 10.2 2.9 8.4 3.3 6 5.4 4.3 7.9 4.6c1.7.2 3.2 1.2 4.1 2.7.9-1.5 2.4-2.5 4.1-2.7 2.5-.3 4.6 1.4 5 3.8.3 1.8-.4 3.7-2.3 5.5z"/></svg>';

const el = (id) => document.getElementById(id);
const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const scroller = el("top"), viewEl = el("view"), stage = el("stage");
const miniCover = el("miniCover"), npTitle = el("npTitle"), npArtist = el("npArtist");
const playingNow = el("playingNow"), toggle = el("toggle");
const fill = el("fill"), bar = el("bar"), curTime = el("curTime"), totTime = el("totTime");
const volBar = el("volBar"), volFill = el("volFill");
const winClose = el("winClose"), winFull = el("winFull"), winHide = el("winHide");

const CHUNK = 60;
const byId = {};
songs.forEach((s, i) => (byId[s.yt] = i));
const artists = [...new Set(songs.map((s) => s.a))];
const artistCount = (a) => songs.filter((s) => s.a === a).length;
const artistList = (a) => songs.map((s, i) => i).filter((i) => songs[i].a === a);
const topArtists = artists.slice().sort((x, y) => artistCount(y) - artistCount(x));

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const localTrack = (i) => {
  const s = songs[i];
  return { uid: "yt:" + s.yt, src: "catalog", i, t: s.t, a: s.a, al: "", d: s.d, art: thumb(s.yt), vid: s.yt, link: "https://www.youtube.com/watch?v=" + s.yt, full: true };
};

/* history + favourites survive across providers */
let history = load("wavo.history", []).filter((t) => t && t.uid);
if (!history.length) history = load("yarin.history", []).map((id) => (byId[id] == null ? null : localTrack(byId[id]))).filter(Boolean);
let likes = new Set(load("wavo.likes", []).filter((x) => typeof x === "string"));
if (!likes.size) load("yarin.likes", []).forEach((id) => likes.add("yt:" + id));
let savedTracks = {};
try { savedTracks = JSON.parse(localStorage.getItem("wavo.saved") || "{}"); } catch { savedTracks = {}; }
const likedTracks = () => [...likes].map((uid) => history.find((t) => t.uid === uid) || savedTracks[uid] || (byId[uid.slice(3)] != null ? localTrack(byId[uid.slice(3)]) : null)).filter(Boolean);

let track = null, current = -1, playing = false, elapsed = 0, volume = 70;
let shuffle = false, repeat = false, yt = null, engine = null;
let want = null, wantAuto = false, apiTried = false, retried = false, nudge = 0, nudgeTimer = 0;
const isTouch = (typeof window !== "undefined" && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0));
let playQueue = [], qPos = -1;
let triedUids = new Set(), triedKey = "", autoSwitch = false;
let queue = songs.map((_, i) => i), drawn = 0, rowMap = new Map(), listBox = null;
let libQuery = "", searchToken = 0;

const audioEl = new Audio();
audioEl.preload = "auto";

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const songsWord = (n) => (n === 1 ? "Ã—Â©Ã—â„¢Ã—Â¨ Ã—ÂÃ—â€”Ã—â€œ" : `${n} Ã—Â©Ã—â„¢Ã—Â¨Ã—â„¢Ã—Â`);
const duration = () => (engine === "audio" ? audioEl.duration || track?.d || 0 : (yt && yt.getDuration ? yt.getDuration() : track?.d) || 0);
const nowOf = () => (engine === "audio" ? audioEl.currentTime : (yt && yt.getCurrentTime ? yt.getCurrentTime() : elapsed));
const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Ã—Å“Ã—â„¢Ã—Å“Ã—â€ Ã—ËœÃ—â€¢Ã—â€˜" : h < 12 ? "Ã—â€˜Ã—â€¢Ã—Â§Ã—Â¨ Ã—ËœÃ—â€¢Ã—â€˜" : h < 17 ? "Ã—Â¦Ã—â€Ã—Â¨Ã—â„¢Ã—â„¢Ã—Â Ã—ËœÃ—â€¢Ã—â€˜Ã—â„¢Ã—Â" : h < 21 ? "Ã—Â¢Ã—Â¨Ã—â€˜ Ã—ËœÃ—â€¢Ã—â€˜" : "Ã—Å“Ã—â„¢Ã—Å“Ã—â€ Ã—ËœÃ—â€¢Ã—â€˜";
};

miniCover.src = thumb(songs[0].yt);

/* ---------- Ã—Â©Ã—â€¢Ã—Â¨Ã—â€¢Ã—Âª ---------- */
function rowShell(tr, pos) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.uid = tr.uid;
  row._tr = tr;
  row.innerHTML = `
    <span class="num"><span class="n">${pos + 1}</span><span class="eq"><i></i><i></i><i></i></span></span>
    <div class="art"><img loading="lazy" alt="" src="${h(tr.art)}"><span class="go">${PLAY}</span></div>
    <div><p class="song-title"></p><p class="song-sub"></p></div>
    <span class="row-album"></span>
    <span class="row-time"></span>
    <button class="icon-btn sm heart" aria-label="Ã—ÂÃ—â€Ã—â€˜"></button>`;
  row.querySelector(".song-title").textContent = tr.t;
  row.querySelector(".song-sub").textContent = tr.al ? `${tr.a} Ã‚Â· ${tr.al}` : tr.a;
  row.querySelector(".row-album").textContent = tr.a;
  row.querySelector(".row-time").textContent = tr.d ? mmss(tr.d) : "Ã¢â‚¬â€";
  const heart = row.querySelector(".heart");
  heart.innerHTML = HEART;
  heart.dataset.id = tr.uid;
  heart.classList.toggle("on", likes.has(tr.uid));
  heart.addEventListener("click", (e) => { e.stopPropagation(); like(tr); });
  row.addEventListener("click", () => playTrack(tr, true));
  if (track && track.uid === tr.uid) row.classList.add("playing");
  return row;
}

function buildRow(i, pos) {
  const row = rowShell(localTrack(i), pos ?? i);
  listBox.appendChild(row);
  rowMap.set(i, row);
}

function drawMore() {
  const stop = Math.min(drawn + CHUNK, queue.length);
  for (let p = drawn; p < stop; p++) buildRow(queue[p], p);
  drawn = stop;
  const more = el("more");
  if (more) {
    more.hidden = drawn >= queue.length;
    more.textContent = `Ã—ËœÃ—Â¢Ã—Å¸ Ã—Â¢Ã—â€¢Ã—â€œ (${queue.length - drawn})`;
  }
}

function mountList(indices, withMore = true) {
  queue = indices;
  drawn = 0;
  rowMap.clear();
  listBox = document.createElement("div");
  listBox.className = "rows";
  viewEl.appendChild(listBox);
  if (!indices.length) {
    const empty = document.createElement("p");
    empty.className = "no-results on";
    empty.textContent = "Ã—ÂÃ—â„¢Ã—Å¸ Ã—Å¾Ã—â€ Ã—Å“Ã—â€Ã—Â¦Ã—â„¢Ã—â€™ Ã—â€ºÃ—ÂÃ—Å¸";
    viewEl.appendChild(empty);
  }
  if (withMore) {
    const more = document.createElement("button");
    more.className = "more";
    more.id = "more";
    more.hidden = true;
    more.addEventListener("click", drawMore);
    viewEl.appendChild(more);
  }
  playQueue = indices.map((i) => localTrack(i));
  qPos = track ? playQueue.findIndex((t) => t.uid === track.uid) : -1;
  drawMore();
}

scroller.addEventListener("scroll", () => {
  if (drawn >= queue.length || !listBox) return;
  if (scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 600) drawMore();
});

/* ---------- Ã—Â¤Ã—Å“Ã—â„¢Ã—â„¢Ã—Å“Ã—â„¢Ã—Â¡Ã—ËœÃ—â„¢Ã—Â Ã—â€˜Ã—Â¦Ã—â€œ ---------- */
function playlistItems() {
  const items = [
    { n: "Ã—â€ºÃ—Å“ Ã—â€Ã—Â©Ã—â„¢Ã—Â¨Ã—â„¢Ã—Â", s: `Ã—Â¤Ã—Å“Ã—â„¢Ã—â„¢Ã—Å“Ã—â„¢Ã—Â¡Ã—Ëœ Ã‚Â· ${songsWord(songs.length)}`, h: "#/library", art: thumb(songs[0].yt) },
    { n: "Ã—Â©Ã—â„¢Ã—Â¨Ã—â„¢Ã—Â Ã—Â©Ã—ÂÃ—â€Ã—â€˜Ã—ÂªÃ—â„¢", s: `Ã—Â¤Ã—Å“Ã—â„¢Ã—â„¢Ã—Å“Ã—â„¢Ã—Â¡Ã—Ëœ Ã‚Â· ${songsWord(likes.size)}`, h: "#/liked", heart: true },
  ];
  topArtists.forEach((a) =>
    items.push({ n: a, s: `Ã—ÂÃ—Å¾Ã—Å¸ Ã‚Â· ${songsWord(artistCount(a))}`, h: `#/artist/${encodeURIComponent(a)}`, art: thumb(songs.find((x) => x.a === a).yt) })
  );
  return items;
}

function renderPlaylists() {
  const box = el("playlists");
  box.innerHTML = "";
  const q = libQuery.trim();
  const hash = location.hash || "#/home";
  playlistItems()
    .filter((it) => !q || it.n.includes(q))
    .forEach((it) => {
      const row = document.createElement("a");
      row.className = "prow" + (it.heart ? " heart-p" : "") + (it.h === hash ? " on" : "");
      row.href = it.h;
      row.innerHTML = `${it.heart ? `<span class="pheart">${HEART_SOLID}</span>` : `<img loading="lazy" alt="" src="${h(it.art)}">`}
        <span><span class="prow-name"></span><span class="prow-sub"></span></span>`;
      row.querySelector(".prow-name").textContent = it.n;
      row.querySelector(".prow-sub").textContent = it.s;
      row.addEventListener("click", closeMenu);
      box.appendChild(row);
    });
}

el("libFilter").addEventListener("input", (e) => {
  libQuery = e.target.value;
  renderPlaylists();
});

/* ---------- Ã—â€ºÃ—Â¨Ã—ËœÃ—â„¢Ã—Â¡Ã—â„¢Ã—Â ---------- */
function section(title, sub) {
  const wrap = document.createElement("section");
  wrap.className = "sec";
  wrap.innerHTML = `<div class="sec-head"><h2></h2>${sub ? `<span>${sub}</span>` : ""}</div>`;
  wrap.querySelector("h2").textContent = title;
  viewEl.appendChild(wrap);
  return wrap;
}

function tile(tr, label) {
  const t = document.createElement("article");
  t.className = "tile";
  t._tr = tr;
  t.innerHTML = `<div class="tile-art"><img class="tile-cover" loading="lazy" alt="" src="${h(tr.art)}"><span class="tile-fab">${PLAY}</span></div><h3></h3><p></p>`;
  t.querySelector("h3").textContent = label ?? tr.t;
  t.querySelector("p").textContent = tr.a;
  t.addEventListener("click", () => playTrack(tr, true));
  return t;
}

function wideCard(tr) {
  const c = document.createElement("article");
  c.className = "wcard";
  c._tr = tr;
  c.innerHTML = `<img loading="lazy" alt="" src="${h(tr.art)}"><p></p><span class="tile-fab">${PLAY}</span>`;
  c.querySelector("p").textContent = tr.t;
  c.addEventListener("click", () => playTrack(tr, true));
  return c;
}

function artistCard(a) {
  const s = songs.find((x) => x.a === a);
  const c = document.createElement("article");
  c.className = "btile";
  c.innerHTML = `<img loading="lazy" alt="" src="${thumb(s.yt)}"><h3></h3>`;
  c.querySelector("h3").textContent = a;
  c.addEventListener("click", () => (location.hash = `#/artist/${encodeURIComponent(a)}`));
  return c;
}

/* ---------- Ã—ÂªÃ—Â¦Ã—â€¢Ã—â€™Ã—â€¢Ã—Âª ---------- */
function recommended(n) {
  const seed = {};
  history.forEach((t) => { if (t && t.a) seed[t.a] = (seed[t.a] || 0) + 2; });
  if (!Object.keys(seed).length) topArtists.slice(0, 6).forEach((a) => (seed[a] = 1));
  const seen = new Set(history.map((t) => t.uid));
  const fresh = songs.map((s, i) => i).filter((i) => !seen.has("yt:" + songs[i].yt));
  const related = fresh
    .filter((i) => seed[songs[i].a])
    .map((i) => ({ i, w: seed[songs[i].a] * 100 + Math.random() * 100 }))
    .sort((x, y) => y.w - x.w)
    .map((p) => p.i);
  return related.concat(fresh.filter((i) => !seed[songs[i].a])).slice(0, n).map(localTrack);
}

function renderHome() {
  viewEl.innerHTML = `<h1 class="greet">${greeting()}</h1>`;

  if (history.length) {
    const cont = section("Ã—â€Ã—Å¾Ã—Â©Ã—Å¡ Ã—â€Ã—ÂÃ—â€“Ã—Â Ã—â€");
    const row = document.createElement("div");
    row.className = "wrow";
    history.slice(0, 6).forEach((t) => row.appendChild(wideCard(t)));
    cont.appendChild(row);
  }

  const rec = section("Ã—Å¾Ã—â€¢Ã—Å¾Ã—Å“Ã—Â¥ Ã—â€˜Ã—Â©Ã—â€˜Ã—â„¢Ã—Å“Ã—Å¡", history.length ? "Ã—Å“Ã—Â¤Ã—â„¢ Ã—Å¾Ã—â€ Ã—Â©Ã—Â©Ã—Å¾Ã—Â¢Ã—Âª" : "Ã—Å“Ã—â€”Ã—Â¥ Ã—Â¢Ã—Å“ Ã—Â©Ã—â„¢Ã—Â¨ Ã—â€ºÃ—â€œÃ—â„¢ Ã—Å“Ã—â€Ã—ÂªÃ—â€”Ã—â„¢Ã—Å“");
  const grid = document.createElement("div");
  grid.className = "grid";
  recommended(8).forEach((t) => grid.appendChild(tile(t)));
  rec.appendChild(grid);

  const pop = section("Ã—ÂÃ—Å¾Ã—Â Ã—â„¢Ã—Â");
  const pg = document.createElement("div");
  pg.className = "browse";
  topArtists.slice(0, 8).forEach((a) => pg.appendChild(artistCard(a)));
  pop.appendChild(pg);

  const all = section("Ã—â€ºÃ—Å“ Ã—â€Ã—Â©Ã—â„¢Ã—Â¨Ã—â„¢Ã—Â");
  const link = document.createElement("a");
  link.className = "link-all";
  link.href = "#/library";
  link.textContent = `Ã—Å“Ã—â€ºÃ—Å“ ${songs.length} Ã—â€Ã—Â©Ã—â„¢Ã—Â¨Ã—â„¢Ã—Â Ã—â€˜Ã—Â¡Ã—Â¤Ã—Â¨Ã—â„¢Ã—â„¢Ã—â€ Ã¢â€ Â`;
  all.appendChild(link);
}

function renderSearch() {
  const q = el("search").value.trim();
  viewEl.innerHTML = `<h1 class="greet">Ã—â€”Ã—â„¢Ã—Â¤Ã—â€¢Ã—Â©</h1>`;
  if (!q) {
    const browse = section("Ã—Â¢Ã—â„¢Ã—â„¢Ã—Å¸ Ã—Å“Ã—Â¤Ã—â„¢ Ã—ÂÃ—Å¾Ã—Å¸");
    const grid = document.createElement("div");
    grid.className = "browse";
    topArtists.forEach((a) => grid.appendChild(artistCard(a)));
    browse.appendChild(grid);
    return;
  }

  const token = ++searchToken;
  const box = document.createElement("div");
  box.className = "rows";
  viewEl.appendChild(box);
  const line = document.createElement("p");
  line.className = "srcline on";
  line.textContent = "Ã—Å¾Ã—â€”Ã—Â¤Ã—Â© Ã—â€˜Ã—â€ºÃ—Å“ Ã—â€Ã—Å¾Ã—Â§Ã—â€¢Ã—Â¨Ã—â€¢Ã—ÂªÃ¢â‚¬Â¦";
  viewEl.appendChild(line);

  let count = 0;
  const okSrc = new Set();
  playQueue = [];
  qPos = -1;

  searchAll(q, (id, state, info, items) => {
    if (token !== searchToken) return;
    if (state === "ok" && items.length) {
      const from = count;
      count += items.length;
      okSrc.add(id);
      items.forEach((tr, n) => { box.appendChild(rowShell(tr, from + n)); playQueue.push(tr); });
    }
    if (count) line.textContent = `${songsWord(count)} Ã—Å¾Ã–Â¾${okSrc.size} Ã—Å¾Ã—Â§Ã—â€¢Ã—Â¨Ã—â€¢Ã—Âª`;
  }).then(() => {
    if (token !== searchToken) return;
    if (!count) {
      box.remove();
      const p = document.createElement("p");
      p.className = "no-results on";
      p.textContent = "Ã—ÂÃ—Â£ Ã—Å¾Ã—Â§Ã—â€¢Ã—Â¨ Ã—Å“Ã—Â Ã—Å¾Ã—Â¦Ã—Â Ã—Â©Ã—â„¢Ã—Â¨ Ã—Â©Ã—ÂÃ—Â¤Ã—Â©Ã—Â¨ Ã—Å“Ã—Â Ã—â€™Ã—Å¸. Ã—Â Ã—Â¡Ã—â€ Ã—Â©Ã—Â Ã—Â©Ã—Å“ Ã—ÂÃ—Å¾Ã—Å¸ Ã—ÂÃ—â€¢ Ã—â€ºÃ—â€¢Ã—ÂªÃ—Â¨Ã—Âª Ã—â€˜Ã—ÂÃ—Â Ã—â€™Ã—Å“Ã—â„¢Ã—Âª, Ã—ÂÃ—â€¢ Ã—â€˜Ã—Å“Ã—â„¢ Ã—Å¾Ã—â„¢Ã—Å“Ã—â„¢Ã—Â Ã—â€ºÃ—Å¾Ã—â€¢ 'Ã—Â§Ã—Å“Ã—â„¢Ã—Â¤'.";
      viewEl.appendChild(p);
      line.textContent = "";
    }
    qPos = track ? playQueue.findIndex((t) => t.uid === track.uid) : -1;
  });
}

function headRow() {
  const head = document.createElement("div");
  head.className = "row row-head";
  head.innerHTML = "<span>#</span><span></span><span>Ã—â€ºÃ—â€¢Ã—ÂªÃ—Â¨Ã—Âª</span><span>Ã—ÂÃ—Å¾Ã—Å¸</span><span>Ã—â€“Ã—Å¾Ã—Å¸</span><span></span>";
  return head;
}

function renderLibrary() {
  viewEl.innerHTML = `<h1 class="greet">Ã—â€Ã—Â¡Ã—Â¤Ã—Â¨Ã—â„¢Ã—â„¢Ã—â€ Ã—Â©Ã—Å“Ã—Å¡</h1>`;
  viewEl.appendChild(headRow());
  mountList(songs.map((_, i) => i));
}

function renderLiked() {
  viewEl.innerHTML = `<h1 class="greet">Ã—Â©Ã—â„¢Ã—Â¨Ã—â„¢Ã—Â Ã—Â©Ã—ÂÃ—â€Ã—â€˜Ã—ÂªÃ—â„¢</h1>`;
  const list = likedTracks();
  if (list.length) {
    viewEl.appendChild(headRow());
    const box = document.createElement("div");
    box.className = "rows";
    viewEl.appendChild(box);
    list.forEach((tr, n) => box.appendChild(rowShell(tr, n)));
    playQueue = list.slice();
    qPos = track ? playQueue.findIndex((t) => t.uid === track.uid) : -1;
    queue = [];
    drawn = 0;
    return;
  }
  const p = document.createElement("p");
  p.className = "no-results on";
  p.textContent = "Ã—Â¢Ã—â€œÃ—â„¢Ã—â„¢Ã—Å¸ Ã—Å“Ã—Â Ã—ÂÃ—â€Ã—â€˜Ã—Âª Ã—Â©Ã—â„¢Ã—Â¨Ã—â„¢Ã—Â Ã¢â‚¬â€ Ã—Å“Ã—â€”Ã—Â¥ Ã—Â¢Ã—Å“ Ã—â€Ã—Å“Ã—â€˜ Ã—â€˜Ã—â€ºÃ—Å“ Ã—Â©Ã—â„¢Ã—Â¨";
  viewEl.appendChild(p);
}

function renderArtist(name) {
  const idx = artistList(name);
  if (!idx.length) {
    viewEl.innerHTML = `<h1 class="greet">${h(name)}</h1>`;
    const p = document.createElement("p");
    p.className = "no-results on";
    p.textContent = "Ã—Å“Ã—Â Ã—Å¾Ã—Â¦Ã—ÂÃ—Â Ã—â€¢ Ã—Â©Ã—â„¢Ã—Â¨Ã—â„¢Ã—Â Ã—Â©Ã—Å“ Ã—â€Ã—ÂÃ—Å¾Ã—Å¸ Ã—â€Ã—â€“Ã—â€ Ã—â€˜Ã—Â¡Ã—Â¤Ã—Â¨Ã—â„¢Ã—â„¢Ã—â€";
    viewEl.appendChild(p);
    return;
  }
  const s = songs[idx[0]];
  viewEl.innerHTML = `
    <section class="ahero">
      <img alt="" src="${thumb(s.yt)}">
      <div><p class="kind">Ã—Â¤Ã—Å“Ã—â„¢Ã—â„¢Ã—Å“Ã—â„¢Ã—Â¡Ã—Ëœ Ã‚Â· Ã—ÂÃ—Å¾Ã—Å¸</p><h1></h1>
      <p class="desc">${songsWord(idx.length)} Ã—â€“Ã—Å¾Ã—â„¢Ã—Â Ã—â„¢Ã—Â Ã‚Â· ${Math.round(idx.reduce((n, i) => n + songs[i].d, 0) / 60)} Ã—â€œÃ—Â§Ã—â€¢Ã—Âª Ã‚Â· Ã—â€¢Ã—â„¢Ã—â€œÃ—ÂÃ—â€¢ Ã—Â¨Ã—Â©Ã—Å¾Ã—â„¢</p>
      <button class="play-big" id="playArtist">${PLAY}</button></div>
    </section>`;
  viewEl.querySelector("h1").textContent = name;
  el("playArtist").addEventListener("click", () => playTrack(localTrack(idx[0]), true));
  viewEl.appendChild(headRow());
  mountList(idx);
}

/* ---------- Ã—Å“Ã—â€¢Ã—â€” Ã—Â Ã—â„¢Ã—â€™Ã—â€¢Ã—Å¸ ---------- */
function relatedTracks(tr) {
  if (tr.src === "catalog") {
    return songs.map((_, i) => i).filter((i) => songs[i].a === tr.a && i !== tr.i).slice(0, 6).map(localTrack);
  }
  return [];
}

function renderNp(tr) {
  if (!tr) return;
  el("npBased").textContent = `Ã—Å¾Ã—â€˜Ã—â€¢Ã—Â¡Ã—Â¡ Ã—Â¢Ã—Å“ ${tr.t}`;
  const box = el("npBody");
  const kind = tr.src === "catalog" || tr.src === "yt" ? "Ã—â€¢Ã—â„¢Ã—â€œÃ—ÂÃ—â€¢ Ã—Â¨Ã—Â©Ã—Å¾Ã—â„¢" : "Ã—â€Ã—â€“Ã—Â¨Ã—Å¾Ã—â€ Ã—Å¾Ã—Å“Ã—ÂÃ—â€";
  box.innerHTML = `
    <div class="np-art"><img alt="" src="${h(tr.art)}"><button class="np-fab" id="npFab" aria-label="Ã—â€Ã—Â¤Ã—Â¢Ã—Å“ / Ã—â€Ã—Â©Ã—â€Ã—â€">${toggle.innerHTML}</button></div>
    <p class="np-kind">${kind}</p>
    <h3 class="np-t"></h3>
    <p class="np-a"><span class="np-by"></span>${tr.src === "catalog" ? `<span class="badge" title="Ã—â€¢Ã—â„¢Ã—â€œÃ—ÂÃ—â€¢ Ã—Å¾Ã—â€Ã—Â¢Ã—Â¨Ã—â€¢Ã—Â¥ Ã—â€Ã—Â¨Ã—Â©Ã—Å¾Ã—â„¢ Ã—Â©Ã—Å“ Ã—â€Ã—ÂÃ—Å¾Ã—Å¸">${CHECK}</span>` : ""}</p>
    <p class="np-meta"></p>
    <div class="np-acts">
      <button class="icon-btn sm heart" id="npHeart" aria-label="Ã—ÂÃ—â€Ã—â€˜"></button>
      
    </div>
    <div id="npMore"></div>`;
  box.querySelector(".np-t").textContent = tr.t;
  box.querySelector(".np-by").textContent = tr.a;
  box.querySelector(".np-meta").textContent = tr.src === "catalog"
    ? `${songsWord(artistCount(tr.a))} Ã—Â©Ã—Å“ ${tr.a} Ã—â€˜Ã—Â¡Ã—Â¤Ã—Â¨Ã—â„¢Ã—â„¢Ã—â€ Ã‚Â· ${tr.d ? mmss(tr.d) : "Ã¢â‚¬â€"} Ã‚Â· Ã—â€¢Ã—â„¢Ã—â€œÃ—ÂÃ—â€¢ Ã—Â¨Ã—Â©Ã—Å¾Ã—â„¢`
    : `${tr.al ? tr.al + " Ã‚Â· " : ""}${tr.d ? mmss(tr.d) : "Ã¢â‚¬â€"}`;

  const heart = box.querySelector("#npHeart");
  heart.innerHTML = HEART;
  heart.dataset.id = tr.uid;
  heart.classList.toggle("on", likes.has(tr.uid));
  heart.addEventListener("click", () => like(tr));
  box.querySelector("#npFab").addEventListener("click", transport);

  const more = box.querySelector("#npMore");
  if (tr.src === "catalog") {
    more.innerHTML = `<h4 class="np-h">Ã—Â¢Ã—â€¢Ã—â€œ Ã—Â©Ã—Å“ ${h(tr.a)}</h4><div class="np-list"></div>`;
    const list = more.querySelector(".np-list");
    relatedTracks(tr).concat(recommended(10 - Math.min(6, relatedTracks(tr).length)))
      .slice(0, 10)
      .forEach((t) => list.appendChild(npRow(t)));
  } else if (tr.src === "audius") {
    more.innerHTML = `<h4 class="np-h">Ã—Â¢Ã—â€¢Ã—â€œ Ã—Â©Ã—Å“ ${h(tr.a)}</h4><p class="np-load">Ã—ËœÃ—â€¢Ã—Â¢Ã—Å¸Ã¢â‚¬Â¦</p>`;
    audiusSearch(tr.a, 8).then((items) => {
      if (!track || track.uid !== tr.uid) return;
      more.querySelector(".np-load").remove();
      const l = document.createElement("div");
      l.className = "np-list";
      more.appendChild(l);
      items.filter((t) => t.uid !== tr.uid).slice(0, 8).forEach((t) => l.appendChild(npRow(t)));
      if (!l.children.length) more.insertAdjacentHTML("beforeend", `<p class="np-note">Ã—ÂÃ—â„¢Ã—Å¸ Ã—Â¢Ã—â€¢Ã—â€œ Ã—Â©Ã—â„¢Ã—Â¨Ã—â„¢Ã—Â Ã—Â©Ã—Å“ Ã—â€Ã—ÂÃ—Å¾Ã—Å¸ Ã—â€Ã—â€“Ã—â€ Ã—â€“Ã—Å¾Ã—â„¢Ã—Â Ã—â„¢Ã—Â Ã—Å“Ã—â€Ã—Â©Ã—Å¾Ã—Â¢Ã—â€</p>`);
    }).catch(() => { more.querySelector(".np-load").textContent = "Ã—Å“Ã—Â Ã—â€Ã—Â¦Ã—Å“Ã—â€”Ã—Â Ã—â€¢ Ã—Å“Ã—Å¾Ã—Â©Ã—â€¢Ã—Å¡ Ã—Â¢Ã—â€¢Ã—â€œ Ã—Â©Ã—â„¢Ã—Â¨Ã—â„¢Ã—Â Ã—Å¾Ã—â€Ã—Â¡Ã—Â¤Ã—Â§"; });
  }
}

function npRow(tr) {
  const r = document.createElement("div");
  r.className = "nrow";
  r._tr = tr;
  r.innerHTML = `<img loading="lazy" alt="" src="${h(tr.art)}"><span><b></b><i></i></span><em></em>`;
  r.querySelector("b").textContent = tr.t;
  r.querySelector("i").textContent = tr.al ? `${tr.a} Ã‚Â· ${tr.al}` : tr.a;
  r.querySelector("em").textContent = tr.d ? mmss(tr.d) : "";
  r.addEventListener("click", () => playTrack(tr, true));
  return r;
}

function openNp(on) {
  if (on && !track) return;
  document.body.classList.toggle("np-open", on);
  el("npBtn").classList.toggle("on", on);
}

el("npClose").addEventListener("click", () => openNp(false));
el("npBtn").addEventListener("click", () => openNp(!document.body.classList.contains("np-open")));

/* ---------- Ã—Â Ã—â„¢Ã—â€¢Ã—â€¢Ã—Ëœ ---------- */
function route() {
  const h = (location.hash || "#/home").split("?")[0];
  const [, name, arg] = h.split("/");
  viewEl.dataset.view = name === "artist" ? "library" : name || "home";
  document.querySelectorAll(".rail-btn").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === h));
  scroller.scrollTop = 0;
  listBox = null;
  queue = [];
  drawn = 0;
  rowMap.clear();
  searchToken++;
  if (name === "search") renderSearch();
  else if (name === "library") renderLibrary();
  else if (name === "liked") renderLiked();
  else if (name === "artist") renderArtist(decodeURIComponent(arg || ""));
  else renderHome();
  renderPlaylists();
}

window.addEventListener("hashchange", () => { if (matchMedia("(max-width: 900px)").matches) openNp(false); route(); });
el("back").addEventListener("click", () => window.history.back());
el("fwd").addEventListener("click", () => window.history.forward());

/* ---------- Ã—Å¾Ã—Â Ã—â€¢Ã—Â¢Ã—â„¢ Ã—Â Ã—â„¢Ã—â€™Ã—â€¢Ã—Å¸ ---------- */
function playTrack(tr, start) {
  if (!tr) return;
  if (!autoSwitch) { triedUids = new Set(); triedKey = ""; altPlan = null; }
  autoSwitch = false;
  track = tr;
  current = tr.src === "catalog" ? tr.i : -1;
  elapsed = 0;
  playing = start;
  document.querySelectorAll(".row.playing").forEach((r) => r.classList.toggle("playing", r.dataset.uid === tr.uid));
  const row = document.querySelector(`.row[data-uid="${CSS.escape(tr.uid)}"]`);
  if (row) row.classList.add("playing");
  miniCover.src = tr.art;
  npTitle.textContent = tr.t;
  npArtist.textContent = tr.a;
  playingNow.textContent = `Ã—Å¾Ã—Â Ã—â€™Ã—Å¸: ${tr.t} Ã¢â‚¬â€ ${tr.a}`;
  totTime.textContent = tr.d ? mmss(tr.d) : "0:00";
  fill.style.width = "0%";
  setPlaying(start);
  pushHistory(tr);
  syncLike();
  stage.classList.add("on");
  renderNp(tr);
  openNp(true);
  qPos = playQueue.findIndex((t) => t.uid === tr.uid);
  if (tr.src === "audius") playAudio(tr, start);
  else playYt(tr, start);
}

function playYt(tr, start) {
  engine = "yt";
  audioEl.pause();
  if (!el("ytPlayer")) {
    stage.classList.remove("note");
    stage.innerHTML = '<div class="frame"><div id="ytPlayer"></div></div>';
    yt = null;
  }  loadYt(tr.vid, start);
  /* Ã—â€˜Ã—â€œÃ—â„¢Ã—Â§Ã—â€ Ã—Å¾Ã—Â§Ã—â€œÃ—â„¢Ã—Å¾Ã—â€: Ã—ÂÃ—Â Ã—â€Ã—â„¢Ã—â€¢Ã—Â¦Ã—Â¨ Ã—â€”Ã—Â¡Ã—Â Ã—â€Ã—ËœÃ—Å¾Ã—Â¢Ã—â€ Ã¢â‚¬â€ Ã—Å¾Ã—â€”Ã—Å“Ã—â„¢Ã—Â¤Ã—â„¢Ã—Â Ã—Å¾Ã—Â§Ã—â€¢Ã—Â¨ Ã—Å“Ã—Â¤Ã—Â Ã—â„¢ Ã—Â©Ã—â€Ã—Â©Ã—â€™Ã—â„¢Ã—ÂÃ—â€ Ã—Â§Ã—â€¢Ã—Â¤Ã—Â¦Ã—Âª */
  if (tr.vid && typeof ytEmbedStatus === "function") {
    const uid = tr.uid;
    ytEmbedStatus([tr.vid])
      .then((status) => {
        if (status.get(tr.vid) !== false) return;
        if (!track || track.uid !== uid || engine !== "yt") return;
        tryOtherSource(track, 150);
      })
      .catch(() => {});
  }
}



function playAudio(tr, start) {
  engine = "audio";
  yt = null;
  stage.classList.remove("note");
  stage.innerHTML = `
    <div class="audcard">
      <img alt="" src="${h(tr.art)}">
      <div class="audmeta">
        <p class="audkind">${tr.full ? "Ã—â€Ã—â€“Ã—Â¨Ã—Å¾Ã—â€ Ã—Å¾Ã—Å“Ã—ÂÃ—â€" : "Ã—ÂªÃ—Â§Ã—â€œÃ—â„¢Ã—Å¸"}${tr.genre ? " Ã‚Â· " + tr.genre : ""}</p>
        <h3></h3><p></p>
        <span class="audtag ok">Ã—Â©Ã—â„¢Ã—Â¨ Ã—Å¾Ã—Å“Ã—Â Ã‚Â· Ã—â€Ã—â€“Ã—Â¨Ã—Å¾Ã—â€ Ã—â„¢Ã—Â©Ã—â„¢Ã—Â¨Ã—â€</span>
      </div>
      <span class="audspin" id="audSpin"></span>
    </div>`;
  stage.querySelector("h3").textContent = tr.t;
  stage.querySelector(".audmeta p:not(.audkind)").textContent = tr.a;
  audioEl.src = tr.stream;
  audioEl.volume = volume / 100;
  if (start) {
    spin(true);
    audioEl.play().catch((e) => audioFail(tr, e));
  }
}

function spin(on) {
  const s = el("audSpin");
  if (s) s.classList.toggle("on", on);
}

function audioFail(tr, e) {
  if (e && e.name === "AbortError") return;
  spin(false);
  setPlaying(false);
  stage.classList.add("note");
  stage.innerHTML = `<p class="notice">Ã—â€Ã—â€Ã—â€“Ã—Â¨Ã—Å¾Ã—â€ Ã—Å“Ã—Â Ã—Â¢Ã—â€˜Ã—â€œÃ—â€ Ã¢â‚¬â€ Ã—â„¢Ã—â„¢Ã—ÂªÃ—â€ºÃ—Å¸ Ã—Â©Ã—â€Ã—Â©Ã—â„¢Ã—Â¨ Ã—â€Ã—â€¢Ã—Â¡Ã—Â¨ Ã—ÂÃ—â€¢ Ã—Â©Ã—â€Ã—â€œÃ—Â¤Ã—â€œÃ—Â¤Ã—Å¸ Ã—â€”Ã—Â¡Ã—Â Ã—ÂÃ—Âª Ã—â€Ã—â€Ã—Â©Ã—Å¾Ã—Â¢Ã—â€ Ã—â€Ã—Â¢Ã—Â¦Ã—Å¾Ã—â„¢Ã—Âª. Ã—Â Ã—Â¡Ã—â€¢ Ã—Å“Ã—Å“Ã—â€”Ã—â€¢Ã—Â¥ Ã—Â¢Ã—Å“ Ã—â€Ã—Â©Ã—â„¢Ã—Â¨ Ã—Â©Ã—â€¢Ã—â€˜.
    </p>`;
}

audioEl.addEventListener("playing", () => { skipBudget = 6; spin(false); setPlaying(true); totTime.textContent = mmss(duration()); });
audioEl.addEventListener("pause", () => setPlaying(false));
audioEl.addEventListener("waiting", () => spin(true));
audioEl.addEventListener("ended", () => (repeat ? playTrack(track, true) : step(1)));
audioEl.addEventListener("error", () => track && audioFail(track));

function pushHistory(tr) {
  history = [tr, ...history.filter((t) => t.uid !== tr.uid)].slice(0, 24);
  save("wavo.history", history);
}

function like(tr, btn) {
  const id = tr ? tr.uid : null;
  if (!id) return;
  likes.has(id) ? likes.delete(id) : likes.add(id);
  if (tr.src !== "catalog") {
    if (likes.has(id)) savedTracks[id] = tr;
    else delete savedTracks[id];
    save("wavo.saved", savedTracks);
  }
  save("wavo.likes", [...likes]);
  document.querySelectorAll(`.heart[data-id="${CSS.escape(id)}"]`).forEach((b) => b.classList.toggle("on", likes.has(id)));
  if (btn) btn.classList.toggle("on", likes.has(id));
  syncLike();
  renderPlaylists();
}

function syncLike() {
  const b = el("npLike");
  if (track) b.classList.toggle("on", likes.has(track.uid));
}

function setPlaying(on) {
  playing = on;
  document.body.classList.toggle("is-playing", on);
  toggle.setAttribute("aria-label", on ? "Ã—â€Ã—Â©Ã—â€Ã—â€" : "Ã—â€Ã—Â¤Ã—Â¢Ã—Å“");
}

function loadYt(id, auto) {
  if (location.protocol === "file:") return offline(id);
  stage.classList.remove("note");
  if (!el("ytPlayer")) {
    stage.innerHTML = '<div class="frame"><div id="ytPlayer"></div></div>';
    yt = null;
  }
  want = id; wantAuto = auto; retried = false; hostFlip = false;
  if (window.YT && YT.Player) return startApi();
  if (apiTried && !apiFailed) return; /* still loading: onYouTubeIframeAPIReady starts it */
  if (apiTried) {
    stage.innerHTML = '<div class="frame"></div>';
    yt = null;
    return plainEmbed();
  }
  preloadYtApi();
}

/* Load the YouTube player library at startup so the first tap plays right away
   (browsers only allow sound when playback starts close to the tap). */
let apiFailed = false;
function preloadYtApi() {
  if (apiTried || location.protocol === "file:") return;
  apiTried = true;
  window.onYouTubeIframeAPIReady = () => { if (want) startApi(); };
  const fail = () => { if (window.YT && YT.Player) return; apiFailed = true; if (want) { stage.innerHTML = '<div class="frame"></div>'; plainEmbed(); } };
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  tag.onerror = fail;
  document.head.appendChild(tag);
  setTimeout(fail, 9000);
}
preloadYtApi();

/* Ã—Â©Ã—ÂªÃ—â„¢ Ã—â€Ã—â€ºÃ—ÂªÃ—â€¢Ã—â€˜Ã—â€¢Ã—Âª Ã—â€Ã—Â¨Ã—Â©Ã—Å¾Ã—â„¢Ã—â€¢Ã—Âª Ã—Â©Ã—Å“ Ã—â€Ã—Â Ã—â€™Ã—Å¸. nocookie Ã—Å“Ã—Â Ã—ÂªÃ—Å“Ã—â€¢Ã—â„¢Ã—â€ Ã—â€˜Ã—Â¢Ã—â€¢Ã—â€™Ã—â„¢Ã—â€¢Ã—Âª Ã—Â¦Ã—â€œ-Ã—Â©Ã—Å“Ã—â„¢Ã—Â©Ã—â„¢, Ã—â€¢Ã—Å“Ã—â€ºÃ—Å¸ Ã—â€Ã—â„¢Ã—Â Ã—â€Ã—Â¨Ã—ÂÃ—Â©Ã—â€¢Ã—Â Ã—â€. */
const YT_HOSTS = ["https://www.youtube.com", "https://www.youtube.com"];
let hostIdx = 0, hostFlip = false;

function startApi() {
  if (!(window.YT && YT.Player) || !el("ytPlayer")) return;
  if (yt && yt.loadVideoById) {
    if (!wantAuto) { stopVerify(); return yt.cueVideoById(want); }
    try { if (isTouch) yt.mute(); yt.setVolume(volume); yt.loadVideoById(want); } catch (e) {}
    if (isTouch) setTimeout(() => { try { yt.unMute(); yt.setVolume(volume); } catch (e) {} }, 800);
    return verify();
  }
  yt = new YT.Player("ytPlayer", {
    videoId: want,
    host: YT_HOSTS[hostIdx],
    playerVars: { playsinline: 1, rel: 0, autoplay: wantAuto ? 1 : 0, mute: isTouch ? 1 : 0, origin: location.origin },
    events: {
      onReady: (e) => {
        e.target.setVolume(volume);
        if (!wantAuto) return;
        try { if (isTouch) e.target.mute(); e.target.playVideo(); } catch (err) {}
        verify();
        if (isTouch) setTimeout(() => { try { e.target.unMute(); e.target.setVolume(volume); } catch (err) {} }, 800);
      },
      onStateChange: onYtState,
      onError: (e) => onYtError(e.data)
    }
  });
}

/* Ã—â€œÃ—Â¤Ã—â€œÃ—Â¤Ã—Â Ã—â„¢Ã—Â Ã—Â©Ã—â€¢Ã—Â Ã—Â¢Ã—â„¢Ã—Â Ã—Å¾Ã—â€¢Ã—â€¢Ã—ÂªÃ—Â¨Ã—â„¢Ã—Â Ã—Â¢Ã—Å“ Ã—â€˜Ã—Â§Ã—Â©Ã—Âª Ã—Â Ã—â€™Ã—â„¢Ã—Â Ã—â€ Ã—Â©Ã—Å“Ã—Â Ã—â€˜Ã—ÂÃ—â€ Ã—Å¾Ã—â€Ã—Å¾Ã—Â©Ã—ÂªÃ—Å¾Ã—Â© Ã¢â‚¬â€ Ã—Å¾Ã—â€¢Ã—â€¢Ã—â€œÃ—ÂÃ—â„¢Ã—Â Ã—Â©Ã—â€Ã—ÂÃ—Å¾Ã—Âª Ã—â€Ã—ÂªÃ—â€”Ã—â„¢Ã—Å“Ã—â€ */
function verify() {
  stopVerify();
  nudge = 0;
  nudgeTimer = setInterval(() => {
    if (engine !== "yt" || !yt || !yt.getPlayerState) return stopVerify();
    const s = safe(() => yt.getPlayerState(), 5);
    if (s !== 5 && s !== -1) return stopVerify();
    if (++nudge >= 3) { stopVerify(); return stalled(); }
    try {
      if (nudge === 1) { yt.mute(); yt.playVideo(); setTimeout(() => { try { yt.unMute(); yt.setVolume(volume); } catch (e) {} }, 400); }
      else { freshPlayer(want); }
    } catch (e) {}
  }, 1200);
}

const stopVerify = () => { if (nudgeTimer) { clearInterval(nudgeTimer); nudgeTimer = 0; } };

function freshPlayer(id) {
  stage.classList.remove("note");
  stage.innerHTML = '<div class="frame"><div id="ytPlayer"></div></div>';
  yt = null;
  want = id;
  startApi();
}

/* Ã—â€˜Ã—Â¨Ã—â„¢Ã—Â¨Ã—Âª Ã—Å¾Ã—â€”Ã—â€œÃ—Å“ Ã—â€ºÃ—Â©Ã—â€-API Ã—â€”Ã—Â¡Ã—â€¢Ã—Â (Ã—â€”Ã—â€¢Ã—Â¡Ã—Â Ã—Â¤Ã—Â¨Ã—Â¡Ã—â€¢Ã—Å¾Ã—â€¢Ã—Âª, Ã—Â¨Ã—Â©Ã—Âª Ã—ÂÃ—Â¨Ã—â€™Ã—â€¢Ã—Â Ã—â„¢Ã—Âª) Ã¢â‚¬â€ Ã—Â¢Ã—â€œÃ—â„¢Ã—â„¢Ã—Å¸ Ã—â€Ã—ËœÃ—Å¾Ã—Â¢Ã—â€ Ã—Â¨Ã—Â©Ã—Å¾Ã—â„¢Ã—Âª */
function plainEmbed() {
  if (!want || (window.YT && YT.Player)) return;
  stopVerify();
  stage.classList.remove("note");
  stage.innerHTML = `<div class="frame"><iframe title="Ã—Â Ã—â€™Ã—Å¸" frameborder="0"
    src="${YT_HOSTS[hostIdx]}/embed/${want}?autoplay=${wantAuto ? 1 : 0}&rel=0&playsinline=1"
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe></div>
    <p class="notice">Ã—â€Ã—â€œÃ—Â¤Ã—â€œÃ—Â¤Ã—Å¸ Ã—â€”Ã—Â¡Ã—Â Ã—ÂÃ—Âª Ã—â€Ã—â€Ã—Â©Ã—Å¾Ã—Â¢Ã—â€ Ã—â€Ã—Â¢Ã—Â¦Ã—Å¾Ã—â„¢Ã—Âª. Ã—Å“Ã—â€”Ã—â„¢Ã—Â¦Ã—â€ Ã—Â¢Ã—Å“ Ã—â€ºÃ—Â¤Ã—ÂªÃ—â€¢Ã—Â¨ Ã—â€Ã—Â Ã—â€™Ã—â„¢Ã—Â Ã—â€ Ã—â€˜Ã—Â©Ã—â€¢Ã—Â¨Ã—â€ Ã—Â©Ã—Å¾Ã—ÂªÃ—â€”Ã—Âª Ã—ÂªÃ—ÂªÃ—â€”Ã—â„¢Ã—Å“ Ã—ÂÃ—â€¢Ã—ÂªÃ—â€.
      <a href="https://www.youtube.com/watch?v=${want}" target="_blank" rel="noopener">Ã—ÂÃ—â€¢ Ã—Â¦Ã—Â¤Ã—â€ Ã—â€˜Ã—Å¾Ã—Â§Ã—â€¢Ã—Â¨</a></p>`;
  stage.classList.add("note");
  yt = null;
}

function onYtState(e) {
  if (e.data === 1) skipBudget = 6;
  if (e.data === 1 || e.data === 2 || e.data === 3) stopVerify();
  const d = safe(() => e.target.getDuration(), 0);
  if (d) {
    if (current >= 0) songs[current].d = d;
    if (track) track.d = d;
    totTime.textContent = mmss(d);
    const r = track && document.querySelector(`.row[data-uid="${CSS.escape(track.uid)}"]`);
    if (r) r.querySelector(".row-time").textContent = mmss(d);
  }
  setPlaying(e.data === 1);
  if (e.data === 0 && skipBudget > 0) (repeat ? playTrack(track, true) : step(1));
}

function onYtError(code) {
  stopVerify();
  const id = track ? track.vid : want;
  /* 100/101/150/153: Ã—â€Ã—Â¡Ã—Â¨Ã—ËœÃ—â€¢Ã—Å¸ Ã—Å“Ã—Â Ã—Â Ã—Å¾Ã—Â¦Ã—Â Ã—ÂÃ—â€¢ Ã—Â©Ã—â€Ã—â„¢Ã—â€¢Ã—Â¦Ã—Â¨ Ã—Â¡Ã—â€™Ã—Â¨ Ã—ÂÃ—Âª Ã—â€Ã—â€Ã—ËœÃ—Å¾Ã—Â¢Ã—â€ Ã¢â‚¬â€
     Ã—Â Ã—â„¢Ã—Â¡Ã—â„¢Ã—â€¢Ã—Å¸ Ã—â€”Ã—â€¢Ã—â€“Ã—Â¨ Ã—â€˜Ã—ÂÃ—â€¢Ã—ÂªÃ—â€¢ Ã—Â Ã—â€™Ã—Å¸ Ã—Å“Ã—Â Ã—â„¢Ã—Â¢Ã—â€“Ã—â€¢Ã—Â¨, Ã—Å¾Ã—â€”Ã—Â¤Ã—Â©Ã—â„¢Ã—Â Ã—Â¢Ã—â€¢Ã—ÂªÃ—Â§ Ã—ÂÃ—â€”Ã—Â¨ Ã—Â©Ã—Å“ Ã—â€Ã—Â©Ã—â„¢Ã—Â¨. */
  const blocked = code === 100 || code === 101 || code === 150 || code === 153;
  if (!blocked && !hostFlip && YT_HOSTS[hostIdx + 1]) {
    hostFlip = true;
    hostIdx++;
    return setTimeout(() => freshPlayer(id), 500);
  }
  if (!blocked && !retried && track) {
    retried = true;
    return setTimeout(() => freshPlayer(id), 1000);
  }
  if (!isTouch) { if (altSource()) return; if (track) return tryOtherSource(track, code); }
  note(id, code);
}

/* Ã—ÂÃ—Â Ã—â„¢Ã—Â© Ã—â€˜Ã—ÂªÃ—â€¢Ã—Â¦Ã—ÂÃ—â€¢Ã—Âª Ã—â€ºÃ—â€˜Ã—Â¨ Ã—Â¢Ã—â€¢Ã—ÂªÃ—Â§ Ã—ÂÃ—â€”Ã—Â¨ Ã—Â©Ã—Å“ Ã—ÂÃ—â€¢Ã—ÂªÃ—â€¢ Ã—Â©Ã—â„¢Ã—Â¨ Ã¢â‚¬â€ Ã—Å“Ã—Â Ã—â€™Ã—Å¸ Ã—ÂÃ—â€¢Ã—ÂªÃ—â€¢ Ã—â€˜Ã—Å¾Ã—Â§Ã—â€¢Ã—Â Ã—Å“Ã—â€Ã—â„¢Ã—ÂªÃ—Â§Ã—Â¢.
   Ã—Â¨Ã—Â§ Ã—Å¾Ã—ÂªÃ—â€¢Ã—Å¡ playQueue: Ã—â€”Ã—â„¢Ã—Â¤Ã—â€¢Ã—Â© Ã—â€”Ã—â€œÃ—Â© Ã—Â¢Ã—â€¢Ã—Å“Ã—â€ 100 Ã—â„¢Ã—â€”Ã—â„¢Ã—â€œÃ—â€¢Ã—Âª Ã—Å¾Ã—â€ºÃ—Â¡Ã—â€. */
function altSource() {
  if (!track) return false;
  const k = normKey(track.t, track.a);
  if (!k) return false;
  if (k !== triedKey) { triedKey = k; triedUids = new Set(); }
  triedUids.add(track.uid);
  const alt = playQueue.find((t) => !triedUids.has(t.uid) && normKey(t.t, t.a) === k);
  if (!alt) return false;
  autoSwitch = true;
  playTrack(alt, true);
  return true;
}

/* ---------- Ã—Å¾Ã—Â§Ã—â€¢Ã—Â¨ Ã—â€”Ã—Å“Ã—â€¢Ã—Â¤Ã—â„¢ Ã—â€ºÃ—Â©Ã—â€Ã—Â¡Ã—Â¨Ã—ËœÃ—â€¢Ã—Å¸ Ã—â€”Ã—Â¡Ã—â€¢Ã—Â Ã—Å“Ã—â€Ã—ËœÃ—Å¾Ã—Â¢Ã—â€ ----------
   Ã—â€™Ã—Â Ã—Â§Ã—ËœÃ—Å“Ã—â€¢Ã—â€™ Ã—â€¢Ã—â€™Ã—Â Ã—â€”Ã—â„¢Ã—Â¤Ã—â€¢Ã—Â© Ã—â„¢Ã—â€¢Ã—ËœÃ—â„¢Ã—â€¢Ã—â€˜ Ã—Å¾Ã—â€ºÃ—â„¢Ã—Å“Ã—â„¢Ã—Â Ã—Â¡Ã—Â¨Ã—ËœÃ—â€¢Ã—Â Ã—â„¢Ã—Â Ã—Â©Ã—â€Ã—â„¢Ã—â€¢Ã—Â¦Ã—Â¨ Ã—Â¡Ã—â€™Ã—Â¨ Ã—Å“Ã—â€Ã—ËœÃ—Å¾Ã—Â¢Ã—â€ (Ã—Â§Ã—â€¢Ã—â€œ 150).
   Ã—â€˜Ã—Å¾Ã—Â§Ã—â€¢Ã—Â Ã—Å“Ã—â€Ã—â„¢Ã—ÂªÃ—Â§Ã—Â¢, Ã—Å¾Ã—â€”Ã—Â¤Ã—Â©Ã—â„¢Ã—Â Ã—Â¢Ã—â€¢Ã—ÂªÃ—Â§ Ã—ÂÃ—â€”Ã—Â¨ Ã—Â©Ã—Å“ Ã—ÂÃ—â€¢Ã—ÂªÃ—â€¢ Ã—Â©Ã—â„¢Ã—Â¨ Ã¢â‚¬â€ Ã—â„¢Ã—â€¢Ã—ËœÃ—â„¢Ã—â€¢Ã—â€˜, Ã—â€¢Ã—ÂÃ—Â Ã—ÂÃ—â„¢Ã—Å¸ Ã¢â‚¬â€ Ã—ÂÃ—â€¢Ã—â€œÃ—â„¢Ã—â€¢ Ã—Å¾-Audius. */
let altPlan = null, altBusy = false;
let skipBudget = 0, lastSkipAt = 0;
const altQueryCache = new Map();

/* Ã—Å¾Ã—â„¢Ã—Å“Ã—â€¢Ã—Âª Ã—Â§Ã—â„¢Ã—Â©Ã—â€¢Ã—Â¨ Ã—â€¢Ã—Å¾Ã—â„¢Ã—Å“Ã—â€¢Ã—Âª Ã—Â¨Ã—Â¢Ã—Â© Ã—Å¾Ã—â€ºÃ—â€¢Ã—ÂªÃ—Â¨Ã—â€¢Ã—Âª Ã—â„¢Ã—â€¢Ã—ËœÃ—â„¢Ã—â€¢Ã—â€˜ Ã¢â‚¬â€ Ã—Å“Ã—Â Ã—Å¾Ã—Â©Ã—Â¤Ã—â„¢Ã—Â¢Ã—â€¢Ã—Âª Ã—Â¢Ã—Å“ Ã—â€“Ã—â€Ã—â€¢Ã—Âª Ã—â€Ã—Â©Ã—â„¢Ã—Â¨ */
const NOISE_WORDS = new Set([
  "official", "video", "lyric", "lyrics", "audio", "hd", "hq", "mv", "feat", "ft", "prod",
  "live", "remaster", "remastered", "version", "cover", "remix", "instrumental", "acoustic", "music",
  "Ã—Â§Ã—Å“Ã—â„¢Ã—Â¤", "Ã—Å¾Ã—â„¢Ã—Å“Ã—â„¢Ã—Â", "Ã—Â¨Ã—Â©Ã—Å¾Ã—â„¢", "Ã—â€Ã—â€¢Ã—Â¤Ã—Â¢Ã—â€", "Ã—Å“Ã—â„¢Ã—â„¢Ã—â€˜", "Ã—ÂÃ—â€¢Ã—â€œÃ—â„¢Ã—â€¢", "Ã—â€™Ã—Â¨Ã—Â¡Ã—â€", "Ã—Â§Ã—ÂÃ—â€˜Ã—Â¨", "Ã—Â¨Ã—Å¾Ã—â„¢Ã—Â§Ã—Â¡", "Ã—ÂÃ—â„¢Ã—Â Ã—Â¡Ã—ËœÃ—Â¨Ã—â€¢Ã—Å¾Ã—Â Ã—ËœÃ—Å“", "Ã—ÂÃ—Â§Ã—â€¢Ã—Â¡Ã—ËœÃ—â„¢", "Ã—Å¾Ã—Â§Ã—â€¢Ã—Â¨Ã—â„¢",
]);

const titleWords = (v) =>
  normKey(v, "")
    .split(" ")
    .filter((w) => w.length > 1 && !NOISE_WORDS.has(w) && !/^(19|20)\d{2}$/.test(w));

/* Ã—ÂÃ—â€¢Ã—ÂªÃ—â€ Ã—â€ºÃ—â€¢Ã—ÂªÃ—Â¨Ã—Âª? Ã—Å¾Ã—Â©Ã—â€¢Ã—â€¢Ã—â„¢Ã—Â Ã—ÂÃ—Âª Ã—Â©Ã—Â Ã—â€Ã—Â©Ã—â„¢Ã—Â¨ Ã—Â¢Ã—Â¦Ã—Å¾Ã—â€¢ (Ã—â€˜Ã—Å“Ã—â„¢ Ã—Â©Ã—Â Ã—â€Ã—ÂÃ—Å¾Ã—Å¸ Ã—â€¢Ã—â€˜Ã—Å“Ã—â„¢ Ã—Å¾Ã—â„¢Ã—Å“Ã—â€¢Ã—Âª Ã—Â¨Ã—Â¢Ã—Â©).
   Ã—â€Ã—ÂªÃ—ÂÃ—Å¾Ã—â€ Ã—â€”Ã—Å“Ã—Â§Ã—â„¢Ã—Âª Ã—â€Ã—â„¢Ã—â„¢Ã—ÂªÃ—â€ Ã—Å¾Ã—Â Ã—â€™Ã—Â Ã—Âª Ã—Â©Ã—â„¢Ã—Â¨ Ã—ÂÃ—â€”Ã—Â¨ Ã—Â©Ã—Å“ Ã—ÂÃ—â€¢Ã—ÂªÃ—â€¢ Ã—ÂÃ—Å¾Ã—Å¸ Ã¢â‚¬â€ Ã—Å“Ã—â€ºÃ—Å¸ Ã—â€Ã—Â¡Ã—Â£ Ã—â€™Ã—â€˜Ã—â€¢Ã—â€. */
function sameSong(a, b, artist) {
  const drop = new Set(titleWords(artist || ""));
  const A = titleWords(a).filter((w) => !drop.has(w));
  const B = titleWords(b);
  if (!A.length || !B.length) return false;
  let hits = 0;
  for (const w of A) {
    if (B.includes(w)) { hits += 1; continue; }
    if (w.length > 3 && B.some((x) => x.length > 3 && (x.includes(w) || w.includes(x)))) hits += 0.5;
  }
  return hits / A.length >= (A.length <= 2 ? 1 : 0.7);
}

/* Ã—â€ºÃ—Å“ Ã—â€˜Ã—Â§Ã—Â©Ã—â€ Ã—Å¾Ã—â€¢Ã—â€™Ã—â€˜Ã—Å“Ã—Âª Ã—â€˜Ã—â€“Ã—Å¾Ã—Å¸: Ã—â€”Ã—â„¢Ã—Â¤Ã—â€¢Ã—Â© Ã—ÂÃ—â„¢Ã—ËœÃ—â„¢ Ã—ÂÃ—â€¢ Ã—ÂªÃ—Â§Ã—â€¢Ã—Â¢ Ã—Å“Ã—Â Ã—Å¾Ã—Â©Ã—ÂÃ—â„¢Ã—Â¨ Ã—ÂÃ—Âª Ã—â€Ã—Â Ã—â€™Ã—Å¸ Ã—Â¢Ã—Å“ "Ã—Å¾Ã—â€”Ã—Â¤Ã—Â©Ã—â„¢Ã—ÂÃ¢â‚¬Â¦" */
const withTimeout = (p, ms, fallback) =>
  Promise.race([p, new Promise((res) => setTimeout(() => res(fallback), ms))]);

async function altCandidates(tr) {
  const out = [];
  for (const t of playQueue) {
    if (t.uid !== tr.uid && t.src !== "audius" && !triedUids.has(t.uid) && sameSong(tr.t, t.t, tr.a)) out.push(t);
  }

  const queries = [`${tr.t} ${tr.a}`.trim(), tr.t].map((q) => (q || "").trim()).filter(Boolean).slice(0, 2);
  const matches = [];
  const collect = (items) => {
    for (const t of items || []) {
      if (!t || t.src === "audius" || triedUids.has(t.uid) || !sameSong(tr.t, t.t, tr.a)) continue;
      if (!matches.some((m) => m.uid === t.uid)) matches.push(t);
    }
  };
  const fetchQuery = async (q, raw) => {
    const cacheKey = (raw ? "raw:" : "api:") + q;
    if (altQueryCache.has(cacheKey)) return altQueryCache.get(cacheKey);
    let items = [];
    try { items = await withTimeout(raw ? ytSearchRaw(q, 40) : ytSearch(q, 15), 5000, []); } catch (e) { items = []; }
    altQueryCache.set(cacheKey, items);
    return items;
  };

  /* Ã—Â§Ã—â€¢Ã—â€œÃ—Â Ã—â€Ã—â€”Ã—â„¢Ã—Â¤Ã—â€¢Ã—Â© Ã—â€Ã—Å¾Ã—Â¡Ã—â€¢Ã—Â Ã—Å¸ (Ã—Â¨Ã—Â§ Ã—Â¡Ã—Â¨Ã—ËœÃ—â€¢Ã—Â Ã—â„¢Ã—Â Ã—Â©Ã—Å¾Ã—ÂÃ—Â¤Ã—Â©Ã—Â¨Ã—â„¢Ã—Â Ã—â€Ã—ËœÃ—Å¾Ã—Â¢Ã—â€), Ã—â€¢Ã—Â¨Ã—Â§ Ã—ÂÃ—Â Ã—ÂÃ—â„¢Ã—Å¸ Ã¢â‚¬â€ Ã—â€”Ã—â„¢Ã—Â¤Ã—â€¢Ã—Â© Ã—â€™Ã—â€¢Ã—Å“Ã—Å¾Ã—â„¢ */
  for (const q of queries) {
    collect(await fetchQuery(q, false));
    if (matches.length) break;
  }
  if (!matches.length && queries[0]) collect(await fetchQuery(queries[0], true));

  /* Ã—Å¾Ã—Â¡Ã—Â Ã—Â Ã—â„¢Ã—Â Ã—ÂÃ—Âª Ã—Å¾Ã—â„¢ Ã—Â©Ã—â„¢Ã—â€œÃ—â€¢Ã—Â¢ Ã—Â©Ã—â€”Ã—Â¡Ã—â€¢Ã—Â Ã—â€¢Ã—Å¾Ã—Â¢Ã—â€œÃ—â„¢Ã—Â¤Ã—â„¢Ã—Â Ã—Å¾Ã—â„¢ Ã—Â©Ã—Â Ã—â€˜Ã—â€œÃ—Â§ Ã—â€¢Ã—Å¾Ã—ÂÃ—Â¤Ã—Â©Ã—Â¨ Ã—â€Ã—ËœÃ—Å¾Ã—Â¢Ã—â€ */
  let status = new Map();
  try { status = await withTimeout(ytEmbedStatus(matches.map((t) => t.vid)), 3500, new Map()); } catch (e) {}
  const verified = matches.filter((t) => status.get(t.vid) === true);
  const unknown = matches.filter((t) => status.get(t.vid) !== true && status.get(t.vid) !== false);
  out.push(...verified, ...unknown);

  if (out.length) return out;
  try {
    const audio = await withTimeout(audiusSearch(`${tr.t} ${tr.a}`.trim(), 10), 2500, []);
    const hit = (audio || []).find((t) => sameSong(tr.t, t.t, tr.a) && (!tr.d || !t.d || Math.abs(t.d - tr.d) <= 60));
    if (hit) out.push({ ...hit, uid: tr.uid, t: tr.t, a: tr.a, art: tr.art || hit.art, link: tr.link, d: hit.d || tr.d });
  } catch (e) {}
  return out;
}

/* Ã—Å¾Ã—Â Ã—â€™Ã—Å¸ Ã—ÂÃ—Âª Ã—â€Ã—Å¾Ã—â€¢Ã—Â¢Ã—Å¾Ã—â€œ Ã—â€Ã—â€˜Ã—Â Ã—Å“Ã—Â©Ã—â„¢Ã—Â¨; Ã—ÂÃ—Â Ã—ÂÃ—â€“Ã—Å“Ã—â€¢ Ã¢â‚¬â€ Ã—Å¾Ã—Â¦Ã—â„¢Ã—â€™Ã—â„¢Ã—Â Ã—ÂÃ—Âª Ã—â€Ã—â€¢Ã—â€œÃ—Â¢Ã—Âª Ã—â€Ã—Â©Ã—â€™Ã—â„¢Ã—ÂÃ—â€ */
async function tryOtherSource(tr, code) {
  if (altBusy) return;
  altBusy = true;
  triedUids.add(tr.uid);
  try {
    if (!altPlan) {
      stage.classList.add("note");
      stage.innerHTML = '<p class="notice">Ã—Å¾Ã—â€”Ã—Å“Ã—â„¢Ã—Â¤Ã—â„¢Ã—Â Ã—Å“Ã—Â¢Ã—â€¢Ã—ÂªÃ—Â§ Ã—ÂÃ—â€”Ã—Â¨ Ã—Â©Ã—Å“ Ã—ÂÃ—â€¢Ã—ÂªÃ—â€¢ Ã—Â©Ã—â„¢Ã—Â¨Ã¢â‚¬Â¦</p>';
      const list = await altCandidates(tr);
      altPlan = { list, index: 0 };
    }
    const next = altPlan.list[altPlan.index++];
    if (!next) {
      altPlan = null;
      /* Ã—ÂÃ—â„¢Ã—Å¸ Ã—Â¢Ã—â€¢Ã—ÂªÃ—Â§ Ã—Â¢Ã—â€¢Ã—â€˜Ã—â€œ Ã¢â‚¬â€ Ã—Å“Ã—Â Ã—Â¢Ã—â€¢Ã—Â¦Ã—Â¨Ã—â„¢Ã—Â Ã—ÂÃ—Âª Ã—â€Ã—Å¾Ã—â€¢Ã—â€“Ã—â„¢Ã—Â§Ã—â€: Ã—Å¾Ã—â€œÃ—Å“Ã—â€™Ã—â„¢Ã—Â Ã—Å“Ã—Â©Ã—â„¢Ã—Â¨ Ã—â€Ã—â€˜Ã—Â */
      if (Date.now() - lastSkipAt > 20000) skipBudget = 6;
      if (skipBudget > 0) {
        skipBudget--;
        lastSkipAt = Date.now();
        setPlaying(false);
        step(1);
        return;
      }
      note(track ? track.vid : tr.vid, code);
      return;
    }
    triedUids.add(next.uid);
    autoSwitch = true;
    playTrack(next, true);
  } catch (e) {
    altPlan = null;
    note(track ? track.vid : tr.vid, code);
  } finally {
    altBusy = false;
  }
}

const safe = (fn, d) => { try { const v = fn(); return v == null || isNaN(v) ? d : v; } catch (e) { return d; } };

function step(dir) {
  const list = playQueue.length ? playQueue : songs.map((_, i) => localTrack(i));
  if (shuffle) return playTrack(list[Math.floor(Math.random() * list.length)], true);
  let p = qPos < 0 ? (track ? list.findIndex((t) => t.uid === track.uid) : -1) : qPos;
  if (p < 0) p = 0;
  else p = (p + dir + list.length) % list.length;
  playTrack(list[p], true);
}

function note(id, code) {
  stopVerify();
  setPlaying(false);
  engine = null;
  const why = location.protocol === "file:"
    ? "Ã—â€Ã—Â§Ã—â€¢Ã—â€˜Ã—Â¥ Ã—Â Ã—Â¤Ã—ÂªÃ—â€” Ã—â„¢Ã—Â©Ã—â„¢Ã—Â¨Ã—â€¢Ã—Âª Ã—Å¾Ã—â€Ã—ÂªÃ—â„¢Ã—Â§Ã—â„¢Ã—â„¢Ã—â€ Ã—â€¢Ã—â€Ã—Â Ã—â€™Ã—Å¸ Ã—Å“Ã—Â Ã—Â¢Ã—â€¢Ã—â€˜Ã—â€œ Ã—â€ºÃ—â€ºÃ—â€. Ã—Â¤Ã—ÂªÃ—â€” Ã—ÂÃ—Âª start.bat Ã¢â‚¬â€ Ã—â€“Ã—â€ Ã—Å¾Ã—Â¤Ã—Â¢Ã—â„¢Ã—Å“ Ã—Â©Ã—Â¨Ã—Âª Ã—Å¾Ã—Â§Ã—â€¢Ã—Å¾Ã—â„¢ Ã—â€¢Ã—ÂÃ—â€“ Ã—â„¢Ã—Â© Ã—Â¦Ã—Å“Ã—â„¢Ã—Å“."
    : `Ã—â€Ã—Â©Ã—â„¢Ã—Â¨Ã—â€¢Ã—Âª Ã—Â¡Ã—â„¢Ã—Â¨Ã—â€˜ Ã—Å“Ã—Â Ã—â€™Ã—Å¸ Ã—ÂÃ—Âª Ã—â€Ã—â€¢Ã—â€¢Ã—â„¢Ã—â€œÃ—ÂÃ—â€¢ Ã—â€Ã—â€“Ã—â€ (Ã—Â§Ã—â€¢Ã—â€œ ${code}) Ã¢â‚¬â€ Ã—â„¢Ã—â„¢Ã—ÂªÃ—â€ºÃ—Å¸ Ã—Â©Ã—â€Ã—â€Ã—ËœÃ—Å¾Ã—Â¢Ã—â€ Ã—â€˜Ã—Â¡Ã—Â¨Ã—ËœÃ—â€¢Ã—Å¸ Ã—â€Ã—â€“Ã—â€ Ã—Â Ã—Â¡Ã—â€™Ã—Â¨Ã—â€.
       <a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">Ã—ÂÃ—â€¢ Ã—Â¦Ã—Â¤Ã—â€ Ã—â€˜Ã—Å¾Ã—Â§Ã—â€¢Ã—Â¨</a>`;
  stage.innerHTML = `<p class="notice">${why}</p>`;
  stage.classList.add("note");
}

function stalled() {
  const id = track ? track.vid : want;
  setPlaying(false);
  engine = null;
  stage.innerHTML = `<p class="notice">Ã—â€Ã—â€œÃ—Â¤Ã—â€œÃ—Â¤Ã—Å¸ Ã—â€”Ã—Â¡Ã—Â Ã—ÂÃ—Âª Ã—ÂªÃ—â€”Ã—â„¢Ã—Å“Ã—Âª Ã—â€Ã—Â Ã—â€™Ã—â„¢Ã—Â Ã—â€. Ã—Å“Ã—â€”Ã—â„¢Ã—Â¦Ã—â€ Ã—Â Ã—â€¢Ã—Â¡Ã—Â¤Ã—Âª Ã—Â¢Ã—Å“ Ã—â€Ã—Â©Ã—â„¢Ã—Â¨ Ã—â€˜Ã—â€œÃ—Â¨Ã—Å¡ Ã—â€ºÃ—Å“Ã—Å“ Ã—Â¤Ã—â€¢Ã—ÂªÃ—â€”Ã—Âª Ã—ÂÃ—â€¢Ã—ÂªÃ—â€.
    ${id ? `<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">Ã—ÂÃ—â€¢ Ã—Â¦Ã—Â¤Ã—â€ Ã—â€˜Ã—Å¾Ã—Â§Ã—â€¢Ã—Â¨</a>` : ""}</p>`;
  stage.classList.add("note");
}

function offline(id) {
  note(id, "file");
}

function transport() {
  if (!track) return playTrack(playQueue[0] || localTrack(queue[0] ?? 0), true);
  if (engine === "audio") {
    audioEl.paused ? audioEl.play().catch((e) => audioFail(track, e)) : audioEl.pause();
    return;
  }
  if (yt && yt.playVideo) {
    let st = -1; try { st = yt.getPlayerState(); } catch (e) {}
    const on = st === 1 || st === 3 || (st === -1 && playing);
    if (on) { yt.pauseVideo(); setPlaying(false); } else yt.playVideo();
    return;
  }
  playTrack(track, !playing);
}

toggle.addEventListener("click", transport);
el("next").addEventListener("click", () => step(1));
el("prev").addEventListener("click", () => {
  if (nowOf() > 4) return engine === "audio" ? (audioEl.currentTime = 0) : yt.seekTo(0, true);
  step(-1);
});
el("shuffle").addEventListener("click", (e) => {
  shuffle = !shuffle;
  e.currentTarget.classList.toggle("on", shuffle);
});
el("repeat").addEventListener("click", (e) => {
  repeat = !repeat;
  e.currentTarget.classList.toggle("on", repeat);
});
el("npLike").addEventListener("click", () => track && like(track));

bar.addEventListener("click", (e) => {
  if (!track) return;
  const r = bar.getBoundingClientRect();
  const ratio = Math.min(Math.max((r.right - e.clientX) / r.width, 0), 1);
  const d = duration();
  if (!d) return;
  if (engine === "audio") { audioEl.currentTime = ratio * d; elapsed = ratio * d; }
  else if (yt && yt.seekTo) yt.seekTo(ratio * d, true);
  else elapsed = ratio * d;
  fill.style.width = `${ratio * 100}%`;
});

function setVolume(e) {
  const r = volBar.getBoundingClientRect();
  /* Ã—â€Ã—Â¨Ã—Å¾Ã—Â§Ã—â€¢Ã—Å“ Ã—Å“Ã—Â Ã—â„¢Ã—â€¢Ã—Â¨Ã—â€œ Ã—Å¾Ã—ÂªÃ—â€”Ã—Âª Ã—Å“Ã–Â¾1 Ã¢â‚¬â€ Ã—Å“Ã—â€”Ã—â„¢Ã—Â¦Ã—â€ Ã—Â¢Ã—Å“ Ã—Â§Ã—Â¦Ã—â€ Ã—â€Ã—Â¡Ã—Â¨Ã—â€™Ã—Å“ Ã—Å“Ã—Â Ã—Å¾Ã—Â©Ã—ÂªÃ—â„¢Ã—Â§Ã—â€ Ã—ÂÃ—Âª Ã—â€Ã—ÂÃ—Â¤Ã—Å“Ã—â„¢Ã—Â§Ã—Â¦Ã—â„¢Ã—â€; Ã—â€ºÃ—â„¢Ã—â€˜Ã—â€¢Ã—â„¢ Ã—Â¨Ã—Â§ Ã—â€˜Ã—â€ºÃ—Â¤Ã—ÂªÃ—â€¢Ã—Â¨ Ã—â€Ã—â€Ã—Â©Ã—ÂªÃ—Â§Ã—â€ */
  volume = Math.round(Math.max(1, Math.min(Math.max((r.right - e.clientX) / r.width, 0), 1) * 100));
  volFill.style.width = `${volume}%`;
  if (engine === "audio") audioEl.volume = volume / 100;
  else if (yt && yt.setVolume) { yt.setVolume(volume); yt.unMute(); }
}
volBar.style.touchAction = "none";
volBar.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  volBar.setPointerCapture(e.pointerId);
  volBar.classList.add("dragging");
  setVolume(e);
  const move = (ev) => setVolume(ev);
  const up = () => { volBar.classList.remove("dragging"); volBar.removeEventListener("pointermove", move); volBar.removeEventListener("pointerup", up); volBar.removeEventListener("pointercancel", up); };
  volBar.addEventListener("pointermove", move);
  volBar.addEventListener("pointerup", up);
  volBar.addEventListener("pointercancel", up);
});
volBar.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = volBar.getBoundingClientRect();
  const v = Math.max(1, Math.min(100, volume + (e.deltaY < 0 ? 5 : -5)));
  setVolume({ clientX: r.right - (v / 100) * r.width });
}, { passive: false });
el("mute").addEventListener("click", (e) => {
  const on = !e.currentTarget.classList.contains("on");
  e.currentTarget.classList.toggle("on", on);
  if (engine === "audio") audioEl.muted = on;
  else if (yt && yt.mute) on ? yt.mute() : yt.unMute();
});

el("search").addEventListener("input", () => {
  clearTimeout(el("search")._t);
  el("search")._t = setTimeout(() => {
    if ((location.hash || "#/home").startsWith("#/search")) renderSearch();
    else location.hash = "#/search";
  }, 350);
});

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.target.matches("input, textarea")) return;
  e.preventDefault();
  transport();
});

setInterval(() => {
  if (!playing || !track) return;
  const d = duration();
  if (!d) return;
  elapsed = nowOf();
  fill.style.width = `${(elapsed / d) * 100}%`;
  curTime.textContent = mmss(elapsed);
}, 1000);

const menuBtn = el("menuBtn"), sidebar = el("sidebar");
let scrim;

function closeMenu() {
  if (!sidebar.classList.contains("open")) return;
  sidebar.classList.remove("open");
  menuBtn.setAttribute("aria-expanded", "false");
  if (scrim) { scrim.remove(); scrim = null; }
}

menuBtn.addEventListener("click", () => {
  if (sidebar.classList.contains("open")) return closeMenu();
  sidebar.classList.add("open");
  menuBtn.setAttribute("aria-expanded", "true");
  scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.addEventListener("click", closeMenu);
  document.body.appendChild(scrim);
});

document.querySelectorAll(".rail-btn").forEach((a) => a.addEventListener("click", closeMenu));

el("npLike").innerHTML = HEART;

/* ---------- Ã—â€˜Ã—Â§Ã—Â¨Ã—â€¢Ã—Âª Ã—â€”Ã—Å“Ã—â€¢Ã—Å¸ ---------- */
winClose.addEventListener("click", () => { try { window.close(); } catch (e) {} });

let full = false;
winFull.addEventListener("click", () => {
  const el = document.documentElement;
  if (!full) {
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
});
document.addEventListener("fullscreenchange", () => {
  full = !!document.fullscreenElement;
  if (winFull) winFull.classList.toggle("on", full);
});

let hidden = false;
winHide.addEventListener("click", () => {
  hidden = !hidden;
  document.body.classList.toggle("app-hidden", hidden);
  if (winHide) winHide.classList.toggle("on", hidden);
  if (hidden) document.getElementById("menuBtn")?.setAttribute("aria-expanded", "false");
});

renderPlaylists();
checkProviders();
route();
