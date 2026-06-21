import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useAirtable, type AirtableRecord } from "@/hooks/useAirtable";

export const Route = createFileRoute("/_app/alertes")({
  component: AlertesPage,
});

const LS_KEY = "lapuce_alertes_derniere_visite";

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function fmtEUR(n: number) {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function AlertesPage() {
  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
  }, []);

  const { data: charges, loading: loadingC } = useAirtable("tbljefhnPsyTAgUA4", {
    filterByFormula: `{warning}=TRUE()`,
  });

  const { data: logs, loading: loadingL } = useAirtable("tbl4uCRY4qeiRxpV4", {
    filterByFormula: `{type_evenement}='error'`,
    sort: [{ field: "timestamp", direction: "desc" }],
  });

  const chargesSorted = useMemo(() => {
    if (!charges) return [];
    return [...charges].sort((a, b) => {
      const ay = Number(a.fields.annee ?? 0);
      const by = Number(b.fields.annee ?? 0);
      if (by !== ay) return by - ay;
      const am = Number(a.fields.mois ?? 0);
      const bm = Number(b.fields.mois ?? 0);
      return bm - am;
    });
  }, [charges]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Alertes</h1>
        <p className="text-sm text-muted-foreground">
          Anomalies sur les charges provisionnées et erreurs techniques.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg bg-[#161616] border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Warnings charges</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground">
              {chargesSorted.length}
            </span>
          </div>
          {loadingC ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : chargesSorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune alerte</p>
          ) : (
            <ul className="space-y-3">
              {chargesSorted.map((r) => (
                <ChargeCard key={r.id} record={r} />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg bg-[#161616] border border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Erreurs de run</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground">
              {logs?.length ?? 0}
            </span>
          </div>
          {loadingL ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune alerte</p>
          ) : (
            <ul className="space-y-3">
              {logs.map((r) => (
                <LogCard key={r.id} record={r} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ChargeCard({ record }: { record: AirtableRecord }) {
  const f = record.fields;
  const type = String(f.type_charge ?? "—");
  const mode = String(f.mode_reconciliation ?? "");
  const annee = Number(f.annee ?? 0);
  const moisNum = Number(f.mois ?? 0);
  const prov = Number(f.montant_provisionne ?? 0);
  const reel = Number(f.montant_reel_constate ?? 0);
  const ecart = reel - prov;
  const pct = prov !== 0 ? (ecart / prov) * 100 : 0;
  const sign = ecart > 0 ? "+" : "";

  const periode = mode === "comparaison_annuelle"
    ? String(annee || "")
    : `${MOIS[moisNum - 1] ?? moisNum}/${annee}`;

  return (
    <li className="rounded-md bg-white/[0.03] border border-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{type}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{periode}</div>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold text-[#E05252]">{fmtEUR(reel)}</div>
          <div className="text-xs text-muted-foreground">constaté</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Provisionné : {fmtEUR(prov)}</span>
        <span className="px-2 py-0.5 rounded-full text-[#E05252] bg-[#E05252]/10 font-medium">
          {sign}{fmtEUR(ecart)} ({sign}{pct.toFixed(1)}%)
        </span>
      </div>
    </li>
  );
}

function LogCard({ record }: { record: AirtableRecord }) {
  const f = record.fields;
  const source = String(f.source ?? "—");
  const ts = String(f.timestamp ?? "");
  const detail = String(f.detail ?? "");

  return (
    <li className="rounded-md bg-white/[0.03] border border-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{source}</span>
        <span className="text-xs text-muted-foreground">{ts ? fmtDateTime(ts) : "—"}</span>
      </div>
      {detail && (
        <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">
          {detail}
        </p>
      )}
    </li>
  );
}
