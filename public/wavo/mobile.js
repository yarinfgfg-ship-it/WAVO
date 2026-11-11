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
