"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const CHROME_HEIGHT = 40;

const version = (() => {
  const match = process.argv.find((arg) => arg.startsWith("--wavo-version="));
  return match ? match.slice("--wavo-version=".length) : "";
})();

// Palette mirrors public/wavo/fresh.css: warm charcoal surfaces, one hot accent.
const CSS = `
:root { --wavo-chrome: ${CHROME_HEIGHT}px; }

html[data-wavo-desktop="1"] body { padding-top: var(--wavo-chrome) !important; }
html[data-wavo-desktop="1"] .app {
  height: calc(100vh - var(--player-h) - var(--wavo-chrome)) !important;
}
html[data-wavo-desktop="1"] .lyrics {
  inset: var(--wavo-chrome) 0 calc(var(--player-h) + var(--wavo-chrome)) 0 !important;
}
html[data-wavo-desktop="1"] body { overscroll-behavior: none; }
html[data-wavo-desktop="1"] img { -webkit-user-drag: none; }

#wavo-titlebar {
  position: fixed; inset: 0 0 auto 0; height: var(--wavo-chrome);
  z-index: 2147483000; display: flex; align-items: center; direction: ltr;
  padding-inline: 6px; gap: 4px;
  background:
    radial-gradient(120% 180% at 100% 0%, rgba(240, 135, 58, 0.13), transparent 62%),
    linear-gradient(180deg, #241f1b 0%, #17130f 100%);
  border-bottom: 1px solid rgba(58, 52, 47, 0.85);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045);
  font-family: Rubik, Heebo, system-ui, sans-serif;
  -webkit-app-region: drag; user-select: none;
}
#wavo-titlebar::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px;
  background: linear-gradient(90deg, transparent 6%, rgba(240, 135, 58, 0.55) 50%, transparent 94%);
  pointer-events: none;
}
#wavo-titlebar .wtb-controls { display: flex; align-items: center; gap: 2px; -webkit-app-region: no-drag; flex: none; }
#wavo-titlebar .wtb-btn {
  width: 38px; height: 28px; display: grid; place-items: center; border-radius: 8px;
  border: 0; background: transparent; color: #a79c90; cursor: default; padding: 0;
  transition: background .14s ease, color .14s ease;
}
#wavo-titlebar .wtb-btn svg {
  width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.5;
  stroke-linecap: round; stroke-linejoin: round;
}
#wavo-titlebar .wtb-btn:hover { background: rgba(255, 245, 235, 0.085); color: #fdf7f0; }
#wavo-titlebar .wtb-btn:active { background: rgba(255, 245, 235, 0.14); }
#wavo-titlebar .wtb-btn.wtb-close:hover { background: #d9484c; color: #fff; }
#wavo-titlebar .wtb-btn:focus { outline: none; }
#wavo-titlebar .wtb-btn:focus-visible { outline: 1px solid rgba(240, 135, 58, 0.75); outline-offset: 1px; }

#wavo-titlebar .wtb-ticker {
  display: flex; align-items: center; gap: 8px; margin-inline: auto;
  max-width: 46vw; min-width: 0; padding-inline: 14px;
  color: #b3a79a; font-size: 0.72rem; font-weight: 500; letter-spacing: 0.01em;
  opacity: 0; transition: opacity .35s ease; pointer-events: none;
}
#wavo-titlebar .wtb-ticker[data-on="1"] { opacity: 0.92; }
#wavo-titlebar .wtb-now { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#wavo-titlebar .wtb-eq { display: flex; align-items: flex-end; gap: 2.5px; height: 12px; flex: none; }
#wavo-titlebar .wtb-eq i {
  width: 2.5px; height: 35%; border-radius: 2px;
  background: linear-gradient(180deg, #ffb878, #f0873a);
  opacity: .55;
}
html[data-wavo-playing="1"] #wavo-titlebar .wtb-eq i {
  opacity: 1; animation: wtb-eq 780ms ease-in-out infinite alternate;
}
#wavo-titlebar .wtb-eq i:nth-child(2) { animation-delay: .17s; }
#wavo-titlebar .wtb-eq i:nth-child(3) { animation-delay: .34s; }
@keyframes wtb-eq { from { height: 22%; } to { height: 100%; } }

#wavo-titlebar .wtb-brand {
  display: flex; align-items: center; gap: 9px; flex: none;
  padding-inline: 12px 10px; color: #f6f0e8;
  font-size: 0.72rem; font-weight: 800; letter-spacing: 0.26em;
}
#wavo-titlebar .wtb-brand svg { width: 17px; height: 17px; filter: drop-shadow(0 2px 6px rgba(240, 135, 58, .45)); }
#wavo-titlebar .wtb-brand small {
  font-size: 0.55rem; font-weight: 600; letter-spacing: 0.16em; color: #a1958a;
  padding: 2px 8px; border: 1px solid rgba(240, 135, 58, 0.28); border-radius: 999px;
  background: rgba(240, 135, 58, 0.07);
}
@media (max-width: 1100px) {
  #wavo-titlebar .wtb-brand small { display: none; }
  #wavo-titlebar .wtb-ticker { max-width: 34vw; }
}
`;

const MARK = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <rect x="4" y="11" width="3.6" height="8" rx="1.8" fill="#ffb878" stroke="none"/>
  <rect x="10.2" y="7" width="3.6" height="12" rx="1.8" fill="#f0873a" stroke="none"/>
  <rect x="16.4" y="4" width="3.6" height="15" rx="1.8" fill="#ffb878" stroke="none"/>
</svg>`;

function windowButton(kind, label, svg) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `wtb-btn${kind === "close" ? " wtb-close" : ""}`;
  element.dataset["wtb"] = kind;
  element.setAttribute("aria-label", label);
  element.title = label;
  element.innerHTML = svg;
  // Keep the desktop chrome from stealing focus when clicked.
  element.addEventListener("mousedown", (event) => event.preventDefault());
  element.addEventListener("click", (event) => {
    event.preventDefault();
    if (kind === "min") ipcRenderer.send("wavo:minimize");
    else if (kind === "max") ipcRenderer.send("wavo:maximize");
    else if (kind === "close") ipcRenderer.send("wavo:close");
  });
  return element;
}

const ICONS = {
  min: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>`,
  max: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5"/></svg>`,
  restore: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="8" width="12" height="12" rx="2.5"/><path d="M8 8V6.5A2.5 2.5 0 0 1 10.5 4H18a2.5 2.5 0 0 1 2.5 2.5V14a2.5 2.5 0 0 1-2.5 2.5h-1.5"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
};

let maxButton = null;

function renderWindowState(isMaximized) {
  if (!maxButton) return;
  maxButton.innerHTML = isMaximized ? ICONS.restore : ICONS.max;
  maxButton.setAttribute("aria-label", isMaximized ? "שחזור" : "הגדלה");
  maxButton.title = isMaximized ? "שחזור" : "הגדלה";
}

// Mirrors the app's "מנגן: …" line into the titlebar, with a live equalizer.
function mountTicker(bar, brand) {
  const ticker = document.createElement("div");
  ticker.className = "wtb-ticker";
  ticker.dataset["on"] = "0";

  const eq = document.createElement("span");
  eq.className = "wtb-eq";
  eq.innerHTML = "<i></i><i></i><i></i>";

  const label = document.createElement("span");
  label.className = "wtb-now";
  ticker.append(eq, label);

  bar.insertBefore(ticker, brand);

  const bindNowPlaying = () => {
    const source = document.getElementById("playingNow");
    if (!source) return setTimeout(bindNowPlaying, 400);
    const sync = () => {
      const text = (source.textContent || "").trim().replace(/^מנגן:?\s*/, "");
      label.textContent = text;
      ticker.dataset["on"] = text ? "1" : "0";
      ticker.title = text;
    };
    new MutationObserver(sync).observe(source, { childList: true, characterData: true, subtree: true });
    sync();
  };
  bindNowPlaying();

  const bindPlaybackState = () => {
    if (!document.body) return setTimeout(bindPlaybackState, 200);
    const sync = () => {
      const playing = document.body.classList.contains("is-playing");
      document.documentElement.dataset["wavoPlaying"] = playing ? "1" : "0";
    };
    new MutationObserver(sync).observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    sync();
  };
  bindPlaybackState();
}

function mountTitlebar() {
  if (!document.body || document.getElementById("wavo-titlebar")) return;
  if (document.documentElement.dataset["wavoDesktop"] === "1") return;
  document.documentElement.dataset["wavoDesktop"] = "1";

  const style = document.createElement("style");
  style.id = "wavo-desktop-style";
  style.textContent = CSS;
  document.head.appendChild(style);

  const bar = document.createElement("div");
  bar.id = "wavo-titlebar";

  const controls = document.createElement("div");
  controls.className = "wtb-controls";
  maxButton = windowButton("max", "הגדלה", ICONS.max);
  controls.append(
    windowButton("min", "מזעור", ICONS.min),
    maxButton,
    windowButton("close", "סגירה", ICONS.close),
  );

  const brand = document.createElement("div");
  brand.className = "wtb-brand";
  brand.innerHTML = `${MARK}<span>WAVO</span><small>DESKTOP${version ? ` · ${version}` : ""}</small>`;

  bar.append(controls, brand);
  document.body.prepend(bar);
  mountTicker(bar, brand);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountTitlebar, { once: true });
} else {
  mountTitlebar();
}

ipcRenderer.on("wavo:window-state", (_event, isMaximized) => {
  renderWindowState(Boolean(isMaximized));
});

ipcRenderer.on("wavo:media", (_event, command) => {
  const id = command === "toggle" ? "toggle" : command === "next" ? "next" : command === "prev" ? "prev" : null;
  if (!id) return;
  const control = document.getElementById(id);
  if (control) control.click();
});

contextBridge.exposeInMainWorld("wavoDesktop", {
  isDesktop: true,
  version,
  platform: process.platform,
  minimize: () => ipcRenderer.send("wavo:minimize"),
  toggleMaximize: () => ipcRenderer.send("wavo:maximize"),
  close: () => ipcRenderer.send("wavo:close"),
  openExternal: (url) => ipcRenderer.send("wavo:open-external", url),
});
