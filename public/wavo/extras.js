/* WAVO extras: a personal library kept on this device, playlists, and synced lyrics. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ================= הספרייה האישית ================= */
  const LOCAL = "wavo.mylib";
  let lib = [];
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL)) || []; } catch { return []; } };
  const writeLocal = () => localStorage.setItem(LOCAL, JSON.stringify(lib));
  const inLib = (k) => lib.some((x) => x.k === k);

  function loadLib() {
    lib = readLocal();
    refresh();
  }

  function toggleLib(item) {
    const had = inLib(item.k);
    lib = had ? lib.filter((x) => x.k !== item.k) : [item, ...lib];
    refresh();
    writeLocal();
    toast(had ? "הוסר מהספרייה" : "נוסף לספרייה");
  }

  const artistItem = (a) => {
    const s = songs.find((x) => x.a === a);
    return { k: "artist:" + a, kind: "artist", n: a, s: `אמן · ${songsWord(artistCount(a))}`, art: s ? thumb(s.yt) : "", h: `#/artist/${encodeURIComponent(a)}` };
  };
  const songItem = (tr) => ({ k: "song:" + tr.uid, kind: "song", n: tr.t, s: `שיר · ${tr.a}`, art: tr.art, tr });
  const likedItem = () => ({ k: "liked", kind: "liked", n: "שירים שאהבתי", s: "פלייליסט", h: "#/liked" });

  function openItem(it) {
    closeMenu();
    if (it.kind === "song" && it.tr) return playTrack(it.tr, true);
    location.hash = it.h;
  }

  window.renderPlaylists = function () {
    const box = el("playlists");
    if (!box) return;
    box.innerHTML = "";
    const q = (el("libFilter")?.value || "").trim();
    const hash = location.hash || "#/home";
    const list = lib.filter((it) => !q || it.n.includes(q)).sort((x, y) => (y.kind === "playlist") - (x.kind === "playlist"));
    if (!lib.length) {
      box.innerHTML = `<div class="lib-empty"><p class="lib-empty-t">הספרייה שלך ריקה</p>
        <p class="lib-empty-s">לחץ על <b>＋</b> ליד אמן או שיר כדי להוסיף אותו לכאן</p>
        <a class="lib-empty-btn" href="#/search">מצא מה לשמוע</a></div>`;
      return;
    }
    list.forEach((it) => {
      const row = document.createElement("a");
      row.className = "prow" + (it.kind === "liked" ? " heart-p" : "") + (it.h === hash ? " on" : "");
      row.href = it.h || "#";
      row.innerHTML = `${it.kind === "liked" ? `<span class="pheart">${HEART_SOLID}</span>` : it.art ? `<img loading="lazy" alt="" src="${esc(it.art)}">` : `<span class="pheart pl-ph">♪</span>`}
        <span><span class="prow-name">${esc(it.n)}</span><span class="prow-sub">${esc(it.s)}</span></span>
        <button class="prow-x" aria-label="הסר מהספרייה" title="הסר">×</button>`;
      row.addEventListener("click", (e) => {
        if (e.target.closest(".prow-x")) { e.preventDefault(); return toggleLib(it); }
        if (it.kind === "song") { e.preventDefault(); openItem(it); } else closeMenu();
      });
      box.appendChild(row);
    });
  };

  window.renderLibrary = function () {
    viewEl.innerHTML = `<h1 class="greet">הספרייה שלך</h1>`;
    if (!lib.length) {
      viewEl.insertAdjacentHTML("beforeend", `<div class="lib-empty big"><p class="lib-empty-t">עדיין לא הוספת כלום</p>
        <p class="lib-empty-s">הוסף אמנים ושירים בלחיצה על ＋ — הם יופיעו כאן ובצד</p>
        <a class="lib-empty-btn" href="#/home">לדף הבית</a></div>`);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "lib-grid";
    lib.forEach((it) => {
      const c = document.createElement("button");
      c.className = "lib-card";
      c.innerHTML = `${it.kind === "liked" ? `<span class="lib-heart">${HEART_SOLID}</span>` : it.art ? `<img alt="" loading="lazy" src="${esc(it.art)}">` : `<span class="lib-heart pl-ph">♪</span>`}
        <span class="lib-card-n">${esc(it.n)}</span><span class="lib-card-s">${esc(it.s)}</span>`;
      c.addEventListener("click", () => openItem(it));
      grid.appendChild(c);
    });
    viewEl.appendChild(grid);
  };

  function addBtn(item, big, label) {
    const b = document.createElement("button");
    b.className = "lib-add" + (big ? " big" : "");
    const paint = () => {
      const on = inLib(item.k);
      b.classList.toggle("on", on);
      b.innerHTML = on ? "✓ <span>בספרייה</span>" : `＋ <span>${label || "הוסף לספרייה"}</span>`;
      b.setAttribute("aria-pressed", on);
    };
    b.dataset.k = item.k;
    b._paint = paint;
    paint();
    b.addEventListener("click", (e) => { e.stopPropagation(); toggleLib(item); });
    return b;
  }

  function refresh() {
    renderPlaylists();
    document.querySelectorAll(".lib-add").forEach((b) => b._paint && b._paint());
    if ((location.hash || "").startsWith("#/library")) renderLibrary();
  }

  const _artist = window.renderArtist;
  window.renderArtist = function (name) {
    _artist(name);
    const host = viewEl.querySelector(".ahero > div");
    if (host) host.appendChild(addBtn(artistItem(name), true));
  };
  const _liked = window.renderLiked;
  window.renderLiked = function () {
    _liked();
    viewEl.querySelector(".greet")?.insertAdjacentElement("afterend", addBtn(likedItem(), true));
  };
  const _np = window.renderNp;
  window.renderNp = function (tr) {
    _np(tr);
    if (!tr) return;
    const acts = el("npBody")?.querySelector(".np-acts");
    if (acts) {
      acts.appendChild(addBtn(songItem(tr)));
      if (tr.src === "catalog") acts.appendChild(addBtn(artistItem(tr.a), false, "שמור אמן"));
    }
  };

  /* כפתור ＋ קטן גם בשורות שירים */
  document.addEventListener("mouseover", (e) => {
    const row = e.target.closest && e.target.closest(".row[data-uid]");
    if (!row || row.querySelector(".lib-add")) return;
    const uid = row.dataset.uid;
    const i = uid.startsWith("yt:") ? byId[uid.slice(3)] : null;
    if (i == null) return;
    const b = addBtn(songItem(localTrack(i)));
    b.classList.add("mini");
    row.appendChild(b);
  });

  /* ================= הודעה קטנה ================= */
  let toastEl, toastT;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "wtoast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("on"), 1800);
  }

  /* ================= מילים ================= */
  const extra = document.querySelector(".player .extra");
  const lyrBtn = document.createElement("button");
  lyrBtn.className = "ctl sm";
  lyrBtn.id = "lyrBtn";
  lyrBtn.setAttribute("aria-label", "מילים");
  lyrBtn.title = "מילים";
  lyrBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 6.5a4 4 0 1 1 4 4"/><path d="m14.5 9.5-9 9a1.6 1.6 0 0 1-2.2-2.2l9-9"/></svg>`;
  extra?.prepend(lyrBtn);

  const pane = document.createElement("section");
  pane.className = "lyrics";
  pane.innerHTML = `<div class="lyr-bg" aria-hidden="true"></div>
    <header class="lyr-head"><img class="lyr-cover" alt="" /><div class="lyr-meta"><p class="lyr-t"></p><p class="lyr-a"></p></div>
    <div class="lyr-sync" hidden><button data-o="-0.5" aria-label="מילים מוקדם יותר">−</button><span class="lyr-off">סנכרון</span><button data-o="0.5" aria-label="מילים מאוחר יותר">+</button></div>
    <button class="lyr-find" aria-label="חיפוש מילים" title="מילים לא נכונות? חפש">⌕</button>
    <button class="lyr-close" aria-label="סגור מילים">×</button></header>
    <form class="lyr-search" hidden><input name="q" placeholder="שם השיר ושם הזמר" autocomplete="off" /><button type="submit">חפש</button></form>
    <div class="lyr-body"></div>`;
  document.body.appendChild(pane);
  const body = pane.querySelector(".lyr-body");
  const form = pane.querySelector(".lyr-search");
  let open = false, lines = [], plain = "", loadedFor = "", active = -1, offset = 0;
  const cache = new Map();
  const PICKS_KEY = "wavo.lyricsPicks";
  const picks = (() => { try { return JSON.parse(localStorage.getItem(PICKS_KEY) || "{}"); } catch { return {}; } })();
  const KNOWN = {"yt:EJ60iieMQAY": 20918849, "yt:wQIwVqlHDVs": 30100172, "yt:RVnZ9CRVris": 39834608, "yt:uaOPKIHk-tU": 18281874, "yt:yQ-cYqBzFkc": 23681211, "yt:VoV4G5IqFzs": 20902828, "yt:55Uca4kSzVk": 20638657, "yt:yaL_8gRQ-UQ": 40211898, "yt:ONxDKF5ZYDs": 13046551, "yt:TOR0BCA4SgA": 16509545, "yt:4D-Qcrbe0Bg": 7468516, "yt:zZW__pBCLRg": 16776764};
  for (const k in KNOWN) if (!(k in picks)) picks[k] = KNOWN[k];
  picks["yt:re3Gj-Q70Bc"] = 14363573; // נגד כל הסיכויים — LRCLIB lists the artist in English
  const OFFS_KEY = "wavo-lyr-offsets";
  const offs = (() => { try { return JSON.parse(localStorage.getItem(OFFS_KEY) || "{}"); } catch { return {}; } })();
  const saveOff = () => { if (!track) return; offs[track.uid] = offset; try { localStorage.setItem(OFFS_KEY, JSON.stringify(offs)); } catch {} };
  const savePick = (uid, v) => { picks[uid] = v; try { localStorage.setItem(PICKS_KEY, JSON.stringify(picks)); } catch {} };

  const FIN = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  const norm = (s) => String(s || "").toLowerCase()
    .replace(/[\u0591-\u05c7]/g, "")
    .replace(/[ךםןףץ]/g, (c) => FIN[c])
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/(official|video|clip|lyrics?|audio|visualizer|prod\.?.*|feat\.?.*|ft\.?.*|קליפ רשמי|הקליפ הרשמי|קליפ|מילים|רשמי|גרסה רשמית|vevo|- topic|topic)/g, " ")
    .replace(/[^\u05d0-\u05eaa-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

  /* split "artist - title" video titles into both halves */
  function splitTitle(t, a) {
    const parts = String(t || "").split(/\s[-–—|]\s|\s*[|]\s*/).map(norm).filter(Boolean);
    const na = norm(a);
    if (parts.length < 2) return { title: norm(t), alt: "" };
    const keep = parts.filter((p) => !(na && (p.includes(na) || na.includes(p))));
    const title = keep[0] || parts[parts.length - 1];
    const alt = parts.find((p) => p !== title) || ""; // the other half is often the real artist
    return { title, alt };
  }

  function parseLrc(txt) {
    const out = [];
    for (const raw of txt.split("\n")) {
      const tags = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
      const text = raw.replace(/\[[^\]]*\]/g, "").replace(/<\d+:\d+(?:\.\d+)?>/g, "").trim();
      for (const m of tags) out.push({ t: +m[1] * 60 + parseFloat(m[2].replace(":", ".")), text });
    }
    return out.sort((a, b) => a.t - b.t);
  }

  const words = (s) => s.split(" ").filter((w) => w.length > 1);
  const overlap = (x, y) => { const A = words(x), B = new Set(words(y)); return A.length ? A.filter((w) => B.has(w)).length / A.length : 0; };

  function score(x, t, artists, d) {
    const xt = norm(x.trackName), xa = norm(x.artistName);
    if (!xt || !(x.syncedLyrics || x.plainLyrics)) return -99;
    const titleSim = xt === t ? 1 : (xt.includes(t) || t.includes(xt)) ? 0.8 : overlap(t, xt);
    if (titleSim < 0.5) return -99;
    const artistOk = artists.some((a) => a && xa && (xa.includes(a) || a.includes(xa) || overlap(a, xa + " " + xt) >= 0.5));
    let s = titleSim * 5;
    if (artistOk) s += 5;
    let durOk = false;
    if (d && x.duration) {
      const diff = Math.abs(d - x.duration);
      durOk = diff <= 8;
      if (diff <= 4) s += 3; else if (diff <= 12) s += 1; else if (diff < 70) s -= Math.min(diff / 15, 3); else s -= 4;
    }
    /* wrong-song guard: need an artist match, a close duration, or an exact title */
    if (!artistOk && !durOk && !(titleSim === 1 && words(t).length >= 2)) return -99;
    if (x.syncedLyrics) s += 1.5;
    if (x.instrumental) s -= 10;
    return s;
  }

  const toRes = (x) => ({ synced: x.syncedLyrics ? parseLrc(x.syncedLyrics) : [], plain: x.plainLyrics || "", dur: x.duration || 0, src: "LRCLIB" });
  const lrc = async (path, params) => { try { const r = await fetch("https://lrclib.net/api/" + path + (params ? "?" + new URLSearchParams(params) : ""), { signal: AbortSignal.timeout(7000) }); return r.ok ? await r.json() : null; } catch { return null; } };

  const LCACHE = "wavo.lyrCache";
  const disk = (() => { try { return JSON.parse(localStorage.getItem(LCACHE) || "{}"); } catch { return {}; } })();
  const toDisk = (uid, r) => {
    if (!r) return;
    disk[uid] = r;
    const keys = Object.keys(disk);
    if (keys.length > 60) delete disk[keys[0]];
    try { localStorage.setItem(LCACHE, JSON.stringify(disk)); } catch {}
  };
  const inflight = new Map();
  async function fetchLyrics(tr) {
    if (cache.has(tr.uid)) return cache.get(tr.uid);
    if (disk[tr.uid]) { cache.set(tr.uid, disk[tr.uid]); return disk[tr.uid]; }
    if (inflight.has(tr.uid)) return inflight.get(tr.uid);
    const job = fetchLyricsNet(tr).then((r) => { inflight.delete(tr.uid); toDisk(tr.uid, r); return r; });
    inflight.set(tr.uid, job);
    return job;
  }
  async function fetchLyricsNet(tr) {
    const pick = picks[tr.uid];
    if (pick) {
      const x = await lrc("get/" + pick);
      if (x) { const r = toRes(x); cache.set(tr.uid, r); return r; }
    }
    const { title: t, alt } = splitTitle(tr.t, tr.a);
    const a = norm(tr.a), artists = [a, alt].filter(Boolean);
    let best = null, bestScore = -1;
    const consider = (list) => { for (const x of list || []) { const s = score(x, t, artists, tr.d); if (s > bestScore) { bestScore = s; best = x; } } };
    const tries = [
      { track_name: t, artist_name: a },
      alt && { track_name: t, artist_name: alt },
      { q: `${t} ${a}` },
      alt && { q: `${t} ${alt}` },
      { track_name: t },
      t !== norm(tr.t) && { q: norm(tr.t) },
      alt && { track_name: alt, artist_name: t }, // title/artist were the other way round
    ].filter(Boolean);
    /* all searches at once instead of one after another */
    const [first, ...rest] = tries;
    consider(await lrc("search", first));
    if (!(bestScore >= 10 && best?.syncedLyrics)) (await Promise.all(rest.map((p) => lrc("search", p)))).forEach(consider);
    let res = best && bestScore >= 5 ? toRes(best) : null;
    /* second source for plain lyrics */
    if (!res) {
      for (const ar of [tr.a, alt].filter(Boolean)) {
        try {
          const r = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(ar)}/${encodeURIComponent(t)}`, { signal: AbortSignal.timeout(6000) });
          const j = r.ok ? await r.json() : null;
          if (j?.lyrics?.trim()) { res = { synced: [], plain: j.lyrics.trim(), dur: 0, src: "lyrics.ovh" }; break; }
        } catch {}
      }
    }
    cache.set(tr.uid, res);
    return res;
  }

  function buildLines(synced, dur) {
    const out = [];
    const first = synced.find((l) => l.text);
    if (first && first.t > 6) out.push({ t: 0, end: first.t, gap: true });
    synced.forEach((l, i) => {
      const next = synced[i + 1];
      const end = next ? next.t : (dur || l.t + 5);
      if (l.text) out.push({ t: l.t, end: Math.min(end, l.t + 12), text: l.text });
      else if (end - l.t > 5) out.push({ t: l.t, end, gap: true }); // instrumental break
    });
    return out;
  }

  const isRtl = (s) => /[\u0590-\u05ff\u0600-\u06ff]/.test(s);
  function renderSynced(src) {
    body.innerHTML = lines.map((l, i) => l.gap
      ? `<p class="lyr-line gap" data-i="${i}"><span></span><span></span><span></span></p>`
      : `<p class="lyr-line" data-i="${i}" dir="${isRtl(l.text) ? "rtl" : "ltr"}">${esc(l.text)}</p>`).join("") +
      `<p class="lyr-src">מילים: ${esc(src)}</p>`;
  }

  async function loadFor(tr) {
    loadedFor = tr ? tr.uid : "";
    active = -1;
    form.hidden = true;
    pane.querySelector(".lyr-t").textContent = tr ? tr.t : "מילים";
    pane.querySelector(".lyr-a").textContent = tr ? tr.a : "";
    const cover = pane.querySelector(".lyr-cover");
    cover.hidden = !tr?.art;
    if (tr?.art) { cover.src = tr.art; pane.style.setProperty("--lyr-art", `url("${tr.art}")`); }
    if (!tr) { body.innerHTML = `<p class="lyr-msg">בחר שיר כדי לראות את המילים</p>`; return; }
    body.innerHTML = `<div class="lyr-loading"><span></span><span></span><span></span><span></span></div>`;
    const res = await fetchLyrics(tr);
    if (!track || track.uid !== tr.uid) return;
    show(res, tr);
  }

  function show(res, tr) {
    lines = res?.synced?.length ? buildLines(res.synced, res.dur) : [];
    active = -1;
    offset = 0;
    /* video longer than the recording = usually an intro before the song starts */
    if (lines.length && tr.d && res.dur && tr.d - res.dur > 6 && tr.d - res.dur < 60) offset = Math.round((tr.d - res.dur) * 0.5);
    if (typeof offs[tr.uid] === "number") offset = offs[tr.uid];
    paintOffset();
    plain = res?.plain || "";
    if (lines.length) renderSynced(res.src);
    else if (plain) {
      body.innerHTML = `<p class="lyr-badge">המילים לא מסונכרנות לשיר הזה</p>` +
        plain.split("\n").map((l) => `<p class="lyr-line plain" dir="${isRtl(l) ? "rtl" : "ltr"}">${esc(l) || "&nbsp;"}</p>`).join("") + `<p class="lyr-src">מילים: ${esc(res.src)}</p>`;
    } else {
      body.innerHTML = `<div class="lyr-empty"><p class="lyr-msg">לא מצאנו מילים לשיר הזה 🎵</p><button class="lyr-empty-btn" type="button">חפש מילים בעצמך</button></div>`;
    }
    body.classList.toggle("is-synced", !!lines.length);
    body.scrollTop = 0;
  }

  /* manual search: pick the right lyrics, remembered per song */
  function openSearch() {
    if (!track) return;
    const { title, alt } = splitTitle(track.t, track.a);
    form.hidden = false;
    form.q.value = `${title} ${alt || norm(track.a)}`.trim();
    form.q.focus(); form.q.select();
  }
  pane.querySelector(".lyr-find").addEventListener("click", () => (form.hidden ? openSearch() : (form.hidden = true)));
  body.addEventListener("click", (e) => { if (e.target.closest(".lyr-empty-btn")) openSearch(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = form.q.value.trim();
    if (!q || !track) return;
    const tr = track;
    body.innerHTML = `<div class="lyr-loading"><span></span><span></span><span></span><span></span></div>`;
    const list = ((await lrc("search", { q })) || []).filter((x) => x.syncedLyrics || x.plainLyrics).slice(0, 20);
    if (track !== tr) return;
    body.classList.remove("is-synced");
    body.scrollTop = 0;
    if (!list.length) { body.innerHTML = `<p class="lyr-msg">אין תוצאות. נסה לכתוב אחרת</p>`; return; }
    body.innerHTML = `<div class="lyr-results">` + list.map((x) => {
      const m = Math.floor((x.duration || 0) / 60), s = String(Math.round((x.duration || 0) % 60)).padStart(2, "0");
      return `<button type="button" class="lyr-res" data-id="${x.id}"><b>${esc(x.trackName)}</b><span>${esc(x.artistName)}${x.duration ? " · " + m + ":" + s : ""}</span>${x.syncedLyrics ? `<i>מסונכרן</i>` : ""}</button>`;
    }).join("") + `</div>`;
    body.querySelectorAll(".lyr-res").forEach((b) => b.addEventListener("click", () => {
      const x = list.find((y) => String(y.id) === b.dataset.id);
      if (!x) return;
      savePick(tr.uid, x.id);
      const res = toRes(x);
      cache.set(tr.uid, res);
      form.hidden = true;
      show(res, tr);
    }));
  });

  function paintOffset() {
    const box = pane.querySelector(".lyr-sync");
    box.hidden = !lines.length;
    box.querySelector(".lyr-off").textContent = offset ? (offset > 0 ? "+" : "") + offset.toFixed(1) + " שנ׳" : "סנכרון";
  }
  pane.querySelector(".lyr-sync").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-o]");
    if (!b) return;
    offset = Math.round((offset + +b.dataset.o) * 10) / 10;
    active = -2; paintOffset(); saveOff();
  });

  body.addEventListener("click", (e) => {
    const ln = e.target.closest(".lyr-line[data-i]");
    if (!ln) return;
    const t = Math.max(0, lines[+ln.dataset.i].t + offset);
    if (engine === "audio") audioEl.currentTime = t;
    else if (yt && yt.seekTo) { yt.seekTo(t, true); if (!playing) yt.playVideo(); }
    userScrollUntil = 0;
  });

  /* pause auto-scroll for a moment when the user scrolls by hand */
  let userScrollUntil = 0;
  ["wheel", "touchmove"].forEach((ev) => body.addEventListener(ev, () => { userScrollUntil = Date.now() + 3500; }, { passive: true }));

  function setOpen(on) {
    open = on;
    pane.classList.toggle("on", on);
    lyrBtn.classList.toggle("on", on);
    document.body.classList.toggle("lyrics-open", on);
    if (on && (track?.uid || "") !== loadedFor) loadFor(track);
    if (on) active = -2;
  }
  lyrBtn.addEventListener("click", () => setOpen(!open));
  pane.querySelector(".lyr-close").addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) setOpen(false); });

  /* smooth clock: player time is sampled, then interpolated between samples */
  let base = 0, baseAt = 0, lastSample = 0;
  function clock() {
    const n = performance.now();
    if (n - lastSample > 250) {
      lastSample = n;
      const real = safe(() => nowOf(), 0);
      const guess = base + (playing ? (n - baseAt) / 1000 : 0);
      if (!playing || Math.abs(real - guess) > 0.35) { base = real; baseAt = n; }
      else { base = guess + (real - guess) * 0.2; baseAt = n; }
    }
    return base + (playing ? (n - baseAt) / 1000 : 0);
  }

  /* A long lyric that wraps gets split into its visual rows so the highlight
     sweeps row by row, in reading order, instead of filling all rows at once. */
  function splitRows(el) {
    if (el._rows !== undefined || el.classList.contains("gap")) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 40;
    if (el.offsetHeight < lh * 1.6) { el._rows = null; return; }
    const words = el.textContent.split(/(\s+)/);
    el.innerHTML = words.map((w) => (/^\s+$/.test(w) ? w : `<span class="lw">${esc(w)}</span>`)).join("");
    const groups = [];
    let top = null;
    el.querySelectorAll(".lw").forEach((w) => {
      if (top === null || Math.abs(w.offsetTop - top) > 4) { groups.push([]); top = w.offsetTop; }
      groups[groups.length - 1].push(w.textContent);
    });
    el.innerHTML = groups.map((g) => `<span class="lyr-row">${esc(g.join(" "))}</span>`).join("");
    const list = [...el.querySelectorAll(".lyr-row")].map((r) => ({ el: r, n: r.textContent.length || 1 }));
    el._rows = { list, total: list.reduce((a, r) => a + r.n, 0) };
    el.classList.add("multi");
  }

  let lastCheck = 0;
  function tick() {
    requestAnimationFrame(tick);
    if (!open) return;
    const n = performance.now();
    if (n - lastCheck > 400) { lastCheck = n; if ((track?.uid || "") !== loadedFor) return loadFor(track); }
    if (!lines.length || !body.classList.contains("is-synced")) return;
    const now = clock() + 0.15 - offset;
    let i = -1;
    for (let k = 0; k < lines.length; k++) { if (lines[k].t <= now) i = k; else break; }
    const nodes = body.querySelectorAll(".lyr-line[data-i]");
    const cur = nodes[i];
    if (cur) {
      const l = lines[i];
      const p = Math.max(0, Math.min(1, (now - l.t) / Math.max(0.5, l.end - l.t)));
      cur.style.setProperty("--p", (p * 100).toFixed(1) + "%");
      const rows = cur._rows;
      if (rows) {
        let left = p * rows.total;
        for (const r of rows.list) { const f = Math.max(0, Math.min(1, left / r.n)); left -= r.n; r.el.style.setProperty("--p", (f * 100).toFixed(1) + "%"); }
      }
    }
    if (i === active) return;
    active = i;
    nodes.forEach((el, k) => {
      el.classList.toggle("now", k === i);
      if (k === i) splitRows(el);
      el.classList.toggle("past", k < i);
      el.classList.toggle("near", Math.abs(k - i) === 1);
      el.style.setProperty("--d", Math.min(Math.abs(k - Math.max(i, 0)), 4));
      if (k !== i) el.style.removeProperty("--p");
    });
    if (cur && Date.now() > userScrollUntil) body.scrollTo({ top: cur.offsetTop - body.clientHeight * 0.4 + cur.offsetHeight / 2, behavior: "smooth" });
  }
  requestAnimationFrame(tick);

  /* ================= פלייליסטים + תפריט קליק ימני ================= */
  const playlists = () => lib.filter((x) => x.kind === "playlist");
  const plDesc = (n) => `פלייליסט · ${songsWord(n)}`;
  const slimTrack = (tr) => ({ uid: tr.uid, src: tr.src, i: tr.i, t: tr.t, a: tr.a, al: tr.al || "", d: tr.d, art: tr.art, vid: tr.vid, link: tr.link, full: tr.full });

  function savePlaylist(pl, isNew) {
    pl.s = plDesc(pl.tracks.length);
    pl.art = pl.cover || pl.tracks[0]?.art || "";
    if (isNew) lib = [pl, ...lib];
    refresh();
    writeLocal();
    if ((location.hash || "").startsWith("#/pl/" + pl.id)) renderPlaylist(pl.id);
  }

  async function newPlaylist(name, first) {
    const id = Math.random().toString(36).slice(2, 9);
    const pl = { k: "pl:" + id, kind: "playlist", id, n: name, h: "#/pl/" + id, tracks: first ? [slimTrack(first)] : [] };
    savePlaylist(pl, true);
    toast(first ? `נוסף ל"${name}"` : `נוצר "${name}"`);
    return pl;
  }

  async function addToPlaylist(pl, tr) {
    if (pl.tracks.some((t) => t.uid === tr.uid)) return toast(`כבר נמצא ב"${pl.n}"`);
    if (pl.tracks.length >= 500) return toast("הפלייליסט מלא (500 שירים)");
    pl.tracks.push(slimTrack(tr));
    savePlaylist(pl);
    toast(`נוסף ל"${pl.n}"`);
  }

  function deletePlaylist(pl) {
    lib = lib.filter((x) => x.k !== pl.k);
    refresh();
    writeLocal();
    toast("הפלייליסט נמחק");
    if ((location.hash || "").startsWith("#/pl/")) location.hash = "#/library";
  }

  function askName(def, cb) {
    const wrap = document.createElement("div");
    wrap.className = "pl-ask";
    wrap.innerHTML = `<form class="pl-ask-box"><p>שם לפלייליסט</p><input maxlength="60" value="${esc(def)}"><div><button type="button" class="pl-cancel">ביטול</button><button class="pl-ok">שמור</button></div></form>`;
    document.body.appendChild(wrap);
    const inp = wrap.querySelector("input");
    inp.select();
    const close = () => wrap.remove();
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    wrap.querySelector(".pl-cancel").onclick = close;
    wrap.querySelector("form").onsubmit = (e) => { e.preventDefault(); const v = inp.value.trim(); if (!v) return; close(); cb(v); };
    inp.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  function pickCover(pl) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (!f) return;
      if (f.size > 15e6) return toast("התמונה גדולה מדי");
      const img = new Image();
      img.onload = () => {
        const S = 400, c = document.createElement("canvas");
        c.width = c.height = S;
        const m = Math.min(img.width, img.height);
        c.getContext("2d").drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
        pl.cover = c.toDataURL("image/jpeg", 0.82);
        URL.revokeObjectURL(img.src);
        savePlaylist(pl).then(() => toast("התמונה עודכנה"));
      };
      img.onerror = () => toast("לא הצלחנו לקרוא את התמונה");
      img.src = URL.createObjectURL(f);
    };
    inp.click();
  }
  window.wavoNewPlaylist = () => { askName(`הפלייליסט שלי #${playlists().length + 1}`, (n) => newPlaylist(n).then((pl) => (location.hash = pl.h))); };

  const libHead = document.querySelector(".lib-head");
  if (libHead && !libHead.querySelector(".lib-new")) {
    const nb = document.createElement("button");
    nb.className = "lib-new"; nb.title = "פלייליסט חדש"; nb.setAttribute("aria-label", "פלייליסט חדש");
    nb.textContent = "＋";
    nb.onclick = () => window.wavoNewPlaylist();
    libHead.appendChild(nb);
  }
  function paintRail() {
    const rail = document.querySelector(".rail");
    if (!rail) return;
    let box = rail.querySelector(".rail-pls");
    if (!box) { box = document.createElement("div"); box.className = "rail-pls"; rail.appendChild(box); }
    const hash = location.hash || "";
    box.innerHTML = "";
    playlists().forEach((pl) => {
      const a = document.createElement("a");
      a.className = "rail-pl" + (hash === pl.h ? " on" : "");
      a.href = pl.h; a.title = pl.n; a.setAttribute("aria-label", pl.n);
      a.innerHTML = pl.art ? `<img alt="" src="${esc(pl.art)}">` : "♪";
      box.appendChild(a);
    });
    const add = document.createElement("button");
    add.className = "rail-pl add"; add.title = "פלייליסט חדש"; add.setAttribute("aria-label", "פלייליסט חדש"); add.textContent = "＋";
    add.onclick = () => window.wavoNewPlaylist();
    box.appendChild(add);
  }
  window.addEventListener("hashchange", () => paintRail());
  let ctx = null;
  function closeCtx() { if (ctx) { ctx.remove(); ctx = null; } }
  function openCtx(x, y, tr, fromPl) {
    closeCtx();
    ctx = document.createElement("div");
    ctx.className = "ctx";
    ctx.setAttribute("role", "menu");
    const liked = likes.has(tr.uid);
    const pls = playlists();
    ctx.innerHTML = `
      <div class="ctx-head"><img alt="" src="${esc(tr.art)}"><span><b>${esc(tr.t)}</b><i>${esc(tr.a)}</i></span></div>
      <button data-a="play">נגן עכשיו</button>
      <button data-a="like">${liked ? "הסר מאהבתי" : "הוסף לשירים שאהבתי"}</button>
      ${tr.src === "catalog" ? `<button data-a="artist">עבור לאמן</button>` : ""}
      <div class="ctx-sep"></div>
      <p class="ctx-label">הוסף לפלייליסט</p>
      <button data-a="new" class="ctx-new">＋ פלייליסט חדש</button>
      <div class="ctx-pls">${pls.map((p, n) => `<button data-a="pl" data-n="${n}">${esc(p.n)}<small>${p.tracks.length}</small></button>`).join("")}</div>
      ${fromPl ? `<div class="ctx-sep"></div><button data-a="rm" class="ctx-danger">הסר מהפלייליסט הזה</button>` : ""}`;
    document.body.appendChild(ctx);
    const r = ctx.getBoundingClientRect();
    ctx.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px";
    ctx.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + "px";
    ctx.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const a = b.dataset.a;
      closeCtx();
      if (a === "play") playTrack(tr, true);
      else if (a === "like") like(tr);
      else if (a === "artist") location.hash = "#/artist/" + encodeURIComponent(tr.a);
      else if (a === "new") askName(`הפלייליסט שלי #${pls.length + 1}`, (n) => newPlaylist(n, tr));
      else if (a === "pl") addToPlaylist(pls[+b.dataset.n], tr);
      else if (a === "rm") { fromPl.tracks = fromPl.tracks.filter((t) => t.uid !== tr.uid); savePlaylist(fromPl); toast("הוסר מהפלייליסט"); }
    });
  }

  document.addEventListener("contextmenu", (e) => {
    const host = e.target.closest && e.target.closest(".row, .tile, .wcard, .nrow");
    if (!host || !host._tr) return;
    e.preventDefault();
    const m = (location.hash || "").match(/^#\/pl\/(\w+)/);
    const fromPl = m ? playlists().find((p) => p.id === m[1]) : null;
    openCtx(e.clientX, e.clientY, host._tr, fromPl);
  });
  /* phones: press and hold a song to open the same menu */
  let lpT = 0, lpXY = null, lpFired = false;
  document.addEventListener("touchstart", (e) => {
    const host = e.target.closest && e.target.closest(".row, .tile, .wcard, .nrow");
    if (!host || !host._tr || e.touches.length > 1) return;
    const t = e.touches[0]; lpXY = [t.clientX, t.clientY]; lpFired = false;
    clearTimeout(lpT);
    lpT = setTimeout(() => {
      lpFired = true;
      const m = (location.hash || "").match(/^#\/pl\/(\w+)/);
      openCtx(lpXY[0], lpXY[1], host._tr, m ? playlists().find((p) => p.id === m[1]) : null);
      navigator.vibrate?.(15);
    }, 480);
  }, { passive: true });
  document.addEventListener("touchmove", (e) => { const t = e.touches[0]; if (lpXY && Math.hypot(t.clientX - lpXY[0], t.clientY - lpXY[1]) > 10) clearTimeout(lpT); }, { passive: true });
  document.addEventListener("touchend", (e) => { clearTimeout(lpT); if (lpFired) { e.preventDefault(); lpFired = false; } });
  document.addEventListener("click", (e) => { if (ctx && !ctx.contains(e.target)) closeCtx(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCtx(); });
  window.addEventListener("scroll", closeCtx, true);
  window.addEventListener("resize", closeCtx);

  function renderPlaylist(id) {
    const pl = playlists().find((p) => p.id === id);
    if (!pl) {
      viewEl.innerHTML = `<h1 class="greet">פלייליסט</h1><p class="no-results on">הפלייליסט לא נמצא</p>`;
      return;
    }
    const mins = Math.round(pl.tracks.reduce((n, t) => n + (t.d || 0), 0) / 60);
    viewEl.innerHTML = `
      <section class="ahero pl-hero">
        <button class="pl-cover" id="plCover" title="בחר תמונה">${pl.art ? `<img alt="" src="${esc(pl.art)}">` : `<div class="pl-blank">♪</div>`}<span>בחר תמונה</span></button>
        <div><p class="kind">פלייליסט</p><h1></h1>
        <p class="desc">${songsWord(pl.tracks.length)}${mins ? ` · ${mins} דקות` : ""}</p>
        <div class="pl-acts">${pl.tracks.length ? `<button class="play-big" id="plPlay">${PLAY}</button>` : ""}
          <button class="lib-add" id="plPic">תמונה</button><button class="lib-add" id="plRename">שנה שם</button><button class="lib-add" id="plDel">מחק</button></div></div>
      </section>`;
    viewEl.querySelector("h1").textContent = pl.n;
    el("plCover").onclick = el("plPic").onclick = () => pickCover(pl);
    el("plRename").onclick = () => askName(pl.n, (n) => { pl.n = n; savePlaylist(pl); });
    el("plDel").onclick = () => { if (confirm(`למחוק את "${pl.n}"?`)) deletePlaylist(pl); };
    if (!pl.tracks.length) {
      viewEl.insertAdjacentHTML("beforeend", `<div class="lib-empty big"><p class="lib-empty-t">הפלייליסט ריק</p><p class="lib-empty-s">לחץ קליק ימני על כל שיר ובחר "${esc(pl.n)}"</p></div>`);
      return;
    }
    el("plPlay").onclick = () => playTrack(pl.tracks[0], true);
    viewEl.appendChild(headRow());
    const box = document.createElement("div");
    box.className = "rows";
    viewEl.appendChild(box);
    pl.tracks.forEach((tr, n) => box.appendChild(rowShell(tr, n)));
    playQueue = pl.tracks.slice();
    qPos = track ? playQueue.findIndex((t) => t.uid === track.uid) : -1;
  }
  const plRoute = () => {
    const m = (location.hash || "").match(/^#\/pl\/(\w+)/);
    if (m) { viewEl.dataset.view = "library"; renderPlaylist(m[1]); }
  };
  window.addEventListener("hashchange", plRoute);
  const _refresh = refresh;
  refresh = function () { _refresh(); plRoute(); paintRail(); };
  paintRail();
  plRoute();

  const _play = window.playTrack;
  window.playTrack = function (tr, start) { const r = _play(tr, start); if (tr) setTimeout(() => fetchLyrics(tr).catch(() => {}), 400); return r; };

  /* ================= טעינת הספרייה ================= */
  loadLib();
})();

/* ---- smooth mouse-wheel scrolling (eases instead of jumping) ---- */
(() => {
  const st = new WeakMap();
  const scroller = (n) => {
    for (; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return document.scrollingElement;
  };
  addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    let d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    if (Math.abs(d) < 40) return; // trackpads are already smooth
    const el = scroller(e.target);
    if (!el) return;
    e.preventDefault();
    let s = st.get(el);
    if (!s) { s = { y: el.scrollTop, run: false }; st.set(el, s); }
    if (!s.run) s.y = el.scrollTop;
    s.y = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, s.y + d));
    if (s.run) return;
    s.run = true;
    const step = () => {
      const diff = s.y - el.scrollTop;
      if (Math.abs(diff) < 0.6) { el.scrollTop = s.y; s.run = false; return; }
      el.scrollTop += diff * 0.16;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, { passive: false });
})();
