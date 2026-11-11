import { createFileRoute } from "@tanstack/react-router";
import { json, ytKey } from "@/lib/youtube.server";

export const Route = createFileRoute("/api/health")({
  server: { handlers: { GET: () => json(200, { youtube: !!ytKey(), streams: "direct from browser" }) } },
});
