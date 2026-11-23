/* WAVO welcome: first-run name → 3+ favorite artists → a white baseball,
   then a typed "ברוך הבא, <name>" reveal. */
(function () {
  const KEY = "wavo.name";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function readName() {
    try { return String(JSON.parse(localStorage.getItem(KEY) || '""') || "").trim(); } catch { return ""; }
  }
  function writeName(name) {
    try { localStorage.setItem(KEY, JSON.stringify(name)); } catch {}
  }
  const onboarded = () => (typeof window.wavoOnboarded === "function" && window.wavoOnboarded());

  /* ---------- first-run name prompt (once only) ---------- */
  function showPrompt(onboarding = false) {
    if (document.getElementById("wavoWelcome")) return;
    const box = document.createElement("div");
    box.id = "wavoWelcome";
    box.className = "wl-overlay";
    box.innerHTML = `
      <div class="wl-card" role="dialog" aria-modal="true" aria-labelledby="wlTitle">
        <div class="wl-orb" aria-hidden="true"><i></i><i></i><b>W</b></div>
        <span class="wl-kicker">WAVO · התחברות ראשונה</span>
        <h2 id="wlTitle" class="wl-title">ברוכים הבאים!</h2>
        <p class="wl-sub">איך קוראים לך? נשמור את זה כאן, במכשיר שלך.</p>
        <form class="wl-form">
          <input class="wl-input" name="name" maxlength="24" autocomplete="given-name"
                 placeholder="השם שלך…" aria-label="השם שלך" required>
          <button class="wl-go" type="submit">יאללה <span aria-hidden="true">✦</span></button>
        </form>
        <p class="wl-hint">השם נבחר פעם אחת — אפשר להתחיל מחדש בהגדרות</p>
      </div>`;
    document.body.appendChild(box);
    const input = box.querySelector(".wl-input");
    input.focus();

    box.querySelector(".wl-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/\s+/g, " ").slice(0, 24);
      if (!name) { input.focus(); return; }
      writeName(name);
      box.remove();
      if (onboarding) showFavorites(name);
      else {
        playWelcome(name);
        if (typeof window.route === "function") window.route();
      }
    });
  }

  /* ---------- step two: three favorite artists or more (optional) ---------- */
  function showFavorites(name, fromSettings = false) {
    if (document.getElementById("wavoFavorites")) return;
    const names = (typeof topArtists !== "undefined" && Array.isArray(topArtists)) ? topArtists.slice(0, 30) : [];
    const saved = (typeof window.wavoFavorites === "function") ? window.wavoFavorites() : [];
    const picked = new Set(saved.filter((a) => names.includes(a)));
    const pics = {};
    if (typeof songs !== "undefined" && Array.isArray(songs)) {
      names.forEach((name) => {
        const s = songs.find((x) => x.a === name);
        if (s && s.yt) pics[name] = `https://i.ytimg.com/vi/${encodeURIComponent(s.yt)}/hqdefault.jpg`;
      });
    }

    const box = document.createElement("div");
    box.id = "wavoFavorites";
    box.className = "wl-overlay wl-artists-overlay";
    box.innerHTML = `
      <div class="wl-card wl-artists" role="dialog" aria-modal="true" aria-labelledby="wlFavTitle">
        <div class="wl-orb" aria-hidden="true"><i></i><i></i><b>W</b></div>
        <span class="wl-kicker">WAVO · ${fromSettings ? "ההעדפות שלך" : "שלב 2 מתוך 2"}</span>
        <h2 id="wlFavTitle" class="wl-title">איזה אמנים אתה אוהב?</h2>
        <p class="wl-sub">בחר 3 אמנים או יותר ונמליץ לך לפי הטעם שלך. אפשר גם לדלג — זה נשמר רק במכשיר שלך.</p>
        <div class="wl-fav-count" aria-live="polite"></div>
        <div class="wl-artist-list" role="group" aria-label="אמנים מועדפים">
          ${names.map((a) => `<button type="button" class="wl-artist" data-artist="${esc(a)}">${pics[a] ? `<img class="wl-artist-pic" loading="lazy" alt="" src="${esc(pics[a])}">` : `<span class="wl-artist-pic wl-artist-photo" aria-hidden="true">♪</span>`}<span class="wl-artist-name">${esc(a)}</span><span class="wl-check" aria-hidden="true">✓</span></button>`).join("")}
        </div>
        <div class="wl-actions">
          <button type="button" class="wl-go wl-done">סיום <span aria-hidden="true">✦</span></button>
          <button type="button" class="wl-skip">דלג בינתיים</button>
        </div>
        <p class="wl-hint">אפשר לשנות את הבחירה בכל רגע בהגדרות</p>
      </div>`;
    document.body.appendChild(box);

    const list = box.querySelector(".wl-artist-list");
    const countEl = box.querySelector(".wl-fav-count");
    const done = box.querySelector(".wl-done");

    function paint() {
      countEl.textContent = picked.size ? `נבחרו ${picked.size} אמנים` : "בחר 3 אמנים או יותר";
      Array.from(list.children).forEach((b) => {
        const on = picked.has(b.dataset.artist);
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
      done.innerHTML = picked.size ? `סיום · ${picked.size} <span aria-hidden="true">✦</span>` : 'סיום <span aria-hidden="true">✦</span>';
    }
    list.addEventListener("click", (e) => {
      const b = e.target.closest(".wl-artist");
      if (!b) return;
      const a = b.dataset.artist;
      if (picked.has(a)) picked.delete(a);
      else picked.add(a);
      paint();
    });
    paint();
    (list.querySelector(".wl-artist") || done).focus();

    function finish() {
      if (typeof window.wavoSetFavoriteArtists === "function") window.wavoSetFavoriteArtists(Array.from(picked));
      box.remove();
      if (fromSettings) {
        if (typeof window.toast === "function") window.toast("האמנים המועדפים נשמרו");
        return;
      }
      playWelcome(name);
      if (typeof window.route === "function") window.route();
    }
    done.addEventListener("click", finish);
    box.querySelector(".wl-skip").addEventListener("click", finish);
  }

  /* ---------- white baseball only → typed welcome ---------- */
  function playWelcome(name) {
    const show = document.createElement("div");
    show.className = "wl-burst";
    show.setAttribute("aria-live", "polite");
    show.setAttribute("aria-label", `ברוך הבא ${name}`);
    show.innerHTML = `
      <div class="wl-stage" aria-hidden="true">
        <div class="wl-ball"><i></i><i></i></div>
        <div class="wl-shadow"></div>
      </div>
      <div class="wl-reveal">
        <span class="wl-tag">✦ WAVO ✦</span>
        <h2 class="wl-welcome"><span class="wl-typed"></span><span class="wl-caret" aria-hidden="true"></span></h2>
        <p class="wl-subtitle">המוזיקה מתחילה עכשיו</p>
      </div>`;
    document.body.appendChild(show);

    const typed = show.querySelector(".wl-typed");
    const phrase = `ברוך הבא, ${name}`;
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      at(220, () => { typed.textContent = phrase; show.classList.add("typed"); });
      at(2400, () => { timers.forEach(clearTimeout); show.remove(); });
      return;
    }

    let i = 0;
    at(1900, function type() {
      typed.textContent = phrase.slice(0, ++i);
      if (i < phrase.length) at(68, type);
      else show.classList.add("typed");
    });
    at(6200, () => { timers.forEach(clearTimeout); show.remove(); });
  }

  /* exposed so these can be reopened later from settings */
  window.wavoChangeName = () => showPrompt(true);
  window.wavoChooseFavorites = () => showFavorites(readName(), true);
  window.wavoRestartOnboarding = () => showPrompt(true);

  if (!readName() || !onboarded()) {
    const start = () => showPrompt(!readName());
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }
})();
