/* WAVO phone mode: detects phones and adds a bottom tab bar. */
(function () {
  const isPhone = () =>
    /Android|iPhone|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (matchMedia("(pointer: coarse)").matches && innerWidth <= 900) ||
    innerWidth <= 640;

  const apply = () => document.body.classList.toggle("is-phone", isPhone());
  apply();
  addEventListener("resize", apply);

  if (document.querySelector(".tabbar")) return;
  const icon = {
    home: '<path d="M3 11.5 12 4l9 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 10.5V20h12v-9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    search: '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    library: '<path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  };
  const nav = document.createElement("nav");
  nav.className = "tabbar";
  nav.setAttribute("aria-label", "ניווט");
  nav.innerHTML = `
    <a href="#/home" data-tab="home"><svg viewBox="0 0 24 24">${icon.home}</svg><span>בית</span></a>
    <a href="#/search" data-tab="search"><svg viewBox="0 0 24 24">${icon.search}</svg><span>חיפוש</span></a>
    <a href="#/library" data-tab="library"><svg viewBox="0 0 24 24">${icon.library}</svg><span>הספרייה</span></a>`;
  document.body.appendChild(nav);

  nav.querySelector('[data-tab="search"]').addEventListener("click", () =>
    setTimeout(() => document.getElementById("search")?.focus(), 60));

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
(function addPhoneLyrics() {
  const src = document.getElementById("lyrBtn");
  const now = document.querySelector(".player .now");
  if (!src || !now) return setTimeout(addPhoneLyrics, 300);
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
  banner.textContent = "מצב לא מקוון — только каталог и сохранённые";
  banner.style.cssText = "display:none;position:fixed;top:0;left:0;right:0;z-index:9999;background:#b33;color:#fff;text-align:center;padding:6px 10px;font-size:13px;font-weight:600;";
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
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    const dt = Date.now() - t0;
    if (dt > 600 || (Math.abs(dx) < 60 && Math.abs(dy) < 60)) { target = null; return; }
    if (Math.abs(dx) > Math.abs(dy)) {
      // horizontal swipe -> next/prev track
      if (dx < 0 && typeof step === "function") { try { step(1); navigator.vibrate?.(8); } catch (e) {} }
      else if (dx > 0 && typeof step === "function") { try { step(-1); navigator.vibrate?.(8); } catch (e) {} }
    } else if (dy > 80) {
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
