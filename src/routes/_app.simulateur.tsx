import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAirtable, type AirtableRecord } from "@/hooks/useAirtable";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowUpRight, RotateCcw, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_app/simulateur")({
  head: () => ({ meta: [{ title: "Simulateur — Pôle Tournage" }] }),
  component: SimulateurPage,
});

const ANNEE = 2026;
const OBJECTIFS_TABLE = "tbllicBAAtlet98Mq";

const MOIS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
];

const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

const fmtEUR = (n: number | null | undefined) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
};

function signClass(n: number) {
  return n >= 0 ? "text-positive" : "text-destructive";
}

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

function notifyApplied() {
  toast.success("Appliqué ✓", { style: { color: "var(--positive)" } });
}
function notifyError(msg?: string) {
  toast.error("Erreur d'enregistrement", {
    description: msg,
    style: { color: "var(--destructive)" },
  });
}

type Pole = "audio" | "video";
type ChargePole = "global" | "audio" | "video";

function SimulateurPage() {
  const metriquesQ = useAirtable("tblNznOYtuFDUI3df", {
    maxRecords: 1,
    sort: [{ field: "date_snapshot", direction: "desc" }],
  });
  const objectifsQ = useAirtable(OBJECTIFS_TABLE, {
    filterByFormula: `{annee}=${ANNEE}`,
  });
  const chargesReellesQ = useAirtable("tblUKvCL4mdfY2VWF", {
    filterByFormula: `{annee}=${ANNEE}`,
  });
  const chargesProvQ = useAirtable("tbljefhnPsyTAgUA4", {
    filterByFormula: `AND({annee}=${ANNEE},{neutralisee}=FALSE(),{source}!='saisie')`,
  });

  const loading =
    metriquesQ.loading || objectifsQ.loading || chargesReellesQ.loading || chargesProvQ.loading;

  const metriques = (metriquesQ.data?.[0]?.fields ?? {}) as Record<string, unknown>;
  const record = objectifsQ.data?.[0];
  const recordId = record?.id;
  const objectifs = (record?.fields ?? {}) as Record<string, unknown>;
  const chargesReelles: AirtableRecord[] = chargesReellesQ.data ?? [];
  const chargesProv: AirtableRecord[] = chargesProvQ.data ?? [];

  const real = useMemo(() => {
    const moisCourant = new Date().getMonth() + 1;
    const pa = num(objectifs.pct_attribution_audio);
    const pv = num(objectifs.pct_attribution_video);
    const cha = chargesReelles
      .filter((r) => str(r.fields.categorie).startsWith("Tournage Son"))
      .reduce((s, r) => s + num(r.fields.montant_impute_ht), 0);
    const chv = chargesReelles
      .filter((r) => str(r.fields.categorie).startsWith("Tournage Image"))
      .reduce((s, r) => s + num(r.fields.montant_impute_ht), 0);
    const chReelTotal = num(metriques.charges_reel_total);
    const chCom = chReelTotal - cha - chv;
    const chProvRest = chargesProv
      .filter((r) => num(r.fields.mois) <= moisCourant)
      .reduce((s, r) => s + num(r.fields.montant_provisionne), 0);

    return {
      moisCourant,
      caAudio: num(metriques.ca_reel_audio),
      caVideo: num(metriques.ca_reel_video),
      caPole: num(metriques.ca_reel_pole),
      caTotal: num(metriques.ca_reel_total),
      caPipeBrutTotal: num(metriques.ca_pipe_brut_total),
      caPipeBrutAudio: num(metriques.ca_pipe_brut_audio),
      caPipeBrutVideo: num(metriques.ca_pipe_brut_video),
      chReelTotal,
      chargesAudio: cha,
      chargesVideo: chv,
      chargesCommunes: chCom,
      chProvRest,
      pctAudio: pa,
      pctVideo: pv,
      caObjectifAudio: num(objectifs.ca_objectif_audio),
      caObjectifVideo: num(objectifs.ca_objectif_video),
      caObjectifGlobal: num(objectifs.ca_objectif_global),
      reserve: num(objectifs.reserve_securite) || 0.2,
      plancherAudio: num(objectifs.plancher_audio),
      plafondAudio: num(objectifs.plafond_audio),
      plancherVideo: num(objectifs.plancher_video),
      plafondVideo: num(objectifs.plafond_video),
      tauxOption: num(objectifs.taux_concretisation_option),
      tauxConfirme: num(objectifs.taux_concretisation_confirme),
      saisonAudio: Array.from({ length: 12 }, (_, i) =>
        num(objectifs[`saisonnalite_audio_${String(i + 1).padStart(2, "0")}`]),
      ),
      saisonVideo: Array.from({ length: 12 }, (_, i) =>
        num(objectifs[`saisonnalite_video_${String(i + 1).padStart(2, "0")}`]),
      ),
      dateSnapshot: str(metriques.date_snapshot) || "—",
    };
  }, [metriques, objectifs, chargesReelles, chargesProv]);

  const [caObjAudio, setCaObjAudio] = useState(0);
  const [caObjVideo, setCaObjVideo] = useState(0);
  const [pctAudio, setPctAudio] = useState(0);
  const [reserve, setReserve] = useState(0);
  const [plancherAudio, setPlancherAudio] = useState(0);
  const [plafondAudio, setPlafondAudio] = useState(0);
  const [plancherVideo, setPlancherVideo] = useState(0);
  const [plafondVideo, setPlafondVideo] = useState(0);
  const [tauxOption, setTauxOption] = useState(0);
  const [tauxConfirme, setTauxConfirme] = useState(0);
  const [saisonAudio, setSaisonAudio] = useState<number[]>(Array(12).fill(0));
  const [saisonVideo, setSaisonVideo] = useState<number[]>(Array(12).fill(0));

  const [chgLabel, setChgLabel] = useState("");
  const [chgMontant, setChgMontant] = useState("");
  const [chgPole, setChgPole] = useState<ChargePole>("global");

  const [seasonOpen, setSeasonOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const reset = () => {
    setCaObjAudio(real.caObjectifAudio);
    setCaObjVideo(real.caObjectifVideo);
    setPctAudio(real.pctAudio * 100);
    setReserve(real.reserve * 100);
    setPlancherAudio(real.plancherAudio);
    setPlafondAudio(real.plafondAudio);
    setPlancherVideo(real.plancherVideo);
    setPlafondVideo(real.plafondVideo);
    setTauxOption(real.tauxOption * 100);
    setTauxConfirme(real.tauxConfirme * 100);
    setSaisonAudio(real.saisonAudio.map((v) => v * 100));
    setSaisonVideo(real.saisonVideo.map((v) => v * 100));
    setChgLabel("");
    setChgMontant("");
    setChgPole("global");
  };

  useEffect(() => {
    if (!hydrated && recordId && metriquesQ.data) {
      reset();
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, recordId, metriquesQ.data]);

  const handleReset = async () => {
    await Promise.all([
      objectifsQ.refetch(),
      metriquesQ.refetch(),
      chargesReellesQ.refetch(),
      chargesProvQ.refetch(),
    ]);
    setHydrated(false);
  };

  // ── Computed simulated values ─────────────────────────────────────────
  const caObjGlobal = caObjAudio + caObjVideo;
  const pctVideo = 100 - pctAudio;

  const totalSaisonAudio = saisonAudio.reduce((s, v) => s + v, 0);
  const totalSaisonVideo = saisonVideo.reduce((s, v) => s + v, 0);
  const moisConfigures = saisonAudio.filter((v) => v > 0).length + saisonVideo.filter((v) => v > 0).length;

  const chgMontantNum = parseFloat(chgMontant) || 0;
  const chgIsAudio = chgPole === "audio" ? chgMontantNum : chgPole === "global" ? chgMontantNum * (pctAudio / 100) : 0;
  const chgIsVideo = chgPole === "video" ? chgMontantNum : chgPole === "global" ? chgMontantNum * (pctVideo / 100) : 0;

  const chargesReelTotalSim = real.chReelTotal + chgMontantNum;
  const chargesAudioTotal =
    real.chargesAudio + real.chargesCommunes * (pctAudio / 100) + chgIsAudio;
  const chargesVideoTotal =
    real.chargesVideo + real.chargesCommunes * (pctVideo / 100) + chgIsVideo;

  const resT = real.caTotal - chargesReelTotalSim;
  const resA = real.caAudio - chargesAudioTotal;
  const resV = real.caVideo - chargesVideoTotal;
  const sommeAV = resA + resV;
  const partAudio = sommeAV > 0 ? Math.min(resA / sommeAV, 1) : 0.5;
  const partVideo = sommeAV > 0 ? Math.min(resV / sommeAV, 1) : 0.5;

  const maxAudio = plafondAudio > 0 ? plafondAudio : Infinity;
  const maxVideo = plafondVideo > 0 ? plafondVideo : Infinity;
  const enveloppeAudio =
    resT > 0 ? Math.min(Math.max(resT * partAudio, plancherAudio), maxAudio) : plancherAudio;
  const enveloppeVideo =
    resT > 0 ? Math.min(Math.max(resT * partVideo, plancherVideo), maxVideo) : plancherVideo;

  const pctAnneeEcoulee = saisonAudio
    .slice(0, real.moisCourant)
    .reduce((s, v) => s + v / 100, 0);

  const caObjectifYTD = caObjGlobal * pctAnneeEcoulee;
  const surplus = real.caTotal - caObjectifYTD;
  const caPondere = surplus >= 0 ? caObjectifYTD + surplus * pctAnneeEcoulee : real.caTotal;
  const chargesYTD = chargesReelTotalSim + real.chProvRest;
  const resPondere = caPondere - chargesYTD;
  const reserveDecimal = reserve / 100;
  const indicateur2 = resPondere > 0 ? resPondere * (1 - reserveDecimal) : resPondere;
  const montantReserve = resPondere > 0 ? resPondere * reserveDecimal : 0;

  const realChargesAudioTotal =
    real.chargesAudio + real.chargesCommunes * real.pctAudio;
  const realChargesVideoTotal =
    real.chargesVideo + real.chargesCommunes * real.pctVideo;
  const realResT = real.caTotal - real.chReelTotal;
  const realResA = real.caAudio - realChargesAudioTotal;
  const realResV = real.caVideo - realChargesVideoTotal;
  const realSomme = realResA + realResV;
  const realPartA = realSomme > 0 ? Math.min(realResA / realSomme, 1) : 0.5;
  const realPartV = realSomme > 0 ? Math.min(realResV / realSomme, 1) : 0.5;
  const realMaxA = real.plafondAudio > 0 ? real.plafondAudio : Infinity;
  const realMaxV = real.plafondVideo > 0 ? real.plafondVideo : Infinity;
  const realEnvA =
    realResT > 0
      ? Math.min(Math.max(realResT * realPartA, real.plancherAudio), realMaxA)
      : real.plancherAudio;
  const realEnvV =
    realResT > 0
      ? Math.min(Math.max(realResT * realPartV, real.plancherVideo), realMaxV)
      : real.plancherVideo;
  const realPctAnnee = real.saisonAudio
    .slice(0, real.moisCourant)
    .reduce((s, v) => s + v, 0);
  const realCaObjYTD = real.caObjectifGlobal * realPctAnnee;
  const realSurplus = real.caTotal - realCaObjYTD;
  const realCaPond = realSurplus >= 0 ? realCaObjYTD + realSurplus * realPctAnnee : real.caTotal;
  const realChYTD = real.chReelTotal + real.chProvRest;
  const realResPond = realCaPond - realChYTD;
  const realInd2 = realResPond > 0 ? realResPond * (1 - real.reserve) : realResPond;

  async function patchOne(field: string, value: unknown) {
    if (!recordId) {
      notifyError("Enregistrement 2026 introuvable");
      return;
    }
    try {
      await patchAirtable(OBJECTIFS_TABLE, recordId, { [field]: value });
      notifyApplied();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    }
  }

  async function patchMany(fields: Record<string, unknown>) {
    if (!recordId) {
      notifyError("Enregistrement 2026 introuvable");
      return;
    }
    try {
      await patchAirtable(OBJECTIFS_TABLE, recordId, fields);
      await objectifsQ.refetch();
      notifyApplied();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    }
  }

  const applyAll = () => {
    patchMany({
      ca_objectif_audio: caObjAudio,
      ca_objectif_video: caObjVideo,
      ca_objectif_global: caObjGlobal,
      pct_attribution_audio: pctAudio / 100,
      pct_attribution_video: pctVideo / 100,
      reserve_securite: reserveDecimal,
      plancher_audio: plancherAudio,
      plafond_audio: plafondAudio,
      plancher_video: plancherVideo,
      plafond_video: plafondVideo,
      taux_concretisation_option: tauxOption / 100,
      taux_concretisation_confirme: tauxConfirme / 100,
    });
  };

  const applySaisonnalite = () => {
    const payload: Record<string, unknown> = {};
    saisonAudio.forEach((v, i) => {
      payload[`saisonnalite_audio_${String(i + 1).padStart(2, "0")}`] = v / 100;
    });
    saisonVideo.forEach((v, i) => {
      payload[`saisonnalite_video_${String(i + 1).padStart(2, "0")}`] = v / 100;
    });
    patchMany(payload);
  };

  if (loading && !hydrated) {
    return (
      <div className="-m-8 flex min-h-screen" style={{ backgroundColor: "#161616" }}>
        <div className="p-6 w-full">
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="-m-8 flex min-h-screen"
      style={{ backgroundColor: "#161616" }}
    >
      {/* ── Sidebar gauche (paramètres) ─────────────────────────────── */}
      <aside
        className="sticky top-0 flex h-screen w-[360px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-5"
        style={{ backgroundColor: "#12121A" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Paramètres</h2>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Recharger depuis Airtable"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Snapshot {real.dateSnapshot} · {ANNEE}
        </p>

        <hr className="border-border" />

        {/* Charge simulable */}
        <SidebarSection title="Charger simulable">
          <p className="text-[11px] text-muted-foreground">
            S'ajoute aux charges réelles dans tous les calculs. Non écrite dans Airtable.
          </p>
          <FieldLabel>Libellé</FieldLabel>
          <Input
            value={chgLabel}
            onChange={(e) => setChgLabel(e.target.value)}
            placeholder="ex. Achat matériel"
            className="h-9 text-sm"
          />
          <FieldLabel>Montant</FieldLabel>
          <SuffixedInput
            type="number"
            value={chgMontant}
            onChange={(v) => setChgMontant(v)}
            suffix="€"
          />
          <FieldLabel>Pôle</FieldLabel>
          <select
            value={chgPole}
            onChange={(e) => setChgPole(e.target.value as ChargePole)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="global">Global</option>
            <option value="audio">Audio</option>
            <option value="video">Vidéo</option>
          </select>
          {chgMontantNum > 0 && (
            <div className="rounded-md border border-border bg-background/30 p-2 text-[11px] text-muted-foreground">
              Imputation simulée :{" "}
              <span style={{ color: "var(--pole-audio-text)" }}>Audio {fmtEUR(chgIsAudio)}</span>
              {" · "}
              <span style={{ color: "var(--pole-video-text)" }}>Vidéo {fmtEUR(chgIsVideo)}</span>
            </div>
          )}
        </SidebarSection>

        <hr className="border-border" />

        {/* Paramètres annuels */}
        <SidebarSection title="Paramètres annuels">
          <NumberFieldRow
            label="CA objectif Audio"
            suffix="€"
            pole="audio"
            value={caObjAudio}
            onChange={setCaObjAudio}
            onApply={() => patchOne("ca_objectif_audio", caObjAudio)}
          />
          <NumberFieldRow
            label="CA objectif Vidéo"
            suffix="€"
            pole="video"
            value={caObjVideo}
            onChange={setCaObjVideo}
            onApply={() => patchOne("ca_objectif_video", caObjVideo)}
          />
          <ReadonlyFieldRow label="CA objectif Global (calculé)" value={fmtEUR(caObjGlobal)} />

          <NumberFieldRow
            label="% attribution Audio"
            suffix="%"
            pole="audio"
            value={pctAudio}
            onChange={setPctAudio}
            onApply={() =>
              patchMany({
                pct_attribution_audio: pctAudio / 100,
                pct_attribution_video: pctVideo / 100,
              })
            }
          />
          <ReadonlyFieldRow
            label="% attribution Vidéo (déduit)"
            value={`${pctVideo.toFixed(0)} %`}
            pole="video"
          />

          <NumberFieldRow
            label="Réserve de sécurité"
            suffix="%"
            value={reserve}
            onChange={setReserve}
            onApply={() => patchOne("reserve_securite", reserveDecimal)}
          />
        </SidebarSection>

        {/* Garde-fous enveloppe */}
        <SidebarSection title="Garde-fous enveloppe">
          <div className="grid grid-cols-2 gap-2">
            <NumberFieldRow
              label="Plancher Audio"
              suffix="€"
              pole="audio"
              value={plancherAudio}
              onChange={setPlancherAudio}
              onApply={() => patchOne("plancher_audio", plancherAudio)}
              compact
            />
            <NumberFieldRow
              label="Plafond Audio"
              suffix="€"
              pole="audio"
              value={plafondAudio}
              onChange={setPlafondAudio}
              onApply={() => patchOne("plafond_audio", plafondAudio)}
              compact
            />
            <NumberFieldRow
              label="Plancher Vidéo"
              suffix="€"
              pole="video"
              value={plancherVideo}
              onChange={setPlancherVideo}
              onApply={() => patchOne("plancher_video", plancherVideo)}
              compact
            />
            <NumberFieldRow
              label="Plafond Vidéo"
              suffix="€"
              pole="video"
              value={plafondVideo}
              onChange={setPlafondVideo}
              onApply={() => patchOne("plafond_video", plafondVideo)}
              compact
            />
          </div>
        </SidebarSection>

        {/* Taux de concrétisation */}
        <SidebarSection title="Taux de concrétisation">
          <NumberFieldRow
            label="Taux Option"
            suffix="%"
            value={tauxOption}
            onChange={setTauxOption}
            onApply={() => patchOne("taux_concretisation_option", tauxOption / 100)}
          />
          <NumberFieldRow
            label="Taux Confirmé"
            suffix="%"
            value={tauxConfirme}
            onChange={setTauxConfirme}
            onApply={() => patchOne("taux_concretisation_confirme", tauxConfirme / 100)}
          />
        </SidebarSection>

        <div className="mt-auto pt-3">
          <Button
            onClick={applyAll}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Appliquer tous les paramètres
          </Button>
        </div>
      </aside>

      {/* ── Zone droite (résultats) ─────────────────────────────────── */}
      <div className="flex-1 p-6 space-y-4">
        <header className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Simulateur · {ANNEE}</h1>
          <span
            className="rounded px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: "rgba(232, 197, 71, 0.15)", color: "#E8C547" }}
          >
            Simulation
          </span>
        </header>

        {/* Saisonnalité avancée */}
        <div
          className="rounded-lg border border-border p-4"
          style={{ backgroundColor: "#181820" }}
        >
          <button
            type="button"
            onClick={() => setSeasonOpen((o) => !o)}
            className="flex w-full items-center justify-between text-sm font-medium text-foreground"
          >
            <div className="flex items-center gap-2">
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", seasonOpen && "rotate-180")}
              />
              <span>Saisonnalité avancée</span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {moisConfigures} mois
              </span>
            </div>
          </button>
          {seasonOpen && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SeasonSimGrid
                  title="Audio"
                  pole="audio"
                  values={saisonAudio}
                  onChange={(i, v) =>
                    setSaisonAudio((p) => p.map((x, idx) => (idx === i ? v : x)))
                  }
                  total={totalSaisonAudio}
                />
                <SeasonSimGrid
                  title="Vidéo"
                  pole="video"
                  values={saisonVideo}
                  onChange={(i, v) =>
                    setSaisonVideo((p) => p.map((x, idx) => (idx === i ? v : x)))
                  }
                  total={totalSaisonVideo}
                  onCopyFrom={() => setSaisonVideo([...saisonAudio])}
                />
              </div>
              <div className="flex justify-center">
                <Button
                  onClick={applySaisonnalite}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  Appliquer la saisonnalité
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Ligne 1 — métriques */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SimMetricCard
            title="État réel · YTD"
            value={fmtEUR(real.caTotal)}
            real={real.caTotal}
            sim={real.caTotal}
            lines={[
              { label: "Audio", value: fmtEUR(real.caAudio), pole: "audio" },
              { label: "Vidéo", value: fmtEUR(real.caVideo), pole: "video" },
              { label: "Pôle", value: fmtEUR(real.caPole) },
            ]}
          />
          <SimMetricCard
            title="Avancement · YTD"
            value={fmtEUR(chargesReelTotalSim)}
            real={real.chReelTotal}
            sim={chargesReelTotalSim}
            lines={[
              { label: "Charges Audio", value: fmtEUR(chargesAudioTotal), pole: "audio" },
              { label: "Charges Vidéo", value: fmtEUR(chargesVideoTotal), pole: "video" },
            ]}
          />
          <SimMetricCard
            title="Pipeline · Global"
            value={fmtEUR(real.caPipeBrutTotal)}
            real={real.caPipeBrutTotal}
            sim={real.caPipeBrutTotal}
            lines={[
              { label: "Pipe Audio", value: fmtEUR(real.caPipeBrutAudio), pole: "audio" },
              { label: "Pipe Vidéo", value: fmtEUR(real.caPipeBrutVideo), pole: "video" },
            ]}
          />
        </section>

        {/* Ligne 2 — enveloppes pôles */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SimEnvelopeCard
            icon="🎙"
            title="Enveloppe Audio"
            pole="audio"
            value={enveloppeAudio}
            realValue={realEnvA}
            ca={real.caAudio}
            charges={chargesAudioTotal}
          />
          <SimEnvelopeCard
            icon="🎬"
            title="Enveloppe Vidéo"
            pole="video"
            value={enveloppeVideo}
            realValue={realEnvV}
            ca={real.caVideo}
            charges={chargesVideoTotal}
          />
        </section>

        {/* Ligne 3 — capacité d'investissement */}
        <section>
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="mb-3 flex items-center gap-3">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                💡 Capacité d'investissement · Pôle Tournage
              </h3>
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: "rgba(232, 197, 71, 0.15)", color: "#E8C547" }}
              >
                Simulé
              </span>
            </div>
            <p className={cn("text-3xl font-semibold", signClass(indicateur2))}>
              {fmtEUR(indicateur2)}
            </p>
            {Math.round(indicateur2) !== Math.round(realInd2) && (
              <p className="mt-1 text-xs" style={{ color: "#888" }}>
                Réel : {fmtEUR(realInd2)}
              </p>
            )}
            <div className="mt-5 border-t border-border" />
            <div className="mt-4 space-y-0">
              <CalcRow op="" label="CA réel YTD" value={fmtEUR(real.caTotal)} />
              <CalcRow op="−" label="CA objectif YTD" value={`− ${fmtEUR(caObjectifYTD)}`} />
              <CalcRow op="=" label="Surplus" value={fmtEUR(surplus)} />
              <CalcRow
                op="×"
                label={`% année écoulée (${(pctAnneeEcoulee * 100).toFixed(0)}%)`}
                value={`× ${(pctAnneeEcoulee * 100).toFixed(0)}%`}
              />
              <CalcRow op="=" label="Surplus pondéré" value={fmtEUR(surplus * pctAnneeEcoulee)} />
              <CalcRow op="+" label="CA objectif YTD" value={`+ ${fmtEUR(caObjectifYTD)}`} />
              <CalcRow op="=" label="CA pondéré" value={fmtEUR(caPondere)} />
              <CalcRow op="−" label="Charges YTD (réel + prov.)" value={`− ${fmtEUR(chargesYTD)}`} />
              <CalcRow op="=" label="Résultat pondéré" value={fmtEUR(resPondere)} semantic={resPondere} />
              <CalcRow
                op="−"
                label={`Réserve sécurité (${reserve.toFixed(0)}%)`}
                value={montantReserve > 0 ? `− ${fmtEUR(montantReserve)}` : fmtEUR(0)}
              />
            </div>
            <div className="mt-3 border-t border-border" />
            <div className="mt-3">
              <CalcRow
                op="="
                label="Capacité d'investissement"
                value={fmtEUR(indicateur2)}
                semantic={indicateur2}
                bold
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Sidebar helpers ────────────────────────────────────────────────────

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

function SuffixedInput({
  value,
  onChange,
  suffix,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  suffix: string;
  type?: string;
}) {
  return (
    <div className="relative">
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onWheel={(e) => (e.target as HTMLInputElement).blur()}
        className="h-9 pr-7 text-sm"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
        {suffix}
      </span>
    </div>
  );
}

const poleStyles = (pole?: Pole) => ({
  bg:
    pole === "audio"
      ? "var(--pole-audio-bg)"
      : pole === "video"
        ? "var(--pole-video-bg)"
        : undefined,
  text:
    pole === "audio"
      ? "var(--pole-audio-text)"
      : pole === "video"
        ? "var(--pole-video-text)"
        : undefined,
});

function NumberFieldRow({
  label,
  suffix,
  pole,
  value,
  onChange,
  onApply,
  compact,
}: {
  label: string;
  suffix: string;
  pole?: Pole;
  value: number;
  onChange: (v: number) => void;
  onApply: () => void;
  compact?: boolean;
}) {
  const { bg, text } = poleStyles(pole);
  return (
    <div className="rounded-md p-1.5" style={bg ? { backgroundColor: bg } : undefined}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span
          className={cn("uppercase tracking-wide", compact ? "text-[10px]" : "text-[11px]")}
          style={{ color: text ?? "var(--color-muted-foreground)" }}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={onApply}
          className="text-muted-foreground hover:text-accent"
          title="Appliquer dans Airtable"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          className="h-9 pr-7 text-sm"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
    </div>
  );
}

function ReadonlyFieldRow({
  label,
  value,
  pole,
}: {
  label: string;
  value: string;
  pole?: Pole;
}) {
  const { bg, text } = poleStyles(pole);
  return (
    <div className="rounded-md p-1.5" style={bg ? { backgroundColor: bg } : undefined}>
      <span
        className="mb-1 block text-[11px] uppercase tracking-wide"
        style={{ color: text ?? "var(--color-muted-foreground)" }}
      >
        {label}
      </span>
      <div className="flex h-9 items-center rounded-md border border-border bg-background/30 px-3 text-sm text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

function SeasonSimGrid({
  title,
  pole,
  values,
  onChange,
  total,
  onCopyFrom,
}: {
  title: string;
  pole: Pole;
  values: number[];
  onChange: (i: number, v: number) => void;
  total: number;
  onCopyFrom?: () => void;
}) {
  const ok = Math.abs(total - 100) < 0.01;
  const cardBg = pole === "audio" ? "var(--pole-audio-bg)" : "var(--pole-video-bg)";
  const txt = pole === "audio" ? "var(--pole-audio-text)" : "var(--pole-video-text)";
  const cellBg = pole === "audio" ? "var(--pole-audio-cell)" : "var(--pole-video-cell)";
  const qBg = pole === "audio" ? "var(--pole-audio-quarter)" : "var(--pole-video-quarter)";
  const qBorder =
    pole === "audio" ? "var(--pole-audio-quarter-border)" : "var(--pole-video-quarter-border)";

  const quarters = [0, 1, 2, 3].map((q) => {
    const months = [q * 3, q * 3 + 1, q * 3 + 2];
    const sum = months.reduce((s, i) => s + (values[i] ?? 0), 0);
    return { q, months, sum };
  });

  return (
    <div className="rounded-md border border-border p-4" style={{ backgroundColor: cardBg }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium" style={{ color: txt }}>
          {title}
        </h4>
        {onCopyFrom && (
          <button
            type="button"
            onClick={onCopyFrom}
            className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Copier Audio → Vidéo
          </button>
        )}
      </div>
      <div className="space-y-2">
        {quarters.map(({ q, months, sum }) => (
          <div key={q} className="grid grid-cols-4 gap-2">
            {months.map((i) => (
              <label key={i} className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                  {MOIS[i]}
                </span>
                <div className="relative">
                  <Input
                    type="number"
                    value={values[i] ?? 0}
                    onChange={(e) => onChange(i, parseFloat(e.target.value) || 0)}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    className="pr-6 text-sm"
                    style={{ backgroundColor: cellBg }}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </label>
            ))}
            <div className="block">
              <span
                className="mb-1 block text-[10px] uppercase tracking-wide"
                style={{ color: txt }}
              >
                T{q + 1}
              </span>
              <div
                className="flex h-9 items-center justify-end rounded-md border px-3 text-sm font-medium"
                style={{ backgroundColor: qBg, borderColor: qBorder, color: txt }}
              >
                {sum.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}%
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className={cn("mt-3 text-sm", ok ? "text-positive" : "text-destructive")}>
        Total : {total.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}%
        {!ok && " — doit être égal à 100%"}
      </p>
    </div>
  );
}

// ── Result cards ───────────────────────────────────────────────────────

function SimMetricCard({
  title,
  value,
  real,
  sim,
  lines,
}: {
  title: string;
  value: string;
  real: number;
  sim: number;
  lines: { label: string; value: string; pole?: Pole }[];
}) {
  const diff = Math.round(real) !== Math.round(sim);
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: "rgba(232, 197, 71, 0.15)", color: "#E8C547" }}
        >
          Simulé
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {diff && (
        <p className="mt-0.5 text-xs" style={{ color: "#888" }}>
          Réel : {fmtEUR(real)}
        </p>
      )}
      <ul className="mt-4 space-y-1">
        {lines.map((l) => {
          const { bg, text } = poleStyles(l.pole);
          return (
            <li
              key={l.label}
              className="flex items-center justify-between rounded px-2 py-1 text-sm"
              style={
                l.pole
                  ? { backgroundColor: bg, color: text }
                  : { color: "var(--color-muted-foreground)" }
              }
            >
              <span>{l.label}</span>
              <span
                className="font-medium"
                style={l.pole ? { color: text } : { color: "var(--color-foreground)" }}
              >
                {l.value}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SimEnvelopeCard({
  icon,
  title,
  pole,
  value,
  realValue,
  ca,
  charges,
}: {
  icon: string;
  title: string;
  pole: Pole;
  value: number;
  realValue: number;
  ca: number;
  charges: number;
}) {
  const diff = Math.round(value) !== Math.round(realValue);
  const text = pole === "audio" ? "var(--pole-audio-text)" : "var(--pole-video-text)";
  return (
    <div
      className="rounded-lg border border-border p-5"
      style={{
        backgroundColor: pole === "audio" ? "var(--pole-audio-bg)" : "var(--pole-video-bg)",
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium" style={{ color: text }}>
          {icon} {title}
        </h3>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: "rgba(232, 197, 71, 0.15)", color: "#E8C547" }}
        >
          Simulé
        </span>
      </div>
      <p className={cn("mt-2 text-3xl font-semibold", signClass(value))}>{fmtEUR(value)}</p>
      {diff && (
        <p className="mt-0.5 text-xs" style={{ color: "#888" }}>
          Réel : {fmtEUR(realValue)}
        </p>
      )}
      <dl className="mt-6 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">CA réel</dt>
          <dd className="font-medium text-foreground">{fmtEUR(ca)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Charges</dt>
          <dd className="font-medium text-foreground">{fmtEUR(charges)}</dd>
        </div>
      </dl>
    </div>
  );
}

function CalcRow({
  op,
  label,
  value,
  semantic,
  bold,
}: {
  op: string;
  label: string;
  value: string;
  semantic?: number;
  bold?: boolean;
}) {
  const valueColor =
    semantic === undefined
      ? "#F0F0F0"
      : semantic >= 0
        ? "var(--color-positive)"
        : "var(--color-destructive)";
  const labelColor = semantic === undefined ? "#888" : valueColor;
  const isTotal = op === "=";
  return (
    <div
      className={cn(
        "grid grid-cols-[1.25rem_1fr_auto] items-center gap-3 px-2 py-1 text-sm rounded",
        bold && "font-semibold",
      )}
      style={isTotal ? { backgroundColor: "rgba(255, 255, 255, 0.04)" } : undefined}
    >
      <span className="font-mono" style={{ color: "#555" }}>{op}</span>
      <span style={{ color: labelColor }}>{label}</span>
      <span className="tabular-nums" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}
