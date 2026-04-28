import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAirtable } from "@/hooks/useAirtable";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/parametres")({
  head: () => ({ meta: [{ title: "Paramètres — Pôle Tournage" }] }),
  component: ParametresPage,
});

const ANNEE = 2026;
const OBJECTIFS_TABLE = "tbllicBAAtlet98Mq";

const MOIS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
];

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

async function patchAirtable(tableId: string, recordId: string, fields: Record<string, unknown>) {
  const res = await fetch("/api/airtable", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableId, recordId, fields }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json();
}

function notifySaved() {
  toast.success("Enregistré ✓", { style: { color: "var(--positive)" } });
}
function notifyError(msg?: string) {
  toast.error("Erreur d'enregistrement", {
    description: msg,
    style: { color: "var(--destructive)" },
  });
}

function ParametresPage() {
  const objectifsQ = useAirtable(OBJECTIFS_TABLE, {
    filterByFormula: `{annee}=${ANNEE}`,
  });

  const record = objectifsQ.data?.[0];
  const recordId = record?.id;
  const fields = (record?.fields ?? {}) as Record<string, unknown>;

  // ── Section 1 — Objectifs annuels ──
  const [caAudio, setCaAudio] = useState("");
  const [caVideo, setCaVideo] = useState("");
  const [caGlobal, setCaGlobal] = useState("");

  // ── Section 2 — Saisonnalité ──
  const [saisonAudio, setSaisonAudio] = useState<string[]>(Array(12).fill(""));
  const [saisonVideo, setSaisonVideo] = useState<string[]>(Array(12).fill(""));

  // ── Section 3 — Concrétisation pipe ──
  const [tauxOption, setTauxOption] = useState("");
  const [tauxConfirme, setTauxConfirme] = useState("");

  // ── Section 4 — Dispatch sous-pôles ──
  const [pctAudio, setPctAudio] = useState("");
  const [pctVideo, setPctVideo] = useState("");

  // ── Section 5 — Garde-fous (local) ──
  const [minAudio, setMinAudio] = useState("0");
  const [maxAudio, setMaxAudio] = useState("0");
  const [minVideo, setMinVideo] = useState("0");
  const [maxVideo, setMaxVideo] = useState("0");

  // ── Section 6 — Réserve (local) ──
  const [reserve, setReserve] = useState("20");

  // Hydrate from Airtable
  useEffect(() => {
    if (!record) return;
    setCaAudio(String(num(fields.ca_objectif_audio) || ""));
    setCaVideo(String(num(fields.ca_objectif_video) || ""));
    setCaGlobal(String(num(fields.ca_objectif_global) || ""));
    setSaisonAudio(
      Array.from({ length: 12 }, (_, i) => {
        const k = `saisonnalite_audio_${String(i + 1).padStart(2, "0")}`;
        return String(((num(fields[k]) || 0) * 100).toFixed(2)).replace(/\.00$/, "");
      }),
    );
    setSaisonVideo(
      Array.from({ length: 12 }, (_, i) => {
        const k = `saisonnalite_video_${String(i + 1).padStart(2, "0")}`;
        return String(((num(fields[k]) || 0) * 100).toFixed(2)).replace(/\.00$/, "");
      }),
    );
    setTauxOption(String(((num(fields.taux_concretisation_option) || 0) * 100).toFixed(2)).replace(/\.00$/, ""));
    setTauxConfirme(String(((num(fields.taux_concretisation_confirme) || 0) * 100).toFixed(2)).replace(/\.00$/, ""));
    setPctAudio(String(((num(fields.pct_attribution_audio) || 0) * 100).toFixed(2)).replace(/\.00$/, ""));
    setPctVideo(String(((num(fields.pct_attribution_video) || 0) * 100).toFixed(2)).replace(/\.00$/, ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  const totalSaisonAudio = useMemo(
    () => saisonAudio.reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [saisonAudio],
  );
  const totalSaisonVideo = useMemo(
    () => saisonVideo.reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [saisonVideo],
  );
  const totalDispatch = (parseFloat(pctAudio) || 0) + (parseFloat(pctVideo) || 0);

  async function handleSave(payload: Record<string, unknown>) {
    if (!recordId) {
      notifyError("Enregistrement 2026 introuvable");
      return;
    }
    try {
      await patchAirtable(OBJECTIFS_TABLE, recordId, payload);
      await objectifsQ.refetch();
      notifySaved();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    }
  }

  const loading = objectifsQ.loading;
  const error = objectifsQ.error;

  return (
    <div className="space-y-8">
      <header className="border-b border-border pb-6">
        <h2 className="text-2xl font-semibold text-foreground">Paramètres · {ANNEE}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configuration des objectifs, saisonnalité et garde-fous.
        </p>
        {error && (
          <p className="mt-2 text-xs text-muted-foreground">
            Erreur de chargement : {error.message}
          </p>
        )}
      </header>

      {loading && !record ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          {/* Section 1 */}
          <Section title="Objectifs annuels">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="CA objectif Audio" suffix="€">
                <Input value={caAudio} onChange={(e) => setCaAudio(e.target.value)} type="number" />
              </Field>
              <Field label="CA objectif Vidéo" suffix="€">
                <Input value={caVideo} onChange={(e) => setCaVideo(e.target.value)} type="number" />
              </Field>
              <Field label="CA objectif Global" suffix="€">
                <Input value={caGlobal} onChange={(e) => setCaGlobal(e.target.value)} type="number" />
              </Field>
            </div>
            <SaveBar
              onSave={() =>
                handleSave({
                  ca_objectif_audio: parseFloat(caAudio) || 0,
                  ca_objectif_video: parseFloat(caVideo) || 0,
                  ca_objectif_global: parseFloat(caGlobal) || 0,
                })
              }
            />
          </Section>

          {/* Section 2 */}
          <Section title="Saisonnalité">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SeasonGrid
                title="Audio"
                values={saisonAudio}
                onChange={(i, v) =>
                  setSaisonAudio((p) => p.map((x, idx) => (idx === i ? v : x)))
                }
                total={totalSaisonAudio}
                onSave={() => {
                  const payload: Record<string, unknown> = {};
                  saisonAudio.forEach((v, i) => {
                    payload[`saisonnalite_audio_${String(i + 1).padStart(2, "0")}`] =
                      (parseFloat(v) || 0) / 100;
                  });
                  handleSave(payload);
                }}
              />
              <SeasonGrid
                title="Vidéo"
                values={saisonVideo}
                onChange={(i, v) =>
                  setSaisonVideo((p) => p.map((x, idx) => (idx === i ? v : x)))
                }
                total={totalSaisonVideo}
                onSave={() => {
                  const payload: Record<string, unknown> = {};
                  saisonVideo.forEach((v, i) => {
                    payload[`saisonnalite_video_${String(i + 1).padStart(2, "0")}`] =
                      (parseFloat(v) || 0) / 100;
                  });
                  handleSave(payload);
                }}
              />
            </div>
          </Section>

          {/* Section 3 */}
          <Section title="Taux de concrétisation pipe">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Option" suffix="%">
                <Input
                  value={tauxOption}
                  onChange={(e) => setTauxOption(e.target.value)}
                  type="number"
                />
              </Field>
              <Field label="Confirmé / Prêt / Sur site" suffix="%">
                <Input
                  value={tauxConfirme}
                  onChange={(e) => setTauxConfirme(e.target.value)}
                  type="number"
                />
              </Field>
            </div>
            <SaveBar
              onSave={() =>
                handleSave({
                  taux_concretisation_option: (parseFloat(tauxOption) || 0) / 100,
                  taux_concretisation_confirme: (parseFloat(tauxConfirme) || 0) / 100,
                })
              }
            />
          </Section>

          {/* Section 4 */}
          <Section title="Dispatch sous-pôles">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Attribution Audio" suffix="%">
                <Input value={pctAudio} onChange={(e) => setPctAudio(e.target.value)} type="number" />
              </Field>
              <Field label="Attribution Vidéo" suffix="%">
                <Input value={pctVideo} onChange={(e) => setPctVideo(e.target.value)} type="number" />
              </Field>
            </div>
            {Math.abs(totalDispatch - 100) > 0.01 && (
              <p className="mt-3 text-sm text-destructive">
                Total : {totalDispatch.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}% — doit être égal à 100%
              </p>
            )}
            <SaveBar
              onSave={() =>
                handleSave({
                  pct_attribution_audio: (parseFloat(pctAudio) || 0) / 100,
                  pct_attribution_video: (parseFloat(pctVideo) || 0) / 100,
                })
              }
            />
          </Section>

          {/* Section 5 */}
          <Section
            title="Garde-fous enveloppe (Indicateur 1)"
            note="Paramètres non persistés — Phase suivante"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Field label="Plancher Audio" suffix="€">
                <Input value={minAudio} onChange={(e) => setMinAudio(e.target.value)} type="number" />
              </Field>
              <Field label="Plafond Audio" suffix="€">
                <Input value={maxAudio} onChange={(e) => setMaxAudio(e.target.value)} type="number" />
              </Field>
              <Field label="Plancher Vidéo" suffix="€">
                <Input value={minVideo} onChange={(e) => setMinVideo(e.target.value)} type="number" />
              </Field>
              <Field label="Plafond Vidéo" suffix="€">
                <Input value={maxVideo} onChange={(e) => setMaxVideo(e.target.value)} type="number" />
              </Field>
            </div>
          </Section>

          {/* Section 6 */}
          <Section
            title="Réserve de sécurité (Indicateur 2)"
            note="Paramètres non persistés — Phase suivante"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Réserve de sécurité" suffix="%">
                <Input value={reserve} onChange={(e) => setReserve(e.target.value)} type="number" />
              </Field>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="relative">
        {children}
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function SaveBar({ onSave }: { onSave: () => void }) {
  return (
    <div className="mt-5 flex justify-end">
      <Button
        onClick={onSave}
        className="bg-accent text-accent-foreground hover:bg-accent/90"
      >
        Enregistrer
      </Button>
    </div>
  );
}

function SeasonGrid({
  title,
  values,
  onChange,
  total,
  onSave,
}: {
  title: string;
  values: string[];
  onChange: (i: number, v: string) => void;
  total: number;
  onSave: () => void;
}) {
  const ok = Math.abs(total - 100) < 0.01;
  return (
    <div className="rounded-md border border-border bg-background/40 p-4">
      <h4 className="mb-3 text-sm font-medium text-foreground">{title}</h4>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {values.map((v, i) => (
          <label key={i} className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
              {MOIS[i]}
            </span>
            <div className="relative">
              <Input
                value={v}
                onChange={(e) => onChange(i, e.target.value)}
                type="number"
                className="pr-6 text-sm"
              />
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
                %
              </span>
            </div>
          </label>
        ))}
      </div>
      <p
        className={cn(
          "mt-3 text-sm",
          ok ? "text-positive" : "text-destructive",
        )}
      >
        Total : {total.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}%
        {!ok && " — doit être égal à 100%"}
      </p>
      <div className="mt-4 flex justify-end">
        <Button
          onClick={onSave}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
