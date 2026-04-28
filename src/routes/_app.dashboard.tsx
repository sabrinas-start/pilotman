import { createFileRoute } from "@tanstack/react-router";
import { useAirtable, type AirtableRecord } from "@/hooks/useAirtable";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — Pôle Tournage" }] }),
  component: DashboardPage,
});

const ANNEE = 2026;

const fmtEUR = (n: number | null | undefined) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return (
    v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €"
  );
};

const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function signClass(n: number) {
  return n >= 0 ? "text-positive" : "text-destructive";
}

function DashboardPage() {
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

  const loading =
    metriquesQ.loading ||
    objectifsQ.loading ||
    chargesReellesQ.loading ||
    chargesProvQ.loading ||
    revenusQ.loading;

  const errors = [
    metriquesQ.error && { label: "Métriques", error: metriquesQ.error },
    objectifsQ.error && { label: "Objectifs", error: objectifsQ.error },
    chargesReellesQ.error && { label: "Charges réelles", error: chargesReellesQ.error },
    chargesProvQ.error && { label: "Charges provisionnées", error: chargesProvQ.error },
    revenusQ.error && { label: "Revenus", error: revenusQ.error },
  ].filter(Boolean) as { label: string; error: Error }[];

  const metriques = (metriquesQ.data?.[0]?.fields ?? {}) as Record<string, unknown>;
  const objectifs = (objectifsQ.data?.[0]?.fields ?? {}) as Record<string, unknown>;
  const chargesReelles: AirtableRecord[] = chargesReellesQ.data ?? [];
  const chargesProv: AirtableRecord[] = chargesProvQ.data ?? [];

  // ── Calculs ──────────────────────────────────────────────────────────────
  const moisCourant = new Date().getMonth() + 1;
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

  const chargesProvRestantes = chargesProv
    .filter((r) => num(r.fields.mois) <= moisCourant)
    .reduce((s, r) => s + num(r.fields.montant_provisionne), 0);

  // Indicateur 1
  const caAudio = num(metriques.ca_reel_audio);
  const caVideo = num(metriques.ca_reel_video);
  const caPole = num(metriques.ca_reel_pole);
  const caTotal = num(metriques.ca_reel_total);

  const resT = caTotal - chargesReelTotal;
  const resA = caAudio - chargesAudioTotal;
  const resV = caVideo - chargesVideoTotal;

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

  // Indicateur 2
  const saisonFields = Array.from({ length: moisCourant }, (_, i) =>
    `saisonnalite_audio_${String(i + 1).padStart(2, "0")}`,
  );
  const pctAnneeEcoulee = saisonFields.reduce((s, f) => s + num(objectifs[f]), 0);

  const caObjectifGlobal = num(objectifs.ca_objectif_global);
  const caObjectifYTD = caObjectifGlobal * pctAnneeEcoulee;
  const surplus = caTotal - caObjectifYTD;

  const caPondere =
    surplus >= 0 ? caObjectifYTD + surplus * pctAnneeEcoulee : caTotal;

  const chargesYTD = chargesReelTotal + chargesProvRestantes;
  const resPondere = caPondere - chargesYTD;

  const reserveRaw = num(objectifs.reserve_securite);
  const reserve = reserveRaw > 0 ? reserveRaw : 0.2;
  const indicateur2 = resPondere > 0 ? resPondere * (1 - reserve) : resPondere;
  const montantReserve = resPondere > 0 ? resPondere * reserve : 0;

  // CA pipe brut
  const caPipeBrutTotal = num(metriques.ca_pipe_brut_total);
  const caPipeBrutAudio = num(metriques.ca_pipe_brut_audio);
  const caPipeBrutVideo = num(metriques.ca_pipe_brut_video);

  const dateSnapshot = str(metriques.date_snapshot) || "—";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* En-tête */}
      <header className="border-b border-border pb-6">
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

      {/* Section 2 — Métriques CA */}
      <section className="grid grid-cols-1 gap-4 border-b border-border pb-8 md:grid-cols-3">
        <MetricCard
          loading={loading}
          title="CA Réel YTD"
          value={fmtEUR(caTotal)}
          lines={[
            { label: "Audio", value: fmtEUR(caAudio), pole: "audio" },
            { label: "Vidéo", value: fmtEUR(caVideo), pole: "video" },
            { label: "Pôle", value: fmtEUR(caPole) },
          ]}
        />
        <MetricCard
          loading={loading}
          title="CA Pipe brut"
          value={fmtEUR(caPipeBrutTotal)}
          lines={[
            { label: "Audio", value: fmtEUR(caPipeBrutAudio), pole: "audio" },
            { label: "Vidéo", value: fmtEUR(caPipeBrutVideo), pole: "video" },
          ]}
        />
        <MetricCard
          loading={loading}
          title="Charges réelles YTD"
          value={fmtEUR(chargesReelTotal)}
          lines={[
            { label: "Audio", value: fmtEUR(chargesAudioTotal), pole: "audio" },
            { label: "Vidéo", value: fmtEUR(chargesVideoTotal), pole: "video" },
          ]}
        />
      </section>

      {/* Section 3 — Indicateur 1 */}
      <section className="grid grid-cols-1 gap-4 border-b border-border pb-8 md:grid-cols-2">
        <EnvelopeCard
          loading={loading}
          icon="🎙"
          title="Enveloppe Audio"
          value={enveloppeAudio}
          ca={caAudio}
          charges={chargesAudioTotal}
          pole="audio"
        />
        <EnvelopeCard
          loading={loading}
          icon="🎬"
          title="Enveloppe Vidéo"
          value={enveloppeVideo}
          ca={caVideo}
          charges={chargesVideoTotal}
          pole="video"
        />
      </section>

      {/* Section 4 — Indicateur 2 */}
      <section>
        <div className="rounded-lg border border-border bg-surface p-6">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <CapaciteCard
              caTotal={caTotal}
              caObjectifYTD={caObjectifYTD}
              surplus={surplus}
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
    </div>
  );
}

type Pole = "audio" | "video";

const poleStyle = (p?: Pole) =>
  p === "audio"
    ? { backgroundColor: "var(--pole-audio-bg)", color: "var(--pole-audio-text)" }
    : p === "video"
    ? { backgroundColor: "var(--pole-video-bg)", color: "var(--pole-video-text)" }
    : undefined;

const poleTextColor = (p?: Pole) =>
  p === "audio" ? "var(--pole-audio-text)" : p === "video" ? "var(--pole-video-text)" : undefined;

function MetricCard({
  loading,
  title,
  value,
  lines,
}: {
  loading: boolean;
  title: string;
  value: string;
  lines: { label: string; value: string; pole?: Pole }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          <ul className="mt-4 space-y-1">
            {lines.map((l) => (
              <li
                key={l.label}
                className="flex items-center justify-between rounded px-2 py-1 text-sm"
                style={
                  l.pole
                    ? poleStyle(l.pole)
                    : { color: "var(--color-muted-foreground)" }
                }
              >
                <span>{l.label}</span>
                <span
                  className="font-medium"
                  style={l.pole ? { color: poleTextColor(l.pole) } : { color: "var(--color-foreground)" }}
                >
                  {l.value}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function EnvelopeCard({
  loading,
  icon,
  title,
  value,
  ca,
  charges,
  pole,
}: {
  loading: boolean;
  icon: string;
  title: string;
  value: number;
  ca: number;
  charges: number;
  pole: Pole;
}) {
  return (
    <div
      className="rounded-lg border border-border p-6"
      style={{ backgroundColor: pole === "audio" ? "var(--pole-audio-bg)" : "var(--pole-video-bg)" }}
    >
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <h3 className="text-sm font-medium" style={{ color: poleTextColor(pole) }}>
            {icon} {title}
          </h3>
          <p className={cn("mt-2 text-3xl font-semibold", signClass(value))}>
            {fmtEUR(value)}
          </p>
          <dl className="mt-6 space-y-2 text-sm">
            <DetailLine label="CA réel" value={fmtEUR(ca)} />
            <DetailLine label="Charges" value={fmtEUR(charges)} />
          </dl>
        </>
      )}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
