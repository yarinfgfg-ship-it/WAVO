"use strict";

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  shell,
  session,
  ipcMain,
  globalShortcut,
  dialog,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const { spawn } = require("node:child_process");

const APP_NAME = "WAVO";
const CHROME_HEIGHT = 40;
const packaged = app.isPackaged;

let mainWindow = null;
let splashWindow = null;
let tray = null;
let serverProcess = null;
let appOrigin = "";
let quitting = false;

/* ------------------------------------------------------------------ *
 * Environment
 *
 * Secrets never live in the bundle. Keys are read from the user's own
 * env file at runtime, then from the process environment.
 * ------------------------------------------------------------------ */
function parseEnvFile(file) {
  const out = {};
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadEnvironment() {
  const userData = app.getPath("userData");
  const files = [path.join(userData, "wavo.env"), path.join(userData, ".env")];
  if (!packaged) files.push(path.join(__dirname, "..", ".env"));

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnvFile(file))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }

  if (packaged) {
    const template = path.join(userData, "wavo.env");
    if (!fs.existsSync(template)) {
      try {
        fs.writeFileSync(
          template,
          [
            "# WAVO desktop settings",
            "# Optional: YouTube Data API key. Without it, search falls back to",
            "# YouTube's public results page. Restart WAVO after editing.",
            "YOUTUBE_API_KEY=",
            "",
          ].join("\n"),
          "utf8",
        );
      } catch {
        /* a read-only profile is not fatal */
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Local server
 * ------------------------------------------------------------------ */
function serverEntry() {
  return packaged
    ? path.join(process.resourcesPath, "app-server", "server", "index.mjs")
    : path.join(__dirname, "..", ".output", "server", "index.mjs");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (serverProcess && serverProcess.exitCode !== null) {
        reject(new Error("The local WAVO server stopped before it was ready."));
        return;
      }
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.setTimeout(2000, () => req.destroy());
      req.on("error", retry);
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error("The local WAVO server did not start in time."));
      else setTimeout(attempt, 250);
    };
    attempt();
  });
}

async function startServer() {
  const entry = serverEntry();
  if (!fs.existsSync(entry)) {
    throw new Error(
      "The desktop server bundle is missing. Run `npm run desktop:build` before starting WAVO.",
    );
  }

  const port = await freePort();
  // YouTube's embed player rejects a bare-IP origin/referer with error 150, so the
  // window must load "localhost" even though the server only binds the loopback IP.
  appOrigin = `http://localhost:${port}`;

  serverProcess = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: String(port),
    },
  });

  const forward = (stream, label) => {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      if (!packaged) process.stdout.write(`[${label}] ${chunk}`);
    });
  };
  forward(serverProcess.stdout, "wavo");
  forward(serverProcess.stderr, "wavo");

  serverProcess.on("exit", (code) => {
    serverProcess = null;
    if (!quitting && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        "WAVO stopped",
        `The local music server exited unexpectedly (code ${code ?? "?"}). ` +
          "Restart WAVO, and check that no other copy is already running.",
      );
    }
  });

  await waitForServer(`${appOrigin}/api/health`, 30000);
}

function stopServer() {
  if (!serverProcess) return;
  const child = serverProcess;
  serverProcess = null;
  try {
    child.kill();
  } catch {
    /* already gone */
  }
}

/* ------------------------------------------------------------------ *
 * Windows
 * ------------------------------------------------------------------ */
function iconPath() {
  return path.join(__dirname, "build", "icon.png");
}

function windowStateFile() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(windowStateFile(), "utf8"));
    if (typeof state.width !== "number" || typeof state.height !== "number") return null;
    return state;
  } catch {
    return null;
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    fs.writeFileSync(
      windowStateFile(),
      JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }, null, 2),
      "utf8",
    );
  } catch {
    /* state is a convenience only */
  }
}

function visibleOnScreen(bounds) {
  if (!bounds) return false;
  const { screen } = require("electron");
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      bounds.x < area.x + area.width - 80 &&
      bounds.x + bounds.width > area.x + 80 &&
      bounds.y < area.y + area.height - 80 &&
      bounds.y + bounds.height > area.y + 40
    );
  });
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 440,
    height: 260,
    frame: false,
    resizable: false,
    show: true,
    center: true,
    backgroundColor: "#080b14",
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{height:100%}
    body{
      display:grid;place-items:center;background:#080b14;color:#eef2fb;
      font-family:"Rubik","Segoe UI",system-ui,sans-serif;overflow:hidden;
      border:1px solid rgba(255,255,255,.08);
    }
    .wrap{display:grid;justify-items:center;gap:18px}
    .bars{display:flex;align-items:flex-end;gap:5px;height:46px}
    .bars i{width:7px;border-radius:4px;background:linear-gradient(180deg,#ffb457,#f0862f);animation:b 1.1s ease-in-out infinite}
    .bars i:nth-child(1){height:40%;animation-delay:0s}
    .bars i:nth-child(2){height:72%;animation-delay:.12s}
    .bars i:nth-child(3){height:100%;animation-delay:.24s}
    .bars i:nth-child(4){height:72%;animation-delay:.36s}
    .bars i:nth-child(5){height:40%;animation-delay:.48s}
    @keyframes b{0%,100%{transform:scaleY(.45)}50%{transform:scaleY(1)}}
    h1{font-size:1.5rem;font-weight:900;letter-spacing:.34em;padding-left:.34em}
    p{font-size:.72rem;color:#8d97ab;letter-spacing:.16em}
    .line{width:150px;height:2px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden}
    .line span{display:block;height:100%;width:40%;border-radius:2px;background:linear-gradient(90deg,#f0862f,#ffb457);animation:l 1.2s ease-in-out infinite}
    @keyframes l{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}
  </style></head><body>
    <div class="wrap">
      <div class="bars"><i></i><i></i><i></i><i></i><i></i></div>
      <h1>WAVO</h1>
      <div class="line"><span></span></div>
      <p>מוזיקה ישראלית · מתחיל…</p>
    </div>
  </body></html>`;

  splashWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

function createMainWindow() {
  const state = loadWindowState();
  const useBounds = state && visibleOnScreen(state);

  mainWindow = new BrowserWindow({
    width: useBounds ? state.width : 1440,
    height: useBounds ? state.height : 900,
    x: useBounds ? state.x : undefined,
    y: useBounds ? state.y : undefined,
    minWidth: 1040,
    minHeight: 660,
    show: false,
    frame: false,
    backgroundColor: "#080b14",
    title: APP_NAME,
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
      additionalArguments: [`--wavo-version=${app.getVersion()}`],
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (useBounds && state.maximized) mainWindow.maximize();

  mainWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("wavo:window-state", mainWindow.isMaximized());
    }
    if (!packaged && process.env["WAVO_DEBUG_SHOT"]) captureDebugShot();
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    if (code === -3) return; // aborted by a redirect
    dialog.showErrorBox("WAVO could not load", `${description} (${code}).`);
  });

  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("wavo:window-state", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("wavo:window-state", false);
  });

  mainWindow.on("close", () => {
    saveWindowState();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Ctrl+F5 reloads, F11 toggles fullscreen, F12 opens devtools in dev builds.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (input.key === "F12" && !packaged) {
      mainWindow.webContents.toggleDevTools();
    } else if (input.key === "F5" && input.control) {
      event.preventDefault();
      mainWindow.webContents.reload();
    }
  });

  mainWindow.loadURL(appOrigin);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      return { action: "deny" };
    }
    // Sign-in has to finish inside the app, so its popup stays in a child window.
    if (target.hostname.endsWith("lovable.dev") || target.hostname.endsWith("lovable.app")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          parent: mainWindow,
          width: 520,
          height: 720,
          autoHideMenuBar: true,
          backgroundColor: "#080b14",
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    if (target.protocol === "https:" || target.protocol === "http:") shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(appOrigin)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
}

/* ------------------------------------------------------------------ *
 * Tray + media keys
 * ------------------------------------------------------------------ */
// Dev-only: WAVO_DEBUG_SHOT=<file.png> renders the window to a file and exits.
async function captureDebugShot() {
  await new Promise((resolve) => setTimeout(resolve, 6000));
  if (!mainWindow || mainWindow.isDestroyed()) return app.quit();
  const image = await mainWindow.webContents.capturePage();
  fs.writeFileSync(process.env["WAVO_DEBUG_SHOT"], image.toPNG());
  app.quit();
}

function sendMedia(command) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.webContents.send("wavo:media", command);
}

function createTray() {
  let image = nativeImage.createFromPath(iconPath());
  if (!image.isEmpty()) image = image.resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "פתיחת WAVO", click: () => showWindow() },
      { type: "separator" },
      { label: "נגן / השהה", click: () => sendMedia("toggle") },
      { label: "הבא", click: () => sendMedia("next") },
      { label: "הקודם", click: () => sendMedia("prev") },
      { type: "separator" },
      {
        label: "יציאה",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => showWindow());
  tray.on("double-click", () => showWindow());
}

function registerMediaKeys() {
  const bindings = [
    ["MediaPlayPause", "toggle"],
    ["MediaNextTrack", "next"],
    ["MediaPreviousTrack", "prev"],
  ];
  for (const [accelerator, command] of bindings) {
    try {
      globalShortcut.register(accelerator, () => sendMedia(command));
    } catch {
      /* another app may own the key */
    }
  }
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */
ipcMain.on("wavo:minimize", () => mainWindow && mainWindow.minimize());
ipcMain.on("wavo:maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("wavo:close", () => mainWindow && mainWindow.close());
ipcMain.on("wavo:open-external", (_event, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());

  app.setAppUserModelId("dev.wavo.desktop");
  app.setName(APP_NAME);

  // Autoplay is safe here: the desktop window only plays what the user picked.
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  // A plain Chrome user agent keeps Google sign-in and YouTube happy.
  app.userAgentFallback =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" +
    process.versions.chrome +
    " Safari/537.36";

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    loadEnvironment();

    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );

    createSplash();

    try {
      await startServer();
    } catch (error) {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
      dialog.showErrorBox("WAVO could not start", String(error && error.message ? error.message : error));
      app.quit();
      return;
    }

    createMainWindow();
    createTray();
    registerMediaKeys();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      else showWindow();
    });
  });

  app.on("before-quit", () => {
    quitting = true;
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    stopServer();
  });

  app.on("window-all-closed", () => {
    quitting = true;
    app.quit();
  });
}
