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
            { label: "Audio", value: fmtEUR(caAudio) },
            { label: "Vidéo", value: fmtEUR(caVideo) },
            { label: "Pôle", value: fmtEUR(caPole) },
          ]}
        />
        <MetricCard
          loading={loading}
          title="CA Pipe brut"
          value={fmtEUR(caPipeBrutTotal)}
          lines={[
            { label: "Audio", value: fmtEUR(caPipeBrutAudio) },
            { label: "Vidéo", value: fmtEUR(caPipeBrutVideo) },
          ]}
        />
        <MetricCard
          loading={loading}
          title="Charges réelles YTD"
          value={fmtEUR(chargesReelTotal)}
          lines={[
            { label: "Audio", value: fmtEUR(chargesAudioTotal) },
            { label: "Vidéo", value: fmtEUR(chargesVideoTotal) },
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
        />
        <EnvelopeCard
          loading={loading}
          icon="🎬"
          title="Enveloppe Vidéo"
          value={enveloppeVideo}
          ca={caVideo}
          charges={chargesVideoTotal}
        />
      </section>

      {/* Section 4 — Indicateur 2 */}
      <section>
        <div className="rounded-lg border border-border bg-surface p-6">
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <h3 className="text-sm font-medium text-muted-foreground">
                💡 Capacité d'investissement · Pôle Tournage
              </h3>
              <p className={cn("mt-2 text-4xl font-semibold", signClass(indicateur2))}>
                {fmtEUR(indicateur2)}
              </p>
              <dl className="mt-6 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                <DetailLine label="Résultat pondéré" value={fmtEUR(resPondere)} />
                <DetailLine
                  label="Réserve de sécurité (20%)"
                  value={montantReserve > 0 ? `-${fmtEUR(montantReserve)}` : fmtEUR(0)}
                />
                <DetailLine
                  label="% année écoulée"
                  value={`${(pctAnneeEcoulee * 100).toLocaleString("fr-FR", {
                    maximumFractionDigits: 1,
                  })} %`}
                />
                <DetailLine
                  label="Charges YTD (réel + prov.)"
                  value={fmtEUR(chargesYTD)}
                />
              </dl>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  loading,
  title,
  value,
  lines,
}: {
  loading: boolean;
  title: string;
  value: string;
  lines: { label: string; value: string }[];
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
                className="flex items-center justify-between text-sm text-muted-foreground"
              >
                <span>{l.label}</span>
                <span className="font-medium text-foreground">{l.value}</span>
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
}: {
  loading: boolean;
  icon: string;
  title: string;
  value: number;
  ca: number;
  charges: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <h3 className="text-sm font-medium text-muted-foreground">
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
