"use strict";

// Renders the WAVO app icon with Chromium's canvas (no image libraries needed)
// and writes build/icon.png plus a multi-size build/icon.ico for Windows.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const OUT = path.join(__dirname, "..", "build");

const PAGE = `<!doctype html><html><body><script>
function drawMark(size) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const u = size / 512;

  // rounded dark tile
  const pad = 26 * u;
  const radius = 116 * u;
  const tile = new Path2D();
  const x = pad, y = pad, w = size - pad * 2, h = size - pad * 2, r = radius;
  tile.moveTo(x + r, y);
  tile.arcTo(x + w, y, x + w, y + h, r);
  tile.arcTo(x + w, y + h, x, y + h, r);
  tile.arcTo(x, y + h, x, y, r);
  tile.arcTo(x, y, x + w, y, r);
  tile.closePath();

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, "#1b1712");
  bg.addColorStop(1, "#0a0908");
  ctx.fillStyle = bg;
  ctx.fill(tile);

  // warm glow behind the bars
  const glow = ctx.createRadialGradient(size * 0.5, size * 0.55, size * 0.05, size * 0.5, size * 0.5, size * 0.55);
  glow.addColorStop(0, "rgba(240,134,47,0.34)");
  glow.addColorStop(1, "rgba(240,134,47,0)");
  ctx.save();
  ctx.clip(tile);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // hairline border
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 3 * u;
  ctx.stroke(tile);

  // waveform bars
  const heights = [0.42, 0.68, 1, 0.68, 0.42];
  const barW = 44 * u;
  const gap = 26 * u;
  const totalW = heights.length * barW + (heights.length - 1) * gap;
  let bx = (size - totalW) / 2;
  const maxH = 260 * u;
  const grad = ctx.createLinearGradient(0, size * 0.3, 0, size * 0.72);
  grad.addColorStop(0, "#ffb457");
  grad.addColorStop(1, "#ef7f2a");
  ctx.fillStyle = grad;
  for (const factor of heights) {
    const bh = maxH * factor;
    const by = (size - bh) / 2;
    const bar = new Path2D();
    const rr = barW / 2;
    bar.moveTo(bx + rr, by);
    bar.arcTo(bx + barW, by, bx + barW, by + bh, rr);
    bar.arcTo(bx + barW, by + bh, bx, by + bh, rr);
    bar.arcTo(bx, by + bh, bx, by, rr);
    bar.arcTo(bx, by, bx + barW, by, rr);
    bar.closePath();
    ctx.fill(bar);
    bx += barW + gap;
  }
  return c;
}

window.renderPng = (size) => drawMark(size).toDataURL("image/png");
</script></body></html>`;

function pngBuffer(window, size) {
  return window.webContents
    .executeJavaScript(`window.renderPng(${size})`)
    .then((dataUrl) => Buffer.from(String(dataUrl).split(",")[1], "base64"));
}

// Windows .ico container with embedded PNG frames.
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  const entries = [];
  let offset = 6 + frames.length * 16;
  for (const frame of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 0);
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(frame.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += frame.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...frames.map((frame) => frame.buffer)]);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 600,
    height: 600,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  await window.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(PAGE));

  fs.mkdirSync(OUT, { recursive: true });

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const frames = [];
  for (const size of sizes) frames.push({ size, buffer: await pngBuffer(window, size) });

  const large = await pngBuffer(window, 512);
  fs.writeFileSync(path.join(OUT, "icon.png"), large);
  fs.writeFileSync(path.join(OUT, "icon.ico"), buildIco(frames));
  fs.writeFileSync(path.join(OUT, "tray.png"), frames[2].buffer);

  console.log("Wrote build/icon.png (512), build/icon.ico, build/tray.png");
  window.destroy();
  app.quit();
});
