import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/droits")({
  head: () => ({ meta: [{ title: "Droits & profils — Pôle Tournage" }] }),
  component: DroitsPage,
});

function DroitsPage() {
  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-semibold">Droits & profils</h2>
      <p className="text-sm text-muted-foreground">Gestion des accès et des profils utilisateurs.</p>
    </div>
  );
}
