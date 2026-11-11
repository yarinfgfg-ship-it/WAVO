import { createFileRoute } from "@tanstack/react-router";
import { handleYt } from "@/lib/youtube.server";

export const Route = createFileRoute("/api/yt/videos")({
  server: { handlers: { GET: ({ request }) => handleYt("videos", request) } },
});
