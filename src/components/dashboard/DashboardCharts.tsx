import { useMemo } from "react";
import {
  LineChart,
  Line,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import type { AirtableRecord } from "@/hooks/useAirtable";

const MOIS_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const AXIS_COLOR = "#888888";
const AXIS_FONT_SIZE = 11;
const GRID_COLOR = "#2e2e2e";
const COLOR_REEL = "#E8C547";
const COLOR_OBJ = "#555555";
const COLOR_POSITIVE = "#4CAF7D";
const COLOR_NEGATIVE = "#E05252";

const fmtEUR = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";

const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

interface Props {
  scope: "Global" | "Audio" | "Vidéo";
  revenus: AirtableRecord[];
  chargesReelles: AirtableRecord[];
  chargesProv: AirtableRecord[];
  salariesMois: AirtableRecord[];
  objectifs: Record<string, unknown>;
  pctAudio: number;
  pctVideo: number;
  toggleNode?: React.ReactNode;
}

export function DashboardCharts({
  scope,
  revenus,
  chargesReelles,
  chargesProv,
  salariesMois,
  objectifs,
  pctAudio,
  pctVideo,
  toggleNode,
}: Props) {
  const moisCourantIdx = new Date().getMonth();

  const caVsObjData = useMemo(() => {
    const annuel = num(objectifs.ca_objectif_global);
    const reelByMonth = new Array(12).fill(0) as number[];

    for (const r of revenus) {
      if (str(r.fields.statut_rentman) !== "Retour") continue;
      const dateStr = str(r.fields.date_facturation);
      if (!dateStr) continue;
      const d = new Date(dateStr);
      if (d.getFullYear() !== 2026) continue;
      const m = d.getMonth();
      if (scope === "Audio") reelByMonth[m] += num(r.fields.ca_audio);
      else if (scope === "Vidéo") reelByMonth[m] += num(r.fields.ca_video);
      else reelByMonth[m] += num(r.fields.ca_montant_ht);
    }

    return MOIS_LABELS.map((label, i) => {
      const saisonKey = `saisonnalite_audio_${String(i + 1).padStart(2, "0")}`;
      const part = num(objectifs[saisonKey]);
      const objScope =
        scope === "Audio"
          ? num(objectifs.ca_objectif_audio)
          : scope === "Vidéo"
            ? num(objectifs.ca_objectif_video)
            : annuel;
      return { mois: label, reel: reelByMonth[i], objectif: objScope * part };
    });
  }, [revenus, objectifs, scope]);

  const cumulData = useMemo(() => {
    const reelByMonth = new Array(12).fill(0) as number[];
    const chargesByMonth = new Array(12).fill(0) as number[];

    for (const r of revenus) {
      if (str(r.fields.statut_rentman) !== "Retour") continue;
      const dateStr = str(r.fields.date_facturation);
      if (!dateStr) continue;
      const d = new Date(dateStr);
      if (d.getFullYear() !== 2026) continue;
      const m = d.getMonth();
      if (scope === "Audio") reelByMonth[m] += num(r.fields.ca_audio);
      else if (scope === "Vidéo") reelByMonth[m] += num(r.fields.ca_video);
      else reelByMonth[m] += num(r.fields.ca_montant_ht);
    }

    for (const r of chargesReelles) {
      const mois = num(r.fields.mois);
      const annee = num(r.fields.annee);
      if (annee !== 2026) continue;
      const m = mois - 1;
      if (m < 0 || m > 11) continue;
      const cat = str(r.fields.categorie);
      const montant = num(r.fields.montant_impute_ht);
      const isAudio = cat.startsWith("Tournage Son");
      const isVideo = cat.startsWith("Tournage Image");
      const isCommune = !isAudio && !isVideo;

      if (scope === "Audio") {
        chargesByMonth[m] += isAudio ? montant : isCommune ? montant * pctAudio : 0;
      } else if (scope === "Vidéo") {
        chargesByMonth[m] += isVideo ? montant : isCommune ? montant * pctVideo : 0;
      } else {
        chargesByMonth[m] += montant;
      }
    }

    for (const r of chargesProv) {
      const mois = num(r.fields.mois);
      const annee = num(r.fields.annee);
      if (annee !== 2026 || mois > moisCourantIdx + 1) continue;
      const m = mois - 1;
      if (m < 0 || m > 11) continue;
      const montant = num(r.fields.montant_provisionne);
      if (scope === "Audio") chargesByMonth[m] += montant * pctAudio;
      else if (scope === "Vidéo") chargesByMonth[m] += montant * pctVideo;
      else chargesByMonth[m] += montant;
    }

    for (const r of salariesMois) {
      const mois = num(r.fields.mois);
      const annee = num(r.fields.annee);
      if (annee !== 2026 || mois > moisCourantIdx + 1) continue;
      const m = mois - 1;
      if (m < 0 || m > 11) continue;
      const montant = num(r.fields.montant_impute);
      if (scope === "Audio") chargesByMonth[m] += montant * pctAudio;
      else if (scope === "Vidéo") chargesByMonth[m] += montant * pctVideo;
      else chargesByMonth[m] += montant;
    }

    let cumulReel = 0;
    let cumulCharges = 0;
    const realPoints: { revenus: number; charges: number }[] = [];

    for (let i = 0; i <= moisCourantIdx; i++) {
      cumulReel += reelByMonth[i];
      cumulCharges += chargesByMonth[i];
      realPoints.push({ revenus: cumulReel, charges: cumulCharges });
    }

    const annuel = num(objectifs.ca_objectif_global);
    const objScope =
      scope === "Audio" ? num(objectifs.ca_objectif_audio)
      : scope === "Vidéo" ? num(objectifs.ca_objectif_video)
      : annuel;
    const moisEcoules = moisCourantIdx + 1;
    const chargesParMoisMoyen = moisEcoules > 0 ? cumulCharges / moisEcoules : 0;

    let cumulRevProj = cumulReel;
    let cumulChargesProj = cumulCharges;

    return MOIS_LABELS.map((label, i) => {
      const saisonKey = `saisonnalite_audio_${String(i + 1).padStart(2, "0")}`;
      const part = num(objectifs[saisonKey]);
      if (i > moisCourantIdx) {
        cumulRevProj += objScope * part;
        cumulChargesProj += chargesParMoisMoyen;
      }
      const real = i <= moisCourantIdx ? realPoints[i] : null;
      return {
        mois: label,
        revenus: real ? real.revenus : null,
        charges: real ? real.charges : null,
        solde: real ? real.revenus - real.charges : null,
        revenusProj: i >= moisCourantIdx ? (i === moisCourantIdx ? cumulReel : cumulRevProj) : null,
        chargesProj: i >= moisCourantIdx ? (i === moisCourantIdx ? cumulCharges : cumulChargesProj) : null,
        soldeProj: i >= moisCourantIdx ? (i === moisCourantIdx ? cumulReel - cumulCharges : cumulRevProj - cumulChargesProj) : null,
      };
    });
  }, [revenus, chargesReelles, chargesProv, salariesMois, scope, pctAudio, pctVideo, moisCourantIdx, objectifs]);

  const tooltipContentStyle = {
    background: "#1f1f1f",
    border: "0.5px solid #2e2e2e",
    borderRadius: 8,
    fontSize: 12,
  };
  const tooltipLabelStyle = { color: "#F0F0F0" };

  const chartCard = (label: string, children: React.ReactNode) => (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {toggleNode}
      </div>
      <div className="mt-3 h-64">{children}</div>
    </div>
  );

  return (
    <>
      {chartCard(
        "CA réel vs objectif mensuel",
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={caVsObjData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mois" stroke={AXIS_COLOR} tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }} />
            <YAxis
              stroke={AXIS_COLOR}
              tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
            />
            <Tooltip
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              formatter={(value: number, name: string) => [
                fmtEUR(value),
                name === "reel" ? "CA réel" : "Objectif",
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: AXIS_COLOR }}
              formatter={(v) => (v === "reel" ? "CA réel" : "Objectif")}
            />
            <Bar dataKey="objectif" fill={COLOR_OBJ} radius={[2, 2, 0, 0]} />
            <Bar dataKey="reel" fill={COLOR_REEL} radius={[2, 2, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>,
      )}
      {chartCard(
        "Revenus cumulés vs charges cumulées",
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={cumulData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mois" stroke={AXIS_COLOR} tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }} />
            <YAxis
              stroke={AXIS_COLOR}
              tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }}
              tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
            />
            <Tooltip
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              formatter={(value: number, name: string) => [
                fmtEUR(value),
                name === "revenus"
                  ? "Revenus cumulés"
                  : name === "charges"
                    ? "Charges cumulées"
                    : "Solde",
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: AXIS_COLOR }}
              formatter={(v) =>
                v === "revenus" ? "Revenus cumulés" : v === "charges" ? "Charges cumulées" : "Solde"
              }
            />
            <ReferenceLine y={0} stroke={GRID_COLOR} />
            <Line
              type="monotone"
              dataKey="revenus"
              stroke={COLOR_POSITIVE}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="charges"
              stroke={COLOR_NEGATIVE}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="solde"
              stroke={COLOR_REEL}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              connectNulls={false}
            />
            <Line type="monotone" dataKey="revenusProj" stroke={COLOR_POSITIVE} strokeWidth={2} strokeDasharray="2 4" strokeOpacity={0.55} dot={false} connectNulls={false} legendType="none" />
            <Line type="monotone" dataKey="chargesProj" stroke={COLOR_NEGATIVE} strokeWidth={2} strokeDasharray="2 4" strokeOpacity={0.55} dot={false} connectNulls={false} legendType="none" />
            <Line type="monotone" dataKey="soldeProj" stroke={COLOR_REEL} strokeWidth={2} strokeDasharray="2 4" strokeOpacity={0.55} dot={false} connectNulls={false} legendType="none" />
          </LineChart>
        </ResponsiveContainer>,
      )}
    </>
  );
}
