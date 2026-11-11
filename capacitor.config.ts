import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.wavo.player",
  appName: "WAVO",
  webDir: "www",
  backgroundColor: "#100c0a",
  server: {
    // "localhost" keeps the WebView a secure context. iosScheme cannot be https:
    // WKWebView already handles that scheme and Capacitor would fall back.
    hostname: "localhost",
    iosScheme: "capacitor",
    androidScheme: "https",
  },
  ios: {
    scheme: "App",
    contentInset: "never",
    backgroundColor: "#100c0a",
    allowsLinkPreview: false,
    scrollEnabled: true,
    preferredContentMode: "mobile",
    loggingBehavior: "none",
  },
};

export default config;