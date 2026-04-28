import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/parametres")({
  head: () => ({ meta: [{ title: "Paramètres — Pôle Tournage" }] }),
  component: ParametresPage,
});

function ParametresPage() {
  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-semibold">Paramètres</h2>
      <p className="text-sm text-muted-foreground">Configuration de l'application.</p>
    </div>
  );
}
