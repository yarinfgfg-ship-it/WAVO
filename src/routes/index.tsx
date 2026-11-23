import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

const HTML_VERSION = 58;
const SCRIPT_VERSION = 67;
const SCRIPTS = ["songs.js", "channels.js", "providers.js", "script.js", "extras.js", "mobile.js", "welcome.js"];

// Module scope intentionally survives React's dev double-mount. A reload here
// would re-mount and reload again forever, so boot exactly once per page load.
let booted = false;
let wavoMarkup = "";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WAVO — מוזיקה ישראלית" },
      {
        name: "description",
        content: "WAVO — נגן שירים ישראליים עם מילים מסונכרנות וספרייה אישית.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;900&display=swap",
      },
      { rel: "stylesheet", href: "/wavo/style.css?v=21" },
      { rel: "stylesheet", href: "/wavo/extras.css?v=15" },
      { rel: "stylesheet", href: "/wavo/polish.css?v=13" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;800;900&display=swap",
      },
      { rel: "stylesheet", href: "/wavo/fresh.css?v=31" },
    ],
  }),
  component: Wavo,
});

function Wavo() {
  useEffect(() => {
    const root = document.getElementById("wavo-root");
    if (!root) return;

    document.documentElement.lang = "he";
    document.documentElement.dir = "rtl";
    if (wavoMarkup) root.innerHTML = wavoMarkup;

    if (booted) return;
    booted = true;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js?v=" + HTML_VERSION).catch(() => {});
    }

    (async () => {
      const html = await (await fetch(`/wavo/app.html?v=${HTML_VERSION}`)).text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script").forEach((node) => node.remove());
      doc.querySelectorAll("img[src]").forEach((img) => {
        const src = img.getAttribute("src") || "";
        if (!/^(https?:|\/)/.test(src)) img.setAttribute("src", `/wavo/${src}`);
      });

      wavoMarkup = doc.body.innerHTML;
      document.body.className = doc.body.className;
      const currentRoot = document.getElementById("wavo-root");
      if (currentRoot) currentRoot.innerHTML = wavoMarkup;

      for (const file of SCRIPTS) {
        await new Promise<void>((resolve) => {
          const script = document.createElement("script");
          script.src = `/wavo/${file}?v=${SCRIPT_VERSION}`;
          script.async = false;
          script.onload = () => resolve();
          script.onerror = () => resolve();
          document.body.appendChild(script);
        });
      }
    })();
  }, []);

  return <div id="wavo-root" style={{ display: "contents" }} />;
}
