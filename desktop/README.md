# WAVO Desktop

A native Windows build of WAVO. The Electron shell starts the app's own
TanStack Start server on a loopback port and shows it in a frameless window with
the WAVO titlebar, so the app runs exactly like the web version (same routes,
same API, same playback) without a browser.

Everything in `desktop/` is self-contained: its own `package.json` and lockfile,
so the web project's Bun lockfile stays untouched.

## Build

```sh
# from the project root
npm run desktop:start   # build the Node bundle, then launch the app
npm run desktop:pack    # build an installer + portable exe into release/
npm run desktop:icon    # re-render build/icon.png / icon.ico
```

`npm run desktop:build` only produces the server bundle in `.output/`
(Nitro `node-server` preset, via `vite.desktop.config.ts`). The shell copies it
into `desktop/app-server/` when packaging.

## What the shell adds

- Frameless window with a custom titlebar (drag region, minimize/maximize/close)
  and the WAVO window icon.
- Window size/position remembered between launches.
- Tray icon with play/pause, next, previous and quit.
- Global media keys (`MediaPlayPause`, `MediaNextTrack`, `MediaPreviousTrack`).
- External links and YouTube sources open in the default browser; in-app
  navigation stays inside WAVO.
- Chrome user agent and autoplay allowed, so YouTube embeds behave like in a
  normal browser.

## Configuration

The shell reads `YOUTUBE_API_KEY` (and any other server variable) from the
current environment and from an env file in the app's data folder, which it
creates with a comment template on first run:

```
%APPDATA%\WAVO\wavo.env
```

Keys are never baked into the executable, and the repository's `.env` is not
copied into the installer. Without a key, YouTube search falls back to reading
YouTube's public results page — the built-in catalog keeps working.

## Notes

- Account sign-in opens the sign-in flow in a child window. Google can refuse
  embedded browser sign-in; when that happens, the app still plays music and
  keeps local likes/history, but playlists won't sync.
- Code signing is not configured, so Windows SmartScreen shows the usual
  "unknown publisher" prompt on first launch.
