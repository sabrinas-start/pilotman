import { createFileRoute, useBlocker } from "@tanstack/react-router";
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

const dirtyClass = "border-2 border-accent";

function ParametresPage() {
  const objectifsQ = useAirtable(OBJECTIFS_TABLE, {
    filterByFormula: `{annee}=${ANNEE}`,
  });

  const record = objectifsQ.data?.[0];
  const recordId = record?.id;
  const fields = (record?.fields ?? {}) as Record<string, unknown>;

  // Section 1
  const [caAudio, setCaAudio] = useState("");
  const [caVideo, setCaVideo] = useState("");
  const [iCaAudio, setICaAudio] = useState("");
  const [iCaVideo, setICaVideo] = useState("");

  // Section 2 (saisonnalité)
  const [saisonAudio, setSaisonAudio] = useState<string[]>(Array(12).fill(""));
  const [saisonVideo, setSaisonVideo] = useState<string[]>(Array(12).fill(""));
  const [iSaisonAudio, setISaisonAudio] = useState<string[]>(Array(12).fill(""));
  const [iSaisonVideo, setISaisonVideo] = useState<string[]>(Array(12).fill(""));

  // Section 3 (concrétisation)
  const [tauxOption, setTauxOption] = useState("");
  const [tauxConfirme, setTauxConfirme] = useState("");
  const [iTauxOption, setITauxOption] = useState("");
  const [iTauxConfirme, setITauxConfirme] = useState("");

  // Section 4 (dispatch)
  const [pctAudio, setPctAudio] = useState("");
  const [pctVideo, setPctVideo] = useState("");
  const [iPctAudio, setIPctAudio] = useState("");
  const [iPctVideo, setIPctVideo] = useState("");

  // Section 5 (garde-fous)
  const [minAudio, setMinAudio] = useState("");
  const [maxAudio, setMaxAudio] = useState("");
  const [minVideo, setMinVideo] = useState("");
  const [maxVideo, setMaxVideo] = useState("");
  const [iMinAudio, setIMinAudio] = useState("");
  const [iMaxAudio, setIMaxAudio] = useState("");
  const [iMinVideo, setIMinVideo] = useState("");
  const [iMaxVideo, setIMaxVideo] = useState("");

  // Section 6 (réserve)
  const [reserve, setReserve] = useState("");
  const [iReserve, setIReserve] = useState("");

  // Hydrate from Airtable
  useEffect(() => {
    if (!record) return;
    const sa = String(num(fields.ca_objectif_audio) || "");
    const sv = String(num(fields.ca_objectif_video) || "");
    setCaAudio(sa); setICaAudio(sa);
    setCaVideo(sv); setICaVideo(sv);

    const seasonA = Array.from({ length: 12 }, (_, i) => {
      const k = `saisonnalite_audio_${String(i + 1).padStart(2, "0")}`;
      return String(((num(fields[k]) || 0) * 100).toFixed(2)).replace(/\.00$/, "");
    });
    const seasonV = Array.from({ length: 12 }, (_, i) => {
      const k = `saisonnalite_video_${String(i + 1).padStart(2, "0")}`;
      return String(((num(fields[k]) || 0) * 100).toFixed(2)).replace(/\.00$/, "");
    });
    setSaisonAudio(seasonA); setISaisonAudio(seasonA);
    setSaisonVideo(seasonV); setISaisonVideo(seasonV);

    const to = String(((num(fields.taux_concretisation_option) || 0) * 100).toFixed(2)).replace(/\.00$/, "");
    const tc = String(((num(fields.taux_concretisation_confirme) || 0) * 100).toFixed(2)).replace(/\.00$/, "");
    setTauxOption(to); setITauxOption(to);
    setTauxConfirme(tc); setITauxConfirme(tc);

    const pa = String(((num(fields.pct_attribution_audio) || 0) * 100).toFixed(2)).replace(/\.00$/, "");
    const pv = String(((num(fields.pct_attribution_video) || 0) * 100).toFixed(2)).replace(/\.00$/, "");
    setPctAudio(pa); setIPctAudio(pa);
    setPctVideo(pv); setIPctVideo(pv);

    const pla = String(num(fields.plancher_audio) || "");
    const pfa = String(num(fields.plafond_audio) || "");
    const plv = String(num(fields.plancher_video) || "");
    const pfv = String(num(fields.plafond_video) || "");
    setMinAudio(pla); setIMinAudio(pla);
    setMaxAudio(pfa); setIMaxAudio(pfa);
    setMinVideo(plv); setIMinVideo(plv);
    setMaxVideo(pfv); setIMaxVideo(pfv);

    const r = String(((num(fields.reserve_securite) || 0) * 100).toFixed(2)).replace(/\.00$/, "");
    setReserve(r); setIReserve(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  const caGlobal = (parseFloat(caAudio) || 0) + (parseFloat(caVideo) || 0);

  const totalSaisonAudio = useMemo(
    () => saisonAudio.reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [saisonAudio],
  );
  const totalSaisonVideo = useMemo(
    () => saisonVideo.reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [saisonVideo],
  );
  const totalDispatch = (parseFloat(pctAudio) || 0) + (parseFloat(pctVideo) || 0);

  // Dirty tracking
  const arrEq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const dirty = {
    caAudio: caAudio !== iCaAudio,
    caVideo: caVideo !== iCaVideo,
    saisonAudio: !arrEq(saisonAudio, iSaisonAudio),
    saisonVideo: !arrEq(saisonVideo, iSaisonVideo),
    tauxOption: tauxOption !== iTauxOption,
    tauxConfirme: tauxConfirme !== iTauxConfirme,
    pctAudio: pctAudio !== iPctAudio,
    pctVideo: pctVideo !== iPctVideo,
    minAudio: minAudio !== iMinAudio,
    maxAudio: maxAudio !== iMaxAudio,
    minVideo: minVideo !== iMinVideo,
    maxVideo: maxVideo !== iMaxVideo,
    reserve: reserve !== iReserve,
  };
  const anyDirty = Object.values(dirty).some(Boolean);

  // Block in-app navigation when dirty
  useBlocker({
    shouldBlockFn: () => {
      if (!anyDirty) return false;
      // eslint-disable-next-line no-alert
      return !window.confirm("Vous avez des modifications non enregistrées. Quitter quand même ?");
    },
    enableBeforeUnload: () => anyDirty,
  });

  async function handleSave(payload: Record<string, unknown>, onDone?: () => void) {
    if (!recordId) {
      notifyError("Enregistrement 2026 introuvable");
      return;
    }
    try {
      await patchAirtable(OBJECTIFS_TABLE, recordId, payload);
      await objectifsQ.refetch();
      onDone?.();
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
          {/* Section 1 — Objectifs annuels */}
          <Section title="Objectifs annuels">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="CA objectif Audio" suffix="€">
                <Input
                  value={caAudio}
                  onChange={(e) => setCaAudio(e.target.value)}
                  type="number"
                  className={cn(dirty.caAudio && dirtyClass)}
                />
              </Field>
              <Field label="CA objectif Vidéo" suffix="€">
                <Input
                  value={caVideo}
                  onChange={(e) => setCaVideo(e.target.value)}
                  type="number"
                  className={cn(dirty.caVideo && dirtyClass)}
                />
              </Field>
              <Field label="CA objectif Global (calculé)" suffix="€">
                <Input
                  value={caGlobal ? String(caGlobal) : ""}
                  readOnly
                  disabled
                  type="number"
                />
              </Field>
            </div>
            <SaveBar
              onSave={() => {
                const ca = parseFloat(caAudio) || 0;
                const cv = parseFloat(caVideo) || 0;
                handleSave(
                  {
                    ca_objectif_audio: ca,
                    ca_objectif_video: cv,
                    ca_objectif_global: ca + cv,
                  },
                  () => {
                    setICaAudio(caAudio);
                    setICaVideo(caVideo);
                  },
                );
              }}
            />
          </Section>

          {/* Section 4 — Dispatch sous-pôles (déplacé) */}
          <Section title="Dispatch sous-pôles">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Attribution Audio" suffix="%">
                <Input
                  value={pctAudio}
                  onChange={(e) => setPctAudio(e.target.value)}
                  type="number"
                  className={cn(dirty.pctAudio && dirtyClass)}
                />
              </Field>
              <Field label="Attribution Vidéo" suffix="%">
                <Input
                  value={pctVideo}
                  onChange={(e) => setPctVideo(e.target.value)}
                  type="number"
                  className={cn(dirty.pctVideo && dirtyClass)}
                />
              </Field>
            </div>
            {Math.abs(totalDispatch - 100) > 0.01 && (
              <p className="mt-3 text-sm text-destructive">
                Total : {totalDispatch.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}% — doit être égal à 100%
              </p>
            )}
            <SaveBar
              onSave={() =>
                handleSave(
                  {
                    pct_attribution_audio: (parseFloat(pctAudio) || 0) / 100,
                    pct_attribution_video: (parseFloat(pctVideo) || 0) / 100,
                  },
                  () => {
                    setIPctAudio(pctAudio);
                    setIPctVideo(pctVideo);
                  },
                )
              }
            />
          </Section>

          {/* Section 2 — Saisonnalité */}
          <Section title="Saisonnalité">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SeasonGrid
                title="Audio"
                values={saisonAudio}
                initial={iSaisonAudio}
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
                  handleSave(payload, () => setISaisonAudio(saisonAudio));
                }}
              />
              <SeasonGrid
                title="Vidéo"
                values={saisonVideo}
                initial={iSaisonVideo}
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
                  handleSave(payload, () => setISaisonVideo(saisonVideo));
                }}
              />
            </div>
          </Section>

          {/* Section 3 — Concrétisation pipe */}
          <Section title="Taux de concrétisation pipe">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Option" suffix="%">
                <Input
                  value={tauxOption}
                  onChange={(e) => setTauxOption(e.target.value)}
                  type="number"
                  className={cn(dirty.tauxOption && dirtyClass)}
                />
              </Field>
              <Field label="Confirmé / Prêt / Sur site" suffix="%">
                <Input
                  value={tauxConfirme}
                  onChange={(e) => setTauxConfirme(e.target.value)}
                  type="number"
                  className={cn(dirty.tauxConfirme && dirtyClass)}
                />
              </Field>
            </div>
            <SaveBar
              onSave={() =>
                handleSave(
                  {
                    taux_concretisation_option: (parseFloat(tauxOption) || 0) / 100,
                    taux_concretisation_confirme: (parseFloat(tauxConfirme) || 0) / 100,
                  },
                  () => {
                    setITauxOption(tauxOption);
                    setITauxConfirme(tauxConfirme);
                  },
                )
              }
            />
          </Section>

          {/* Section 5 — Garde-fous */}
          <Section title="Garde-fous enveloppe (Indicateur 1)">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Field label="Plancher Audio" suffix="€">
                <Input
                  value={minAudio}
                  onChange={(e) => setMinAudio(e.target.value)}
                  type="number"
                  className={cn(dirty.minAudio && dirtyClass)}
                />
              </Field>
              <Field label="Plafond Audio" suffix="€">
                <Input
                  value={maxAudio}
                  onChange={(e) => setMaxAudio(e.target.value)}
                  type="number"
                  className={cn(dirty.maxAudio && dirtyClass)}
                />
              </Field>
              <Field label="Plancher Vidéo" suffix="€">
                <Input
                  value={minVideo}
                  onChange={(e) => setMinVideo(e.target.value)}
                  type="number"
                  className={cn(dirty.minVideo && dirtyClass)}
                />
              </Field>
              <Field label="Plafond Vidéo" suffix="€">
                <Input
                  value={maxVideo}
                  onChange={(e) => setMaxVideo(e.target.value)}
                  type="number"
                  className={cn(dirty.maxVideo && dirtyClass)}
                />
              </Field>
            </div>
            <SaveBar
              onSave={() =>
                handleSave(
                  {
                    plancher_audio: parseFloat(minAudio) || 0,
                    plafond_audio: parseFloat(maxAudio) || 0,
                    plancher_video: parseFloat(minVideo) || 0,
                    plafond_video: parseFloat(maxVideo) || 0,
                  },
                  () => {
                    setIMinAudio(minAudio);
                    setIMaxAudio(maxAudio);
                    setIMinVideo(minVideo);
                    setIMaxVideo(maxVideo);
                  },
                )
              }
            />
          </Section>

          {/* Section 6 — Réserve */}
          <Section title="Réserve de sécurité (Indicateur 2)">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Réserve de sécurité" suffix="%">
                <Input
                  value={reserve}
                  onChange={(e) => setReserve(e.target.value)}
                  type="number"
                  className={cn(dirty.reserve && dirtyClass)}
                />
              </Field>
            </div>
            <SaveBar
              onSave={() =>
                handleSave(
                  { reserve_securite: (parseFloat(reserve) || 0) / 100 },
                  () => setIReserve(reserve),
                )
              }
            />
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
  initial,
  onChange,
  total,
  onSave,
}: {
  title: string;
  values: string[];
  initial: string[];
  onChange: (i: number, v: string) => void;
  total: number;
  onSave: () => void;
}) {
  const ok = Math.abs(total - 100) < 0.01;
  return (
    <div className="rounded-md border border-border bg-background/40 p-4">
      <h4 className="mb-3 text-sm font-medium text-foreground">{title}</h4>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {values.map((v, i) => {
          const isDirty = v !== (initial[i] ?? "");
          return (
            <label key={i} className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                {MOIS[i]}
              </span>
              <div className="relative">
                <Input
                  value={v}
                  onChange={(e) => onChange(i, e.target.value)}
                  type="number"
                  className={cn("pr-6 text-sm", isDirty && dirtyClass)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </label>
          );
        })}
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
