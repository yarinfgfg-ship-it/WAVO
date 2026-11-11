/* Assembles www/ — the static bundle Capacitor wraps into the iOS app.
   The player stays plain JS; iOS-only differences are applied here so the
   desktop build and public/wavo sources are left untouched. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "public");
const out = path.join(root, "www");

const VERSION = 1;
const q = (f) => `${f}?v=${VERSION}`;

function replace(text, from, to, label) {
  const found = from instanceof RegExp ? from.test(text) : text.includes(from);
  if (!found) throw new Error(`ios build: ${label} — pattern not found:\n${from}`);
  return text.replace(from, to);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "wavo"), { recursive: true });
fs.cpSync(path.join(src, "wavo"), path.join(out, "wavo"), { recursive: true });
fs.copyFileSync(path.join(src, "favicon.png"), path.join(out, "favicon.png"));
fs.cpSync(path.join(src, "icons"), path.join(out, "icons"), { recursive: true });

/* ---------- index.html ---------- */
let html = fs.readFileSync(path.join(src, "wavo", "app.html"), "utf8");

html = replace(
  html,
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n' +
    '  <meta name="apple-mobile-web-app-capable" content="yes">\n' +
    '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
    '  <meta name="apple-mobile-web-app-title" content="WAVO">\n' +
    '  <meta name="format-detection" content="telephone=no">\n' +
    '  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  "viewport / apple meta",
);

html = replace(
  html,
  '<link rel="stylesheet" href="style.css?v=11">',
  [
    `<link rel="stylesheet" href="${q("style.css")}">`,
    `<link rel="stylesheet" href="${q("extras.css")}">`,
    `<link rel="stylesheet" href="${q("polish.css")}">`,
    '<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;800;900&display=swap" rel="stylesheet">',
    `<link rel="stylesheet" href="${q("fresh.css")}">`,
    `<link rel="stylesheet" href="${q("ios.css")}">`,
  ].join("\n  "),
  "stylesheet stack",
);

// The window buttons stay in the markup: script.js binds them unconditionally.
// ios.css hides them.
html = replace(
  html,
  /  <script src="songs\.js\?v=11"><\/script>[\s\S]*?<script src="script\.js\?v=11"><\/script>/,
  ["ios.js", "songs.js", "channels.js", "providers.js", "script.js", "extras.js", "mobile.js"]
    .map((f) => `  <script src="${q(f)}"></script>`)
    .join("\n"),
  "script order",
);

html = replace(html, 'src="/favicon.png"', 'src="favicon.png"', "rail logo path");
fs.writeFileSync(path.join(out, "index.html"), html);

/* ---------- script.js ---------- */
let player = fs.readFileSync(path.join(out, "wavo", "script.js"), "utf8");
// WKWebView serves the app from capacitor://localhost. Passing that as the
// YouTube origin makes the player drop every postMessage, so controls die.
player = replace(
  player,
  "playerVars: { playsinline: 1, rel: 0, autoplay: wantAuto ? 1 : 0, origin: location.origin },",
  "playerVars: { playsinline: 1, rel: 0, autoplay: wantAuto ? 1 : 0 },",
  "youtube origin",
);
fs.writeFileSync(path.join(out, "wavo", "script.js"), player);

/* ---------- providers.js ---------- */
let providers = fs.readFileSync(path.join(out, "wavo", "providers.js"), "utf8");
// There is no Nitro server inside the app, so /api/* can never answer.
providers = replace(
  providers,
  "async function req(url, ms = 9000) {\n  const ac = new AbortController();",
  'async function req(url, ms = 9000) {\n  if (url.startsWith("/api/")) throw new Error("no server in the app");\n  const ac = new AbortController();',
  "api short-circuit",
);
providers = replace(
  providers,
  '"מקור הווידאו החי כבוי — חסר מפתח ב־.env"',
  '"החיפוש החי לא זמין באפליקציה — מחפשים במאגר השירים המובנה"',
  "provider off message",
);
fs.writeFileSync(path.join(out, "wavo", "providers.js"), providers);

/* ---------- ios.css ---------- */
fs.writeFileSync(
  path.join(out, "wavo", "ios.css"),
  `/* Native iOS shell: no window chrome, no rubber-banding, no tap flashes. */
.win-controls { display: none !important; }
html, body { overscroll-behavior: none; }
body { -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; }
a, button, .row, .tile, .btile { -webkit-user-select: none; user-select: none; }
input, textarea, .lyrics, .np-body { -webkit-user-select: text; user-select: text; }
img { -webkit-user-drag: none; }
/* WKWebView reports the notch inset only with viewport-fit=cover, and the
   launch storyboard leaves the status bar area unpainted until CSS loads. */
body.is-phone { background: #100c0a; }
`,
);

/* ---------- ios.js ---------- */
fs.writeFileSync(
  path.join(out, "wavo", "ios.js"),
  `/* Runs before the player so the phone layout is decided from the native flag
     too — iPadOS reports a desktop user agent and would otherwise get the
     sidebar layout on a touch screen. */
(function () {
  var native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (!native) return;
  document.body.classList.add("is-native");
  var touch = matchMedia("(pointer: coarse)").matches;
  if (touch && innerWidth <= 1024) document.body.classList.add("is-phone");
  addEventListener("resize", function () {
    if (touch) document.body.classList.toggle("is-phone", innerWidth <= 1024);
  });
})();
`,
);

const files = fs.readdirSync(path.join(out, "wavo"));
console.log(`www/ ready — index.html + ${files.length} player files`);