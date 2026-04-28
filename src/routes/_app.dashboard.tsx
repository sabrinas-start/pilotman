import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAirtable } from "@/hooks/useAirtable";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — Pôle Tournage" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const [show, setShow] = useState(false);
  const { data, loading, error, refetch } = useAirtable("tblNznOYtuFDUI3df", { maxRecords: 1 });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">Tableau de bord</h2>
        <p className="text-sm text-muted-foreground">Vue d'ensemble du pôle tournage.</p>
      </header>

      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShow(true);
              void refetch();
            }}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Tester connexion Airtable
          </button>
          {loading && show && <span className="text-sm text-muted-foreground">Chargement…</span>}
          {error && show && <span className="text-sm text-destructive">{error.message}</span>}
        </div>

        {show && data && (
          <pre className="mt-4 max-h-96 overflow-auto rounded-md border border-border bg-background p-4 text-xs text-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
