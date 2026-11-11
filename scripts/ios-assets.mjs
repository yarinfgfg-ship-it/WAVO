/* Renders the iOS icon and launch images from the WAVO mark.
   iOS masks the icon itself, so the artwork is full-bleed and fully opaque —
   no rounded tile, no padding, no alpha (App Store rejects those). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "assets");
fs.mkdirSync(out, { recursive: true });

const BARS = [0.42, 0.68, 1, 0.68, 0.42];

function bars(size) {
  const u = size / 512;
  const barW = 44 * u;
  const gap = 26 * u;
  const maxH = 260 * u;
  const total = BARS.length * barW + (BARS.length - 1) * gap;
  let x = (size - total) / 2;
  return BARS.map((f) => {
    const h = maxH * f;
    const y = (size - h) / 2;
    const r = barW / 2;
    const svg = `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="${r}" fill="url(#bar)"/>`;
    x += barW + gap;
    return svg;
  }).join("");
}

const defs = (size) => `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#1b1712"/><stop offset="1" stop-color="#0a0908"/>
  </linearGradient>
  <radialGradient id="glow" cx="${size * 0.5}" cy="${size * 0.52}" r="${size * 0.55}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#f0862f" stop-opacity="0.34"/><stop offset="1" stop-color="#f0862f" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="bar" x1="0" y1="${size * 0.3}" x2="0" y2="${size * 0.72}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffb457"/><stop offset="1" stop-color="#ef7f2a"/>
  </linearGradient>
</defs>`;

const icon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${defs(size)}<rect width="${size}" height="${size}" fill="url(#bg)"/>
<rect width="${size}" height="${size}" fill="url(#glow)"/>${bars(size)}</svg>`;

// The launch image is mostly empty background; the mark sits centred and small
// so it does not jump when the real UI appears.
const splash = (size) => {
  const mark = Math.round(size * 0.28);
  const off = (size - mark) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="#100c0a"/>
<g transform="translate(${off} ${off})">${icon(mark).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</g></svg>`;
};

await sharp(Buffer.from(icon(1024))).flatten({ background: "#100c0a" }).png().toFile(path.join(out, "icon.png"));
await sharp(Buffer.from(splash(2732))).flatten({ background: "#100c0a" }).png().toFile(path.join(out, "splash.png"));
await sharp(Buffer.from(splash(2732))).flatten({ background: "#100c0a" }).png().toFile(path.join(out, "splash-dark.png"));

console.log("assets/icon.png (1024), assets/splash.png + splash-dark.png (2732)");