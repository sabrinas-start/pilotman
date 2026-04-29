import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { useAirtable } from "@/hooks/useAirtable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/salaries")({
  head: () => ({ meta: [{ title: "Salariés — Pôle Tournage" }] }),
  component: SalariesPage,
});

const ANNEE = 2026;
const SALARIES_TABLE = "tblceqCJP9FAcEIMe";
const SALARIES_MOIS_TABLE = "tbl0bVuIyeIOXbjGH";
const WEBHOOK_GENERATION = "https://testingsab.app.n8n.cloud/webhook/salaires-generation";
const WEBHOOK_ARCHIVAGE = "https://testingsab.app.n8n.cloud/webhook/salaires-archivage";

const MOIS_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

type ContratType = "CDI" | "CDD" | "Gérant";

type Salarie = {
  id: string;
  nom: string;
  type_contrat: ContratType;
  date_demarrage: string;
  date_fin: string | null;
  cte_annuel: number;
  fonpeps_annuel: number;
  taux_imputation: number;
};

type SalarieMois = {
  id: string;
  cle_primaire: string;
  mois: number;
  cte_mensuel: number;
  fonpeps_mensuel: number;
  taux_imputation: number;
  montant_impute: number;
};

const fmtEUR = (n: number) =>
  `${n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} €`;

const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) || 0 : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

// taux_imputation est stocké en décimal (1 = 100%, 0.8 = 80%)
const fmtPct = (decimal: number): string => `${Math.round(decimal * 100)} %`;
const fmtMonthYear = (date: string): string => {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};
const blurOnWheel = (e: React.WheelEvent<HTMLInputElement>) => {
  (e.target as HTMLInputElement).blur();
};

async function airtablePost(tableId: string, fields: Record<string, unknown>) {
  const res = await fetch("/api/airtable", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableId, fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function airtablePostBatch(tableId: string, records: Array<{ fields: Record<string, unknown> }>) {
  // Airtable POST max 10 per request
  const chunks: Array<typeof records> = [];
  for (let i = 0; i < records.length; i += 10) chunks.push(records.slice(i, i + 10));
  for (const c of chunks) {
    const res = await fetch("/api/airtable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tableId, records: c }),
    });
    if (!res.ok) throw new Error(await res.text());
  }
}
async function airtablePatch(tableId: string, recordId: string, fields: Record<string, unknown>) {
  const res = await fetch("/api/airtable", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableId, recordId, fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function airtableDelete(tableId: string, recordId: string) {
  const res = await fetch(`/api/airtable?tableId=${tableId}&recordId=${recordId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Recalcule cte_annuel d'un salarié à partir de toutes ses lignes mensuelles 2026
async function recomputeCteAnnuel(salarieId: string, nomSalarie: string) {
  const url = `/api/airtable?tableId=${SALARIES_MOIS_TABLE}&filterByFormula=${encodeURIComponent(
    `AND({nom_salarie}="${nomSalarie}", {annee}=${ANNEE})`,
  )}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { records: Array<{ fields: Record<string, unknown> }> };
  const total = json.records.reduce((sum, r) => sum + num(r.fields.cte_mensuel), 0);
  await airtablePatch(SALARIES_TABLE, salarieId, { cte_annuel: total });
  return total;
}

function badgeForContrat(t: ContratType) {
  switch (t) {
    case "CDI":
      return { bg: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", label: "CDI" };
    case "CDD":
      return { bg: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", label: "CDD" };
    case "Gérant":
      return { bg: "rgba(168, 85, 247, 0.15)", color: "#c084fc", label: "Gérant" };
  }
}

function SalariesPage() {
  const salariesQ = useAirtable(SALARIES_TABLE, {});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editSalarie, setEditSalarie] = useState<Salarie | null>(null);
  const [deleteSalarie, setDeleteSalarie] = useState<Salarie | null>(null);

  const salaries: Salarie[] = useMemo(() => {
    if (!salariesQ.data) return [];
    return salariesQ.data
      .map((r) => {
        const f = r.fields as Record<string, unknown>;
        return {
          id: r.id,
          nom: str(f.nom_salarie),
          type_contrat: (str(f.type_contrat) || "CDI") as ContratType,
          date_demarrage: str(f.date_demarrage_charge),
          date_fin: str(f.date_fin_charge) || null,
          cte_annuel: num(f.cte_annuel),
          fonpeps_annuel: num(f.fonpeps_annuel),
          taux_imputation: num(f.taux_imputation),
        };
      })
      .filter((s) => s.nom);
  }, [salariesQ.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Salariés</h1>
          <p className="text-sm text-muted-foreground">Gestion des charges salariales {ANNEE}</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Ajouter un salarié
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Nom</th>
              <th className="px-4 py-3 text-left">Contrat</th>
              <th className="px-4 py-3 text-left">Date démarrage</th>
              <th className="px-4 py-3 text-left">Date fin</th>
              <th className="px-4 py-3 text-right">CTE annuel</th>
              <th className="px-4 py-3 text-right">% imputation</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {salariesQ.loading && (
              <tr>
                <td colSpan={7} className="p-4">
                  <Skeleton className="h-8 w-full" />
                </td>
              </tr>
            )}
            {!salariesQ.loading && salaries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun salarié actif. Cliquez sur "Ajouter un salarié" pour commencer.
                </td>
              </tr>
            )}
            {salaries.map((s) => {
              const isOpen = expanded === s.id;
              const badge = badgeForContrat(s.type_contrat);
              return (
                <ExpandableRow
                  key={s.id}
                  salarie={s}
                  badge={badge}
                  isOpen={isOpen}
                  onToggle={() => setExpanded(isOpen ? null : s.id)}
                  onEdit={() => setEditSalarie(s)}
                  onDelete={() => setDeleteSalarie(s)}
                  onRefresh={() => salariesQ.refetch()}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <AddSalarieModal
          onClose={() => setAddOpen(false)}
          onDone={() => {
            setAddOpen(false);
            salariesQ.refetch();
          }}
        />
      )}
      {editSalarie && (
        <EditSalarieModal
          salarie={editSalarie}
          onClose={() => setEditSalarie(null)}
          onDone={() => {
            setEditSalarie(null);
            salariesQ.refetch();
          }}
        />
      )}
      {deleteSalarie && (
        <DeleteSalarieModal
          salarie={deleteSalarie}
          onClose={() => setDeleteSalarie(null)}
          onDone={() => {
            setDeleteSalarie(null);
            salariesQ.refetch();
          }}
        />
      )}
    </div>
  );
}

function ExpandableRow({
  salarie,
  badge,
  isOpen,
  onToggle,
  onEdit,
  onDelete,
  onRefresh,
}: {
  salarie: Salarie;
  badge: { bg: string; color: string; label: string };
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <tr
        className="border-t border-border cursor-pointer hover:bg-muted/20"
        onClick={onToggle}
      >
        <td className="px-4 py-3 font-medium">{salarie.nom}</td>
        <td className="px-4 py-3">
          <span
            className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: badge.bg, color: badge.color }}
          >
            {badge.label}
          </span>
        </td>
        <td className="px-4 py-3 text-muted-foreground">{fmtMonthYear(salarie.date_demarrage)}</td>
        <td className="px-4 py-3 text-muted-foreground">{salarie.date_fin ? fmtMonthYear(salarie.date_fin) : "—"}</td>
        <td className="px-4 py-3 text-right tabular-nums">{fmtEUR(salarie.cte_annuel)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{fmtPct(salarie.taux_imputation)}</td>
        <td className="px-4 py-3 text-muted-foreground">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-t border-border bg-muted/10">
          <td colSpan={7} className="px-4 py-4">
            <ExpandedContent
              salarie={salarie}
              onEdit={onEdit}
              onDelete={onDelete}
              onRefresh={onRefresh}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedContent({
  salarie,
  onEdit,
  onDelete,
  onRefresh,
}: {
  salarie: Salarie;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const moisQ = useAirtable(SALARIES_MOIS_TABLE, {
    filterByFormula: `AND({nom_salarie}="${salarie.nom}", {annee}=${ANNEE})`,
    sort: [{ field: "mois", direction: "asc" }],
  });
  const [editLine, setEditLine] = useState<SalarieMois | null>(null);

  const lignes: SalarieMois[] = useMemo(() => {
    if (!moisQ.data) return [];
    return moisQ.data.map((r) => {
      const f = r.fields as Record<string, unknown>;
      return {
        id: r.id,
        cle_primaire: str(f.cle_primaire),
        mois: num(f.mois),
        cte_mensuel: num(f.cte_mensuel),
        fonpeps_mensuel: num(f.fonpeps_mensuel),
        taux_imputation: num(f.taux_imputation),
        montant_impute: num(f.montant_impute),
      };
    });
  }, [moisQ.data]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Mettre à jour
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Supprimer
        </Button>
      </div>
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Mois</th>
              <th className="px-3 py-2 text-right">CTE mensuel</th>
              <th className="px-3 py-2 text-right">FONPEPS</th>
              <th className="px-3 py-2 text-right">% imputation</th>
              <th className="px-3 py-2 text-right">Montant imputé</th>
              <th className="px-3 py-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {moisQ.loading && (
              <tr>
                <td colSpan={6} className="p-3">
                  <Skeleton className="h-6 w-full" />
                </td>
              </tr>
            )}
            {!moisQ.loading && lignes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                  Aucune ligne mensuelle.
                </td>
              </tr>
            )}
            {lignes.map((l) => (
              <tr key={l.id} className="border-t border-border/50">
                <td className="px-3 py-2">{MOIS_LABELS[l.mois - 1] ?? l.mois}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEUR(l.cte_mensuel)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEUR(l.fonpeps_mensuel)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(l.taux_imputation)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtEUR(l.montant_impute)}</td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditLine(l)}>
                    Éditer
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editLine && (
        <EditMoisModal
          ligne={editLine}
          isGerant={salarie.type_contrat === "Gérant"}
          salarieId={salarie.id}
          salarieNom={salarie.nom}
          onClose={() => setEditLine(null)}
          onDone={() => {
            setEditLine(null);
            moisQ.refetch();
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

/* ============ MODALS ============ */

function AddSalarieModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [contrat, setContrat] = useState<ContratType>("CDI");
  const [nom, setNom] = useState("");
  const [dateDem, setDateDem] = useState("");
  const [cteAnnuel, setCteAnnuel] = useState("");
  const [fonpepsAnnuel, setFonpepsAnnuel] = useState("");
  const [taux, setTaux] = useState("");
  const [dateFin, setDateFin] = useState("");
  // gerant monthly
  const [gerantMois, setGerantMois] = useState(
    Array.from({ length: 12 }, () => ({ cte: "", taux: "" })),
  );
  const [loading, setLoading] = useState(false);

  const isGerant = contrat === "Gérant";
  const isCDD = contrat === "CDD";

  const submit = async () => {
    if (!nom.trim()) {
      toast.error("Nom requis");
      return;
    }
    setLoading(true);
    try {
      if (isGerant) {
        if (!dateDem) {
          toast.error("Date de démarrage requise");
          setLoading(false);
          return;
        }
        const created = await airtablePost(SALARIES_TABLE, {
          nom_salarie: nom,
          type_contrat: "Gérant",
          date_demarrage_charge: `${dateDem}-01`,
        });
        const records = gerantMois.map((m, i) => {
          const cte = parseFloat(m.cte) || 0;
          const tx = parseFloat(m.taux) || 0; // entré en %
          const txDec = tx / 100; // stocké en décimal
          return {
            fields: {
              cle_primaire: `${nom}_${i + 1}_${ANNEE}`,
              nom_salarie: nom,
              annee: ANNEE,
              mois: i + 1,
              cte_mensuel: cte,
              fonpeps_mensuel: 0,
              taux_imputation: txDec,
              montant_impute: (cte - 0) * txDec,
            },
          };
        });
        await airtablePostBatch(SALARIES_MOIS_TABLE, records);
        toast.success("Gérant créé ✓");
      } else {
        if (!dateDem) {
          toast.error("Date de démarrage requise");
          setLoading(false);
          return;
        }
        const fields: Record<string, unknown> = {
          nom_salarie: nom,
          type_contrat: contrat,
          date_demarrage_charge: `${dateDem}-01`,
          cte_annuel: parseFloat(cteAnnuel) || 0,
          fonpeps_annuel: parseFloat(fonpepsAnnuel) || 0,
          taux_imputation: (parseFloat(taux) || 0) / 100,
        };
        if (isCDD && dateFin) fields.date_fin_charge = `${dateFin}-01`;
        const created = await airtablePost(SALARIES_TABLE, fields);
        const recordId = (created.id ?? created.records?.[0]?.id) as string;
        // call webhook
        const res = await fetch(WEBHOOK_GENERATION, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            salarie_record_id: recordId,
            date_effet: `${dateDem}-01`,
            date_fin_charge: isCDD && dateFin ? `${dateFin}-01` : null,
          }),
        });
        if (!res.ok) throw new Error("Webhook generation failed");
        toast.success("Salarié créé ✓");
      }
      onDone();
    } catch (e) {
      toast.error("Erreur création", { description: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un salarié</DialogTitle>
          <DialogDescription>Renseignez les informations du nouveau salarié.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Nom">
            <Input value={nom} onChange={(e) => setNom(e.target.value)} />
          </Field>
          <Field label="Contrat">
            <Select value={contrat} onValueChange={(v) => setContrat(v as ContratType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CDI">CDI</SelectItem>
                <SelectItem value="CDD">CDD</SelectItem>
                <SelectItem value="Gérant">Gérant</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date de démarrage">
            <Input type="month" value={dateDem} onChange={(e) => setDateDem(e.target.value)} />
          </Field>

          {!isGerant && (
            <>
              <Field label="CTE annuel (€)">
                <Input type="number" value={cteAnnuel} onChange={(e) => setCteAnnuel(e.target.value)} onWheel={blurOnWheel} />
              </Field>
              <Field label="FONPEPS annuel (€)">
                <Input type="number" value={fonpepsAnnuel} onChange={(e) => setFonpepsAnnuel(e.target.value)} onWheel={blurOnWheel} />
              </Field>
              <Field label="% imputation">
                <Input type="number" value={taux} onChange={(e) => setTaux(e.target.value)} onWheel={blurOnWheel} />
              </Field>
              {isCDD && (
                <Field label="Date de fin">
                  <Input type="month" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
                </Field>
              )}
            </>
          )}

          {isGerant && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Saisie mensuelle</p>
              <div className="rounded border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left">Mois</th>
                      <th className="px-3 py-2 text-left">CTE mensuel (€)</th>
                      <th className="px-3 py-2 text-left">% imputation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gerantMois.map((m, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="px-3 py-1.5">{MOIS_LABELS[i]}</td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            value={m.cte}
                            onChange={(e) => {
                              const next = [...gerantMois];
                              next[i] = { ...next[i], cte: e.target.value };
                              setGerantMois(next);
                            }}
                            className="h-8"
                            onWheel={blurOnWheel}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            value={m.taux}
                            onChange={(e) => {
                              const next = [...gerantMois];
                              next[i] = { ...next[i], taux: e.target.value };
                              setGerantMois(next);
                            }}
                            className="h-8"
                            onWheel={blurOnWheel}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Annuler</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Création…" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSalarieModal({
  salarie,
  onClose,
  onDone,
}: {
  salarie: Salarie;
  onClose: () => void;
  onDone: () => void;
}) {
  const isGerant = salarie.type_contrat === "Gérant";

  if (isGerant) return <EditGerantMoisModal salarie={salarie} onClose={onClose} onDone={onDone} />;

  const [cte, setCte] = useState(String(salarie.cte_annuel));
  const [fonpeps, setFonpeps] = useState(String(salarie.fonpeps_annuel));
  const [taux, setTaux] = useState((salarie.taux_imputation * 100).toFixed(1));
  const [dateEffet, setDateEffet] = useState("");
  const [dateFin, setDateFin] = useState(salarie.date_fin ? salarie.date_fin.slice(0, 7) : "");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!dateEffet) {
      toast.error("Date d'effet requise");
      return;
    }
    setLoading(true);
    try {
      const fields: Record<string, unknown> = {
        cte_annuel: parseFloat(cte) || 0,
        fonpeps_annuel: parseFloat(fonpeps) || 0,
        taux_imputation: (parseFloat(taux) || 0) / 100,
      };
      if (dateFin) fields.date_fin_charge = `${dateFin}-01`;
      await airtablePatch(SALARIES_TABLE, salarie.id, fields);

      const res = await fetch(WEBHOOK_GENERATION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salarie_record_id: salarie.id,
          date_effet: `${dateEffet}-01`,
          date_fin_charge: dateFin ? `${dateFin}-01` : null,
        }),
      });
      if (!res.ok) throw new Error("Webhook generation failed");
      toast.success("Mis à jour ✓");
      onDone();
    } catch (e) {
      toast.error("Erreur mise à jour", { description: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mettre à jour — {salarie.nom}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="CTE annuel (€)">
            <Input type="number" value={cte} onChange={(e) => setCte(e.target.value)} onWheel={blurOnWheel} />
          </Field>
          <Field label="FONPEPS annuel (€)">
            <Input type="number" value={fonpeps} onChange={(e) => setFonpeps(e.target.value)} onWheel={blurOnWheel} />
          </Field>
          <Field label="% imputation">
            <Input type="number" value={taux} onChange={(e) => setTaux(e.target.value)} onWheel={blurOnWheel} />
          </Field>
          <Field label="Date d'effet">
            <Input type="month" value={dateEffet} onChange={(e) => setDateEffet(e.target.value)} />
          </Field>
          <Field label="Date de fin (optionnel)">
            <Input type="month" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Annuler</Button>
          <Button onClick={submit} disabled={loading}>{loading ? "Mise à jour…" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditGerantMoisModal({
  salarie,
  onClose,
  onDone,
}: {
  salarie: Salarie;
  onClose: () => void;
  onDone: () => void;
}) {
  const moisQ = useAirtable(SALARIES_MOIS_TABLE, {
    filterByFormula: `AND({nom_salarie}="${salarie.nom}", {annee}=${ANNEE})`,
    sort: [{ field: "mois", direction: "asc" }],
  });
  const [rows, setRows] = useState<Array<{ id: string; mois: number; cte: string; taux: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (moisQ.data) {
      setRows(
        moisQ.data.map((r) => {
          const f = r.fields as Record<string, unknown>;
          return {
            id: r.id,
            mois: num(f.mois),
            cte: String(num(f.cte_mensuel)),
            taux: (num(f.taux_imputation) * 100).toFixed(1),
          };
        }),
      );
    }
  }, [moisQ.data]);

  const submit = async () => {
    setLoading(true);
    try {
      for (const r of rows) {
        const cte = parseFloat(r.cte) || 0;
        const tx = parseFloat(r.taux) || 0; // entré en %
        const txDec = tx / 100;
        await airtablePatch(SALARIES_MOIS_TABLE, r.id, {
          cte_mensuel: cte,
          taux_imputation: txDec,
          montant_impute: cte * txDec,
        });
      }
      // Recalcul cte_annuel à partir de la somme des cte_mensuel
      await recomputeCteAnnuel(salarie.id, salarie.nom);
      toast.success("Mis à jour ✓");
      onDone();
    } catch (e) {
      toast.error("Erreur mise à jour", { description: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mettre à jour — {salarie.nom}</DialogTitle>
        </DialogHeader>
        {moisQ.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left">Mois</th>
                  <th className="px-3 py-2 text-left">CTE mensuel (€)</th>
                  <th className="px-3 py-2 text-left">% imputation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t border-border/50">
                    <td className="px-3 py-1.5">{MOIS_LABELS[r.mois - 1]}</td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        value={r.cte}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...next[i], cte: e.target.value };
                          setRows(next);
                        }}
                        className="h-8"
                        onWheel={blurOnWheel}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        value={r.taux}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...next[i], taux: e.target.value };
                          setRows(next);
                        }}
                        className="h-8"
                        onWheel={blurOnWheel}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Annuler</Button>
          <Button onClick={submit} disabled={loading || moisQ.loading}>
            {loading ? "Mise à jour…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSalarieModal({
  salarie,
  onClose,
  onDone,
}: {
  salarie: Salarie;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mois, setMois] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!mois) {
      toast.error("Mois requis");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(WEBHOOK_ARCHIVAGE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salarie_record_id: salarie.id,
          date_fin_charge: `${mois}-01`,
        }),
      });
      if (!res.ok) throw new Error("Webhook archivage failed");
      await airtableDelete(SALARIES_TABLE, salarie.id);
      toast.success("Supprimé ✓");
      onDone();
    } catch (e) {
      toast.error("Erreur suppression", { description: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Supprimer — {salarie.nom}</DialogTitle>
          <DialogDescription>Cette action est irréversible.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Supprimer les lignes à partir de quel mois ?">
            <Input type="month" value={mois} onChange={(e) => setMois(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Annuler</Button>
          <Button variant="destructive" onClick={submit} disabled={loading}>
            {loading ? "Suppression…" : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditMoisModal({
  ligne,
  isGerant,
  salarieId,
  salarieNom,
  onClose,
  onDone,
}: {
  ligne: SalarieMois;
  isGerant: boolean;
  salarieId: string;
  salarieNom: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [cte, setCte] = useState(String(ligne.cte_mensuel));
  const [taux, setTaux] = useState((ligne.taux_imputation * 100).toFixed(1));
  const [loading, setLoading] = useState(false);

  const cteNum = parseFloat(cte) || 0;
  const txNum = parseFloat(taux) || 0; // entré en %
  const txDec = txNum / 100;
  const fonpeps = ligne.fonpeps_mensuel;
  const montantImpute = (cteNum - fonpeps) * txDec;

  const submit = async () => {
    setLoading(true);
    try {
      await airtablePatch(SALARIES_MOIS_TABLE, ligne.id, {
        cte_mensuel: cteNum,
        taux_imputation: txDec,
        montant_impute: montantImpute,
      });
      // Recalcul du cte_annuel à partir de toutes les lignes mensuelles
      await recomputeCteAnnuel(salarieId, salarieNom);
      toast.success("Ligne mise à jour ✓");
      onDone();
    } catch (e) {
      toast.error("Erreur", { description: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Éditer — {MOIS_LABELS[ligne.mois - 1]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="CTE mensuel (€)">
            <Input type="number" value={cte} onChange={(e) => setCte(e.target.value)} onWheel={blurOnWheel} />
          </Field>
          {!isGerant && (
            <Field label="FONPEPS mensuel (€) — non modifiable">
              <Input type="number" value={fonpeps} disabled onWheel={blurOnWheel} />
            </Field>
          )}
          <Field label="% imputation">
            <Input type="number" value={taux} onChange={(e) => setTaux(e.target.value)} onWheel={blurOnWheel} />
          </Field>
          <div className="rounded border border-border bg-muted/20 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Montant imputé :</span>{" "}
            <span className="font-medium tabular-nums">{fmtEUR(montantImpute)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Annuler</Button>
          <Button onClick={submit} disabled={loading}>{loading ? "Mise à jour…" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
