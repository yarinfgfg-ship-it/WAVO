// Desktop build for the Electron shell.
//
// The web build targets Cloudflare; the desktop app needs a plain Node server it
// can spawn locally, so this config keeps every plugin from the shared setup and
// only swaps the Nitro preset. Output lands in .output/ (see desktop/main.cjs).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: { preset: "node-server" },
});
