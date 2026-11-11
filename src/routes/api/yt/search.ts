import { createFileRoute } from "@tanstack/react-router";
import { handleYt } from "@/lib/youtube.server";

export const Route = createFileRoute("/api/yt/search")({
  server: { handlers: { GET: ({ request }) => handleYt("search", request) } },
});
