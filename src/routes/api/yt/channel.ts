import { createFileRoute } from "@tanstack/react-router";
import { handleYt } from "@/lib/youtube.server";

export const Route = createFileRoute("/api/yt/channel")({
  server: { handlers: { GET: ({ request }) => handleYt("channel", request) } },
});
