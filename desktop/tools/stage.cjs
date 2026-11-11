"use strict";

// Copies the Node server build (.output) next to the Electron shell so
// electron-builder can ship it as an unpacked resource.
const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "..", ".output");
const target = path.join(__dirname, "..", "app-server");

if (!fs.existsSync(path.join(source, "server", "index.mjs"))) {
  console.error("Missing .output/server/index.mjs — run `npm run desktop:build` first.");
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log(`Staged server build: ${target}`);
