import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAirtable, type AirtableRecord } from "@/hooks/useAirtable";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — Pôle Tournage" }] }),
  component: DashboardPage,
});

const ANNEE = 2026;

const fmtEUR = (n: number | null | undefined) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
};

const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function signClass(n: number) {
  return n >= 0 ? "text-positive" : "text-destructive";
}

const C_AUDIO = "#94a3b8";
const C_VIDEO = "#9da4e8";
const C_ACCENT = "#E8C547";
const C_POS = "#4CAF7D";
const C_NEG = "#E05252";

function DashboardPage() {
  const moisCourant = new Date().getMonth() + 1;
  const [graphScope, setGraphScope] = useState<"Global" | "Audio" | "Vidéo">("Global");

  const metriquesQ = useAirtable("tblNznOYtuFDUI3df", {
    maxRecords: 1,
    sort: [{ field: "date_snapshot", direction: "desc" }],
  });
  const objectifsQ = useAirtable("tbllicBAAtlet98Mq", {
    filterByFormula: `{annee}=${ANNEE}`,
  });
  const chargesReellesQ = useAirtable("tblUKvCL4mdfY2VWF", {
    filterByFormula: `{annee}=${ANNEE}`,
  });
  const chargesProvQ = useAirtable("tbljefhnPsyTAgUA4", {
    filterByFormula: `AND({annee}=${ANNEE},{neutralisee}=FALSE(),{source}!='saisie')`,
  });
  const revenusQ = useAirtable("tblsL8JhKfNljsDVC", {
    filterByFormula: `AND({statut_rentman}='Retour',YEAR({date_facturation})=${ANNEE})`,
  });
  const salariesMoisQ = useAirtable("tbl0bVuIyeIOXbjGH", {
    filterByFormula: `AND({annee}=${ANNEE},{mois}<=${moisCourant})`,
  });

  const loading =
    metriquesQ.loading ||
    objectifsQ.loading ||
    chargesReellesQ.loading ||
    chargesProvQ.loading ||
    revenusQ.loading ||
    salariesMoisQ.loading;

  const errors = [
    metriquesQ.error && { label: "Métriques", error: metriquesQ.error },
    objectifsQ.error && { label: "Objectifs", error: objectifsQ.error },
    chargesReellesQ.error && { label: "Charges réelles", error: chargesReellesQ.error },
    chargesProvQ.error && { label: "Charges provisionnées", error: chargesProvQ.error },
    revenusQ.error && { label: "Revenus", error: revenusQ.error },
    salariesMoisQ.error && { label: "Salaires", error: salariesMoisQ.error },
  ].filter(Boolean) as { label: string; error: Error }[];

  const metriques = (metriquesQ.data?.[0]?.fields ?? {}) as Record<string, unknown>;
  const objectifs = (objectifsQ.data?.[0]?.fields ?? {}) as Record<string, unknown>;
  const chargesReelles: AirtableRecord[] = chargesReellesQ.data ?? [];
  const chargesProv: AirtableRecord[] = chargesProvQ.data ?? [];
  const revenus: AirtableRecord[] = revenusQ.data ?? [];

  // ── Calculs ──────────────────────────────────────────────────────────────
  const pctAudio = num(objectifs.pct_attribution_audio);
  const pctVideo = num(objectifs.pct_attribution_video);

  const chargesAudio = chargesReelles
    .filter((r) => str(r.fields.categorie).startsWith("Tournage Son"))
    .reduce((s, r) => s + num(r.fields.montant_impute_ht), 0);
  const chargesVideo = chargesReelles
    .filter((r) => str(r.fields.categorie).startsWith("Tournage Image"))
    .reduce((s, r) => s + num(r.fields.montant_impute_ht), 0);

  const chargesReelTotal = num(metriques.charges_reel_total);
  const chargesCommunes = chargesReelTotal - chargesAudio - chargesVideo;
  const chargesAudioTotal = chargesAudio + chargesCommunes * pctAudio;
  const chargesVideoTotal = chargesVideo + chargesCommunes * pctVideo;

  // Salaires
  const salairesImputes = (salariesMoisQ.data ?? []).reduce(
    (s, r) => s + num(r.fields.montant_impute),
    0,
  );
  const salairesAudio = salairesImputes * pctAudio;
  const salairesVideo = salairesImputes * pctVideo;

  // Provisions
  const chargesProvRestantes = chargesProv
    .filter((r) => num(r.fields.mois) <= moisCourant)
    .reduce((s, r) => s + num(r.fields.montant_provisionne), 0);

  const chargesTotalGlobal = chargesReelTotal + chargesProvRestantes + salairesImputes;
  const chargesTotalAudio = chargesAudioTotal + chargesProvRestantes * pctAudio + salairesAudio;
  const chargesTotalVideo = chargesVideoTotal + chargesProvRestantes * pctVideo + salairesVideo;

  // CA
  const caAudio = num(metriques.ca_reel_audio);
  const caVideo = num(metriques.ca_reel_video);
  const caTotal = num(metriques.ca_reel_total);

  // Indicateur 1 — enveloppes
  const resT = caTotal - chargesTotalGlobal;
  const resA = caAudio - chargesTotalAudio;
  const resV = caVideo - chargesTotalVideo;
  const sommeAV = resA + resV;
  const partAudio = sommeAV > 0 ? Math.min(resA / sommeAV, 1) : 0.5;
  const partVideo = sommeAV > 0 ? Math.min(resV / sommeAV, 1) : 0.5;

  const minAudio = num(objectifs.plancher_audio);
  const maxAudioRaw = num(objectifs.plafond_audio);
  const maxAudio = maxAudioRaw > 0 ? maxAudioRaw : Infinity;
  const minVideo = num(objectifs.plancher_video);
  const maxVideoRaw = num(objectifs.plafond_video);
  const maxVideo = maxVideoRaw > 0 ? maxVideoRaw : Infinity;

  const enveloppeAudio =
    resT > 0 ? Math.min(Math.max(resT * partAudio, minAudio), maxAudio) : minAudio;
  const enveloppeVideo =
    resT > 0 ? Math.min(Math.max(resT * partVideo, minVideo), maxVideo) : minVideo;

  // Saisonnalité
  const saisonFields = Array.from({ length: moisCourant }, (_, i) =>
    `saisonnalite_audio_${String(i + 1).padStart(2, "0")}`,
  );
  const pctAnneeEcoulee = saisonFields.reduce((s, f) => s + num(objectifs[f]), 0);

  // Indicateur 2
  const caObjectifGlobal = num(objectifs.ca_objectif_global);
  const caObjectifYTD = caObjectifGlobal * pctAnneeEcoulee;
  const surplus = caTotal - caObjectifYTD;
  const surplusPondere = surplus * pctAnneeEcoulee;
  const caPondere = surplus >= 0 ? caObjectifYTD + surplusPondere : caTotal;
  const chargesYTD = chargesTotalGlobal;
  const resPondere = caPondere - chargesYTD;

  const reserveRaw = num(objectifs.reserve_securite);
  const reserve = reserveRaw > 0 ? reserveRaw : 0.2;
  const indicateur2 = resPondere > 0 ? resPondere * (1 - reserve) : resPondere;
  const montantReserve = resPondere > 0 ? resPondere * reserve : 0;

  // Pipe
  const pipeOptTotal = num(metriques.ca_pipe_optimiste_total);
  const pipeOptAudio = num(metriques.ca_pipe_optimiste_audio);
  const pipeOptVideo = num(metriques.ca_pipe_optimiste_video);
  const pipePonTotal = num(metriques.ca_pipe_pondere_total);
  const pipePonAudio = num(metriques.ca_pipe_pondere_audio);
  const pipePonVideo = num(metriques.ca_pipe_pondere_video);
  const pipeBrutTotal = num(metriques.ca_pipe_brut_total);
  const pipeRetenuTotal = pipeOptTotal + pipePonTotal;
  const pipeRetenuAudio = pipeOptAudio + pipePonAudio;
  const pipeRetenuVideo = pipeOptVideo + pipePonVideo;

  // Avancement
  const pctRealisationYTD = caObjectifYTD > 0 ? caTotal / caObjectifYTD : 0;
  const pctCaAnnuelRealise = caObjectifGlobal > 0 ? caTotal / caObjectifGlobal : 0;
  const ecartPosition = pctCaAnnuelRealise - pctAnneeEcoulee;

  // Projection
  const objectifsMoisRestants = caObjectifGlobal - caObjectifYTD;
  const caProjecte = caTotal + objectifsMoisRestants;
  const ecartProjecte = caProjecte - caObjectifGlobal;
  const pctRealisationAnnuelProjecte = caObjectifGlobal > 0 ? caProjecte / caObjectifGlobal : 0;

  const dateSnapshot = str(metriques.date_snapshot) || "—";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* En-tête */}
      <header className="border-b border-border pb-4">
        <h2 className="text-2xl font-semibold text-foreground">
          Tableau de bord · Pôle Tournage
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Snapshot au {dateSnapshot} · Données CA au {dateSnapshot}
        </p>
      </header>

      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((e) => (
            <p key={e.label} className="text-xs text-muted-foreground">
              Erreur · {e.label} : {e.error.message}
            </p>
          ))}
        </div>
      )}

      {/* BLOC 1 — 3 cards */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Card 1 — État réel */}
        <BaseCard loading={loading} label="État réel · YTD">
          <p className={cn("text-3xl font-semibold", signClass(caTotal - chargesTotalGlobal))}>
            {fmtEUR(caTotal - chargesTotalGlobal)}
          </p>
          <ul className="mt-4 space-y-1.5 text-sm">
            <DetailRow label="CA réel YTD" value={fmtEUR(caTotal)} />
            <DetailRow label="Charges YTD totales" value={fmtEUR(chargesTotalGlobal)} />
            <SubDetail label="dont charges réelles" value={fmtEUR(chargesReelTotal)} />
            <SubDetail label="dont provisions restantes" value={fmtEUR(chargesProvRestantes)} />
            <SubDetail label="dont salaires imputés" value={fmtEUR(salairesImputes)} />
          </ul>
        </BaseCard>

        {/* Card 2 — Avancement */}
        <BaseCard loading={loading} label="Avancement · YTD">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Réalisation objectif YTD
            </p>
            <p className="mt-1 text-3xl font-semibold text-foreground">
              {(pctRealisationYTD * 100).toFixed(0)}%
            </p>
            <div className="mt-2 h-0.5 w-full rounded bg-border overflow-hidden">
              <div
                className={pctRealisationYTD >= 1 ? "bg-accent h-full" : "bg-destructive h-full"}
                style={{ width: `${Math.min(pctRealisationYTD * 100, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>CA réel YTD : {fmtEUR(caTotal)}</span>
              <span>Objectif : {fmtEUR(caObjectifYTD)}</span>
            </div>
          </div>
          <hr className="my-3 border-border" />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Position dans l'année
            </p>
            <p className={cn("mt-1 text-3xl font-semibold", signClass(ecartPosition))}>
              {(ecartPosition * 100 >= 0 ? "+" : "")}
              {(ecartPosition * 100).toFixed(0)}%
            </p>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>% année écoulée : {(pctAnneeEcoulee * 100).toFixed(0)}%</span>
              <span>% CA annuel réalisé : {(pctCaAnnuelRealise * 100).toFixed(0)}%</span>
            </div>
          </div>
        </BaseCard>

        {/* Card 3 — Pipeline */}
        <BaseCard loading={loading} label="Pipeline · Global">
          <p className="text-3xl font-semibold" style={{ color: C_ACCENT }}>
            {fmtEUR(pipeRetenuTotal)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Optimiste + pondéré (taux appliqués)
          </p>
          <ul className="mt-4 space-y-1.5 text-sm">
            <DetailRow label="Pipe optimiste" value={fmtEUR(pipeOptTotal)} />
            <SubDetail label="brut (Confirmé)" value={fmtEUR(pipeBrutTotal)} />
            <DetailRow label="Pipe pondéré" value={fmtEUR(pipePonTotal)} />
          </ul>
        </BaseCard>
      </section>

      {/* BLOC 2 — Capacité d'investissement pleine largeur */}
      <section>
        <div className="rounded-lg border border-border bg-surface p-6">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <CapaciteCard
              caTotal={caTotal}
              caObjectifYTD={caObjectifYTD}
              surplus={surplus}
              surplusPondere={surplusPondere}
              pctAnneeEcoulee={pctAnneeEcoulee}
              caPondere={caPondere}
              chargesYTD={chargesYTD}
              resPondere={resPondere}
              reserve={reserve}
              montantReserve={montantReserve}
              indicateur2={indicateur2}
            />
          )}
        </div>
      </section>

      {/* BLOC 3 — Pôles Audio / Vidéo */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <PoleCard
          loading={loading}
          color={C_AUDIO}
          label="Pôle Audio · YTD"
          enveloppe={enveloppeAudio}
          ca={caAudio}
          chargesTotal={chargesTotalAudio}
          chargesReelles={chargesAudioTotal}
          provisions={chargesProvRestantes * pctAudio}
          salaires={salairesAudio}
          pipeOpt={pipeOptAudio}
          pipePon={pipePonAudio}
          pipeRetenu={pipeRetenuAudio}
        />
        <PoleCard
          loading={loading}
          color={C_VIDEO}
          label="Pôle Vidéo · YTD"
          enveloppe={enveloppeVideo}
          ca={caVideo}
          chargesTotal={chargesTotalVideo}
          chargesReelles={chargesVideoTotal}
          provisions={chargesProvRestantes * pctVideo}
          salaires={salairesVideo}
          pipeOpt={pipeOptVideo}
          pipePon={pipePonVideo}
          pipeRetenu={pipeRetenuVideo}
        />
      </section>

      {/* BLOC 4 — Projection + graphiques */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.4fr_1.4fr]">
        <BaseCard loading={loading} label="Projection fin d'année">
          <p className="text-3xl font-semibold text-foreground">{fmtEUR(caProjecte)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            CA réel YTD + objectifs mois restants
          </p>
          <ul className="mt-4 space-y-1.5 text-sm">
            <DetailRow label="CA réel YTD" value={fmtEUR(caTotal)} />
            <DetailRow label="+ Objectifs mois restants" value={fmtEUR(objectifsMoisRestants)} />
          </ul>
          <hr className="my-3 border-border" />
          <ul className="space-y-1.5 text-sm">
            <DetailRow label="Objectif annuel" value={fmtEUR(caObjectifGlobal)} />
            <DetailRow
              label="Écart projeté"
              value={fmtEUR(ecartProjecte)}
              valueClass={signClass(ecartProjecte)}
            />
            <DetailRow
              label="% réalisation projeté"
              value={`${(pctRealisationAnnuelProjecte * 100).toFixed(0)}%`}
              valueClass={signClass(pctRealisationAnnuelProjecte - 1)}
            />
          </ul>
          <hr className="my-3 border-border" />
          <p className="text-xs italic text-muted-foreground">
            Pipe attendu : {fmtEUR(pipeRetenuTotal)} — pour info, non intégré au calcul
          </p>
        </BaseCard>

        <DashboardCharts
          scope={graphScope}
          revenus={revenus}
          chargesReelles={chargesReelles}
          objectifs={objectifs}
          pctAudio={pctAudio}
          pctVideo={pctVideo}
          toggleNode={
            <div className="flex gap-1">
              {(["Global", "Audio", "Vidéo"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setGraphScope(s)}
                  className={cn(
                    "rounded border px-2 py-0.5 text-[11px] transition-colors",
                    graphScope === s
                      ? "border-border bg-muted text-foreground"
                      : "border-border/40 bg-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          }
        />
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────

function BaseCard({
  loading,
  label,
  children,
}: {
  loading: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <div className="mt-2">{children}</div>
        </>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums text-foreground", valueClass)}>{value}</span>
    </li>
  );
}

function SubDetail({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between text-xs italic text-muted-foreground pl-3">
      <span>↳ {label}</span>
      <span className="tabular-nums">{value}</span>
    </li>
  );
}

function PoleCard({
  loading,
  color,
  label,
  enveloppe,
  ca,
  chargesTotal,
  chargesReelles,
  provisions,
  salaires,
  pipeOpt,
  pipePon,
  pipeRetenu,
}: {
  loading: boolean;
  color: string;
  label: string;
  enveloppe: number;
  ca: number;
  chargesTotal: number;
  chargesReelles: number;
  provisions: number;
  salaires: number;
  pipeOpt: number;
  pipePon: number;
  pipeRetenu: number;
}) {
  const solde = ca - chargesTotal;
  return (
    <div
      className="rounded-r-lg border border-border bg-surface p-5"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <p className="text-xs uppercase tracking-wide" style={{ color }}>
            {label}
          </p>
          <p className={cn("mt-2 text-3xl font-semibold", signClass(enveloppe))}>
            {fmtEUR(enveloppe)}
          </p>
          <ul className="mt-4 space-y-1.5 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">CA réel</span>
              <span className="font-medium tabular-nums" style={{ color }}>
                {fmtEUR(ca)}
              </span>
            </li>
            <DetailRow label="Charges totales" value={fmtEUR(chargesTotal)} />
            <SubDetail label="dont réelles" value={fmtEUR(chargesReelles)} />
            <SubDetail label="dont provisions" value={fmtEUR(provisions)} />
            <SubDetail label="dont salaires" value={fmtEUR(salaires)} />
            <DetailRow
              label="Solde réel"
              value={fmtEUR(solde)}
              valueClass={signClass(solde)}
            />
          </ul>
          <hr className="my-3 border-border" />
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">Pipe retenu</span>
              <span className="font-medium tabular-nums" style={{ color }}>
                {fmtEUR(pipeRetenu)}
              </span>
            </li>
            <SubDetail label="Optimiste" value={fmtEUR(pipeOpt)} />
            <SubDetail label="Pondéré" value={fmtEUR(pipePon)} />
          </ul>
        </>
      )}
    </div>
  );
}

// ── Capacité card ─────────────────────────────────────────────────────────
function CalcLine({
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
      ? "var(--color-foreground)"
      : semantic >= 0
        ? "var(--color-positive)"
        : "var(--color-destructive)";
  return (
    <div
      className={cn(
        "grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 px-2 py-1 text-sm",
        bold && "font-semibold",
      )}
    >
      <span className="font-mono text-muted-foreground">{op}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}

function CapaciteCard({
  caTotal,
  caObjectifYTD,
  surplus,
  surplusPondere,
  pctAnneeEcoulee,
  caPondere,
  chargesYTD,
  resPondere,
  reserve,
  montantReserve,
  indicateur2,
}: {
  caTotal: number;
  caObjectifYTD: number;
  surplus: number;
  surplusPondere: number;
  pctAnneeEcoulee: number;
  caPondere: number;
  chargesYTD: number;
  resPondere: number;
  reserve: number;
  montantReserve: number;
  indicateur2: number;
}) {
  const pctLabel = `${(pctAnneeEcoulee * 100).toFixed(0)}%`;
  const reservePctLabel = `${(reserve * 100).toFixed(0)}%`;
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            💡 Enveloppe globale · Capacité d'investissement
          </p>
          <p className={cn("mt-2 text-4xl font-semibold", signClass(indicateur2))}>
            {fmtEUR(indicateur2)}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          % année écoulée
          <div className="text-base font-semibold text-foreground">{pctLabel}</div>
        </div>
      </div>
      <hr className="my-4 border-border" />
      <div className="grid grid-cols-1 gap-0 md:grid-cols-3">
        {/* Colonne 1 — Surplus */}
        <div className="px-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            1 · Surplus
          </p>
          <CalcLine op="" label="CA réel YTD" value={fmtEUR(caTotal)} />
          <CalcLine op="−" label="Objectif YTD" value={fmtEUR(caObjectifYTD)} />
          <CalcLine op="=" label="Surplus" value={fmtEUR(surplus)} semantic={surplus} />
          <p className="mt-2 px-2 text-xs italic text-muted-foreground">
            {surplus >= 0
              ? `Surplus × ${pctLabel} = surplus pondéré ${fmtEUR(surplusPondere)}`
              : `Surplus < 0 · pas de pondération`}
          </p>
        </div>

        {/* Colonne 2 — Résultat pondéré */}
        <div className="border-l border-border px-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            2 · Résultat pondéré
          </p>
          {surplus >= 0 ? (
            <>
              <CalcLine op="" label="Objectif YTD" value={fmtEUR(caObjectifYTD)} />
              <CalcLine op="+" label="Surplus pondéré" value={fmtEUR(surplusPondere)} />
              <CalcLine op="=" label="CA pondéré" value={fmtEUR(caPondere)} />
              <CalcLine op="−" label="Charges YTD" value={fmtEUR(chargesYTD)} />
              <CalcLine op="=" label="Résultat" value={fmtEUR(resPondere)} semantic={resPondere} />
            </>
          ) : (
            <>
              <CalcLine op="" label="CA réel YTD" value={fmtEUR(caTotal)} />
              <CalcLine op="−" label="Charges YTD" value={fmtEUR(chargesYTD)} />
              <CalcLine op="=" label="Résultat" value={fmtEUR(resPondere)} semantic={resPondere} />
            </>
          )}
          {resPondere < 0 && (
            <p className="mt-2 px-2 text-xs italic text-muted-foreground">
              Résultat &lt; 0 · réserve non appliquée
            </p>
          )}
        </div>

        {/* Colonne 3 — Capacité */}
        <div className="border-l border-border px-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            3 · Capacité
          </p>
          <CalcLine op="" label="Résultat pondéré" value={fmtEUR(resPondere)} />
          <CalcLine
            op="−"
            label={`Réserve (${reservePctLabel})`}
            value={resPondere > 0 ? fmtEUR(montantReserve) : "N/A"}
          />
          <CalcLine
            op="="
            label="Capacité"
            value={fmtEUR(indicateur2)}
            semantic={indicateur2}
            bold
          />
        </div>
      </div>
    </>
  );
}

