/* WAVO phone mode: detects phones and adds a bottom tab bar. */
(function () {
  const isPhone = () =>
    /Android|iPhone|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (matchMedia("(pointer: coarse)").matches && innerWidth <= 900) ||
    innerWidth <= 640;

  const apply = () => document.body.classList.toggle("is-phone", isPhone());
  apply();
  addEventListener("resize", apply);
  addEventListener("orientationchange", () => setTimeout(apply, 120));

  if (document.querySelector(".tabbar")) return;
  const icon = {
    home: '<path d="M3 11.5 12 4l9 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 10.5V20h12v-9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    liked: '<path d="M12 20.3 5.2 13.9C3.3 12.1 2.6 10.2 2.9 8.4 3.3 6 5.4 4.3 7.9 4.6c1.7.2 3.2 1.2 4.1 2.7.9-1.5 2.4-2.5 4.1-2.7 2.5-.3 4.6 1.4 5 3.8.3 1.8-.4 3.7-2.3 5.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    library: '<path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  };
  const nav = document.createElement("nav");
  nav.className = "tabbar";
  nav.setAttribute("aria-label", "ניווט");
  nav.innerHTML = `
    <a href="#/home" data-tab="home"><svg viewBox="0 0 24 24">${icon.home}</svg><span>בית</span></a>
    <a href="#/library" data-tab="library"><svg viewBox="0 0 24 24">${icon.library}</svg><span>הספרייה</span></a>
    <a href="#/liked" data-tab="liked"><svg viewBox="0 0 24 24">${icon.liked}</svg><span>אהבתי</span></a>`;
  document.body.appendChild(nav);

  const mark = () => {
    const h = (location.hash || "#/home").split("/")[1] || "home";
    nav.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.tab === h));
  };
  addEventListener("hashchange", mark);
  mark();
})();
/* tap the mini player's song info to open the full song view */
document.addEventListener("click", (e) => {
  if (!document.body.classList.contains("is-phone")) return;
  if (e.target.closest(".player .now") && !e.target.closest("button")) document.getElementById("npBtn")?.click();
});
/* phone: lyrics button inside the mini player */
(function addPhoneLyrics(tries = 0) {
  const src = document.getElementById("lyrBtn");
  const now = document.querySelector(".player .now");
  if (!src || !now) return tries < 20 ? setTimeout(() => addPhoneLyrics(tries + 1), 300) : undefined;
  if (document.getElementById("lyrBtnPhone")) return;
  const b = document.createElement("button");
  b.id = "lyrBtnPhone"; b.className = "icon-btn sm phone-lyr";
  b.setAttribute("aria-label", "מילים");
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 6.5a4 4 0 1 1 4 4"/><path d="m14.5 9.5-9 9a1.6 1.6 0 0 1-2.2-2.2l9-9"/></svg>';
  b.addEventListener("click", (e) => { e.stopPropagation(); src.click(); });
  new MutationObserver(() => b.classList.toggle("on", src.classList.contains("on"))).observe(src, { attributes: true });
  now.appendChild(b);
})();


/* ---------- offline indicator ---------- */
(function () {
  const banner = document.createElement("div");
  banner.id = "offlineBanner";
  banner.textContent = "מצב לא מקוון — אפשר לעיין בקטלוג, נגינה דורשת אינטרנט";
  banner.style.cssText = "display:none;position:fixed;top:0;left:0;right:0;z-index:9999;background:#8a2f20;color:#fff;text-align:center;padding:calc(6px + env(safe-area-inset-top)) 12px 6px;font-size:13px;font-weight:600;pointer-events:none;";
  document.body.appendChild(banner);
  const update = () => { banner.style.display = navigator.onLine ? "none" : "block"; };
  addEventListener("online", update);
  addEventListener("offline", update);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", update);
  update();
})();

/* ---------- swipe gestures on phone ---------- */
(function () {
  if (!matchMedia("(pointer: coarse)").matches) return;
  let sx = 0, sy = 0, t0 = 0, target = null;
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; t0 = Date.now();
    target = e.target.closest && e.target.closest(".stage, .np, .view");
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!target) return;
    if (target.closest("input, textarea, #bar, .ctx, .modal")) { target = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    const dt = Date.now() - t0;
    if (dt > 600 || (Math.abs(dx) < 60 && Math.abs(dy) < 60)) { target = null; return; }
    if (Math.abs(dx) > Math.abs(dy)) {
      // horizontal swipe -> next/prev track
      if (dx < 0 && typeof step === "function") { try { step(1); navigator.vibrate?.(8); } catch (e) {} }
      else if (dx > 0 && typeof step === "function") { try { step(-1); navigator.vibrate?.(8); } catch (e) {} }
    } else if (dy > 80 && target.classList.contains("np")) {
      // swipe down -> close now-playing
      const np = document.getElementById("npClose");
      if (np) np.click();
    }
    target = null;
  }, { passive: true });
})();

/* ---------- haptic feedback on tap ---------- */
(function () {
  if (!navigator.vibrate) return;
  document.addEventListener("click", (e) => {
    const host = e.target.closest && e.target.closest(".tile, .row, .tabbar a, .rail-btn, .win-btn");
    if (host) navigator.vibrate(6);
  }, { passive: true });
})();


/* ---------- settings button on phone topbar ---------- */
(function addPhoneSettings(tries = 0) {
  if (!document.body.classList.contains('is-phone') || tries >= 40) return;
  const topbar = document.querySelector(".topbar");
  if (!topbar) return setTimeout(() => addPhoneSettings(tries + 1), 300);
  if (document.getElementById("settingsBtnPhone")) return;
  const b = document.createElement("button");
  b.id = "settingsBtnPhone"; b.className = "icon-btn sm phone-settings";
  b.setAttribute("aria-label", "הגדרות");
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  b.addEventListener("click", (e) => { e.stopPropagation(); if (typeof window.openSettings === "function") window.openSettings(); });
  // insert before win-controls or at end of topbar
  const anchor = topbar.querySelector(".playing-now") || topbar.lastElementChild;
  topbar.insertBefore(b, anchor);
})();
