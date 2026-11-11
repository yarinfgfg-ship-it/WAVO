import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

declare global {
  interface Window {
    __wavoBooted?: boolean;
  }
}

const HTML_VERSION = 46;
const SCRIPT_VERSION = 45;
const SCRIPTS = ["songs.js", "channels.js", "providers.js", "script.js", "extras.js", "mobile.js"];

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
      { rel: "stylesheet", href: "/wavo/style.css?v=19" },
      { rel: "stylesheet", href: "/wavo/extras.css?v=13" },
      { rel: "stylesheet", href: "/wavo/polish.css?v=11" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;800;900&display=swap",
      },
      { rel: "stylesheet", href: "/wavo/fresh.css?v=17" },
    ],
  }),
  component: Wavo,
});

// The player is plain JS sharing globals across its scripts, so it is injected
// once and the scripts are appended in order rather than bundled as modules.
// There is no account system: the library is kept on the device.
function Wavo() {
  useEffect(() => {
    let cancelled = false;
    if (window.__wavoBooted) {
      window.location.reload();
      return;
    }
    window.__wavoBooted = true;

    (async () => {
      const html = await (await fetch(`/wavo/app.html?v=${HTML_VERSION}`)).text();
      if (cancelled) return;
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script").forEach((node) => node.remove());
      doc.querySelectorAll("img[src]").forEach((img) => {
        const src = img.getAttribute("src") || "";
        if (!/^(https?:|\/)/.test(src)) img.setAttribute("src", `/wavo/${src}`);
      });

      document.documentElement.lang = "he";
      document.documentElement.dir = "rtl";
      document.body.className = doc.body.className;
      const root = document.getElementById("wavo-root");
      if (!root) return;
      root.innerHTML = doc.body.innerHTML;

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

    return () => {
      cancelled = true;
    };
  }, []);

  return <div id="wavo-root" style={{ display: "contents" }} />;
}
