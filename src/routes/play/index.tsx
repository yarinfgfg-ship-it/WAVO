import { createFileRoute, Link } from "@tanstack/react-router";
import { useSearch } from "@tanstack/react-router";

export const Route = createFileRoute("/play/")({
  head: () => ({
    meta: [
      { title: "שחק — הגדרות" },
      { name: "description", content: "הגדרות משחק" },
    ],
  }),
  component: () => {
    const search = useSearch({ from: Route });
    const isContinue = search?.continue === "1";

    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-muted">
        <div className="flex flex-col items-center gap-6">
          <h1 className="text-5xl font-extrabold tracking-tight" style={{ fontFamily: "sans-serif" }}>
            שחק
          </h1>

          <div className="flex flex-col gap-3">
            <Link
              to="/"
              className="rounded-xl border-2 border-border bg-card px-10 py-4 text-2xl font-bold text-foreground transition hover:brightness-110 active:scale-95"
            >
              הגדרות
            </Link>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <Link
              to="/"
              className="rounded-xl border-2 border-primary bg-primary px-10 py-4 text-2xl font-bold text-primary-foreground transition hover:brightness-110 active:scale-95"
            >
              צור משחק חדש
            </Link>
            <Link
              to="/"
              className="rounded-xl border-2 border-border bg-card px-10 py-4 text-2xl font-bold text-foreground transition hover:brightness-110 active:scale-95"
            >
              המשך משחק קיים
            </Link>
          </div>
        </div>
      </main>
    );
  },
});
