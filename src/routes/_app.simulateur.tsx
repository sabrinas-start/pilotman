import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { useAirtable, type AirtableRecord } from "@/hooks/useAirtable";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { RotateCcw, ChevronDown, Trash2, Plus } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export const Route = createFileRoute("/_app/simulateur")({
  head: () => ({ meta: [{ title: "Simulateur — Pôle Tournage" }] }),
  component: () => (
    <ProtectedRoute allowed={["admin"]}>
      <SimulateurPage />
    </ProtectedRoute>
  ),
});

const ANNEE = 2026;

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

type Pole = "audio" | "video";
type ChargePole = "global" | "audio" | "video";
type SimCharge = { id: string; label: string; montant: number; pole: ChargePole };
type Scope = "global" | "audio" | "video";

const C_POS = "#4CAF7D";
const C_NEG = "#E05252";
const C_ACCENT = "#E8C547";

type KpisParams = {
  caObjAudio: number;
  caObjVideo: number;
  pctAudio: number;         // 0-100
  reserve: number;          // 0-100
  plancherAudio: number;
  plafondAudio: number;
  plancherVideo: number;
  plafondVideo: number;
  tauxOption: number;       // 0-100
  tauxConfirme: number;     // 0-100
  saisonAudio: number[];    // chaque valeur en 0-100
  saisonVideo: number[];
  anneBlanche: boolean;
  caReelAudio: number;
  caReelVideo: number;
  caReelTotal: number;
  chargesAudioTotal: number;
  chargesVideoTotal: number;
  chargesTotal: number;
  moisCourant: number;
  scope: Scope;
};

function calculerKpis(p: KpisParams) {
  const caObjGlobal = p.caObjAudio + p.caObjVideo;
  const reserveDecimal = p.reserve / 100;
  const pctAnneeEcoulee = p.saisonAudio
    .slice(0, p.moisCourant)
    .reduce((s, v) => s + v / 100, 0);

  // Capacité — calcul standard ou simplifié
  let capacite: {
    audio: number;
    video: number;
    global: number;
    mode: "normal" | "blanche";
  };
  if (p.anneBlanche) {
    const calc = (caObj: number, charges: number) =>
      caObj - charges - caObj * reserveDecimal;
    const audio = calc(p.caObjAudio, p.chargesAudioTotal);
    const video = calc(p.caObjVideo, p.chargesVideoTotal);
    const global = calc(caObjGlobal, p.chargesTotal);
    capacite = { audio, video, global, mode: "blanche" as const };
  } else {
    const calcPole = (caR: number, caObj: number, ch: number) => {
      const objYTD = caObj * pctAnneeEcoulee;
      const surplus = caR - objYTD;
      const caPond = surplus >= 0 ? objYTD + surplus * pctAnneeEcoulee : caR;
      const resP = caPond - ch;
      return resP > 0 ? resP * (1 - reserveDecimal) : resP;
    };
    capacite = {
      audio: calcPole(p.caReelAudio, p.caObjAudio, p.chargesAudioTotal),
      video: calcPole(p.caReelVideo, p.caObjVideo, p.chargesVideoTotal),
      global: calcPole(p.caReelTotal, caObjGlobal, p.chargesTotal),
      mode: "normal" as const,
    };
  }

  // Détail capacité scope sélectionné
  const caR =
    p.scope === "audio" ? p.caReelAudio : p.scope === "video" ? p.caReelVideo : p.caReelTotal;
  const caObj =
    p.scope === "audio" ? p.caObjAudio : p.scope === "video" ? p.caObjVideo : caObjGlobal;
  const ch =
    p.scope === "audio" ? p.chargesAudioTotal : p.scope === "video" ? p.chargesVideoTotal : p.chargesTotal;
  const objYTD = caObj * pctAnneeEcoulee;
  const surplus = caR - objYTD;
  const surplusPond = surplus * pctAnneeEcoulee;
  const caPond = surplus >= 0 ? objYTD + surplusPond : caR;
  const resPond = caPond - ch;
  const reserveMontant = resPond > 0 ? resPond * reserveDecimal : 0;
  const capDetail = { caR, caObj, ch, objYTD, surplus, surplusPond, caPond, resPond, reserveMontant };

  // Projection
  const restantA = p.saisonAudio.slice(p.moisCourant).reduce((s, v) => s + v / 100, 0);
  const projAudio = p.caReelAudio + p.caObjAudio * restantA;
  const restantV = p.saisonVideo.slice(p.moisCourant).reduce((s, v) => s + v / 100, 0);
  const projVideo = p.caReelVideo + p.caObjVideo * restantV;
  const projTotal = projAudio + projVideo;

  // Enveloppes
  const resT = p.caReelTotal - p.chargesTotal;
  const resA = p.caReelAudio - p.chargesAudioTotal;
  const resV = p.caReelVideo - p.chargesVideoTotal;
  const sommeAV = resA + resV;
  const partAudio = sommeAV > 0 ? Math.min(resA / sommeAV, 1) : 0.5;
  const partVideo = sommeAV > 0 ? Math.min(resV / sommeAV, 1) : 0.5;
  const maxAudio = p.plafondAudio > 0 ? p.plafondAudio : Infinity;
  const maxVideo = p.plafondVideo > 0 ? p.plafondVideo : Infinity;
  const enveloppeAudio =
    resT > 0 ? Math.min(Math.max(resT * partAudio, p.plancherAudio), maxAudio) : p.plancherAudio;
  const enveloppeVideo =
    resT > 0 ? Math.min(Math.max(resT * partVideo, p.plancherVideo), maxVideo) : p.plancherVideo;

  return {
    capacite, capDetail,
    projAudio, projVideo, projTotal,
    enveloppeAudio, enveloppeVideo,
    resT, resA, resV,
  };
}

function SimulateurPage() {
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
  const refCategoriesQ = useAirtable("tblf74zD8dSSlzDtN", {
    filterByFormula: `{est_fixe}=TRUE()`,
  });
  const salairesQ = useAirtable("tbl0bVuIyeIOXbjGH", {
    filterByFormula: `{annee}=${ANNEE}`,
  });

  const loading =
    metriquesQ.loading ||
    objectifsQ.loading ||
    chargesReellesQ.loading ||
    chargesProvQ.loading ||
    refCategoriesQ.loading ||
    salairesQ.loading;

  const metriques = (metriquesQ.data?.[0]?.fields ?? {}) as Record<string, unknown>;
  const record = objectifsQ.data?.[0];
  const objectifs = (record?.fields ?? {}) as Record<string, unknown>;
  const chargesReelles: AirtableRecord[] = chargesReellesQ.data ?? [];
  const chargesProv: AirtableRecord[] = chargesProvQ.data ?? [];
  const salaires: AirtableRecord[] = salairesQ.data ?? [];

  const real = useMemo(() => {
    const pendingProvKeys = new Set(
      chargesProv.map((r) => str(r.fields.cle_reconciliation)).filter(Boolean),
    );

    function cleReelle(r: AirtableRecord): string {
      const typeCharge = str(r.fields.type_charge);
      const categorie = str(r.fields.categorie);
      if (typeCharge === "Assurance") return categorie || typeCharge;
      if (typeCharge === "Frais locaux" && categorie === "Autres") return "Autres";
      return typeCharge;
    }

    const estReconciliee = (r: AirtableRecord) => {
      if (r.fields.est_fixe !== true) return true;
      const cle = cleReelle(r);
      const mois = num(r.fields.mois);
      const annee = num(r.fields.annee);
      return !pendingProvKeys.has(`${cle}_${mois}_${annee}`) && !pendingProvKeys.has(`${cle}_${annee}`);
    };
    const moisCourant = new Date().getMonth() + 1;
    const cha = chargesReelles
      .filter((r) => str(r.fields.categorie).startsWith("Tournage Son") && estReconciliee(r))
      .reduce((s, r) => s + num(r.fields.montant_impute_ht), 0);
    const chv = chargesReelles
      .filter((r) => str(r.fields.categorie).startsWith("Tournage Image") && estReconciliee(r))
      .reduce((s, r) => s + num(r.fields.montant_impute_ht), 0);
    const chReelTotalBrut = num(metriques.charges_reel_total);
    const reelFixeNonReconciliee = chargesReelles
      .filter((r) => r.fields.est_fixe === true && pendingProvKeys.has(str(r.fields.cle_reconciliation)))
      .reduce((s, r) => s + num(r.fields.montant_impute_ht), 0);
    const chReelTotal = chReelTotalBrut - reelFixeNonReconciliee;
    const chCom = chReelTotal - cha - chv;

    return {
      moisCourant,
      caAudio: num(metriques.ca_reel_audio),
      caVideo: num(metriques.ca_reel_video),
      caPole: num(metriques.ca_reel_pole),
      caTotal: num(metriques.ca_reel_total),
      chReelTotal,
      chargesAudio: cha,
      chargesVideo: chv,
      chargesCommunes: chCom,
      pctAudio: num(objectifs.pct_attribution_audio),
      pctVideo: num(objectifs.pct_attribution_video),
      caObjectifAudio: num(objectifs.ca_objectif_audio),
      caObjectifVideo: num(objectifs.ca_objectif_video),
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

  // ── State ─────────────────────────────────────────────────────────────
  const [anneBlanche, setAnneBlanche] = useState(false);
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
  const [simCharges, setSimCharges] = useState<SimCharge[]>([]);
  const [chargesFixesEdit, setChargesFixesEdit] =
    useState<Record<string, { montant: number; taux: number }>>({});
  const [openGroupes, setOpenGroupes] = useState<Record<string, boolean>>({});

  const [seasonOpen, setSeasonOpen] = useState(false);
  const [chargesFixesOpen, setChargesFixesOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("global");
  const [hydrated, setHydrated] = useState(false);
  const [fixesHydrated, setFixesHydrated] = useState(false);

  const reset = () => {
    setAnneBlanche(false);
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
    setSimCharges([]);
  };

  useEffect(() => {
    if (!hydrated && record?.id && metriquesQ.data) {
      reset();
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, record?.id, metriquesQ.data]);

  const handleReset = async () => {
    await Promise.all([
      objectifsQ.refetch(),
      metriquesQ.refetch(),
      chargesReellesQ.refetch(),
      chargesProvQ.refetch(),
      refCategoriesQ.refetch(),
      salairesQ.refetch(),
    ]);
    setHydrated(false);
    setFixesHydrated(false);
  };

  // ── Charges fixes par catégorie (source de chProv) ───────────────────
  type FixeRow = {
    id: string;
    categorie: string;
    type_charge: string;
    pole: "audio" | "video" | "global";
    montant: number;
    taux: number; // en %
  };
  const chargesFixesBase = useMemo<FixeRow[]>(() => {
    const refs = refCategoriesQ.data ?? [];
    const sommeParCle = new Map<string, number>();
    for (const r of chargesProv) {
      const cat = str(r.fields.categorie);
      const typ = str(r.fields.type_charge);
      const cle = cat || typ;
      if (!cle) continue;
      sommeParCle.set(cle, (sommeParCle.get(cle) ?? 0) + num(r.fields.montant_provisionne));
    }
    return refs.map((r) => {
      const categorie = str(r.fields.categorie);
      const type_charge = str(r.fields.type_charge);
      const tauxRaw = num(r.fields.taux_imputation_defaut);
      const taux = tauxRaw <= 1 ? tauxRaw * 100 : tauxRaw;
      const cle = categorie || type_charge;
      const montant = sommeParCle.get(cle) ?? 0;
      const pole: "audio" | "video" | "global" =
        categorie.includes("Tournage Son") ? "audio"
          : categorie.includes("Tournage Image") ? "video"
          : "global";
      return { id: r.id, categorie, type_charge, pole, montant, taux };
    });
  }, [refCategoriesQ.data, chargesProv]);

  const chargesFixesGroupes = useMemo(() => {
    const m = new Map<string, FixeRow[]>();
    for (const r of chargesFixesBase) {
      const arr = m.get(r.type_charge) ?? [];
      arr.push(r);
      m.set(r.type_charge, arr);
    }
    return Array.from(m.entries()).map(([type_charge, rows]) => ({ type_charge, rows }));
  }, [chargesFixesBase]);

  const resetChargesFixes = () => {
    const init: Record<string, { montant: number; taux: number }> = {};
    for (const r of chargesFixesBase) init[r.id] = { montant: r.montant, taux: r.taux };
    setChargesFixesEdit(init);
  };

  useEffect(() => {
    if (!fixesHydrated && refCategoriesQ.data && chargesProvQ.data && chargesFixesBase.length > 0) {
      resetChargesFixes();
      setFixesHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixesHydrated, refCategoriesQ.data, chargesProvQ.data, chargesFixesBase]);

  // ── Computed ──────────────────────────────────────────────────────────
  const caObjGlobal = caObjAudio + caObjVideo;
  const pctVideo = 100 - pctAudio;
  const reserveDecimal = reserve / 100;
  const pAudio = pctAudio / 100;
  const pVideo = pctVideo / 100;

  const totalSaisonAudio = saisonAudio.reduce((s, v) => s + v, 0);
  const totalSaisonVideo = saisonVideo.reduce((s, v) => s + v, 0);

  // CA réel (dépend de anneBlanche)
  const caReelAudio = anneBlanche ? 0 : real.caAudio;
  const caReelVideo = anneBlanche ? 0 : real.caVideo;
  const caReelTotal = anneBlanche ? 0 : real.caTotal;
  const caReelPole = anneBlanche ? 0 : real.caPole;

  // Charges réelles
  const chReelTotalEff = anneBlanche ? 0 : real.chReelTotal;
  const chReelAudioEff = anneBlanche ? 0 : real.chargesAudio + real.chargesCommunes * pAudio;
  const chReelVideoEff = anneBlanche ? 0 : real.chargesVideo + real.chargesCommunes * pVideo;

  // Provisions — source : tableau "Charges fixes par catégorie" (édité ou Airtable)
  const chProvAnnuel = useMemo(() => {
    return chargesFixesBase.reduce((s, r) => {
      const e = chargesFixesEdit[r.id];
      const montant = e?.montant ?? r.montant;
      const taux = e?.taux ?? r.taux;
      return s + montant * (taux / 100);
    }, 0);
  }, [chargesFixesBase, chargesFixesEdit]);
  const chProv = anneBlanche ? chProvAnnuel : chProvAnnuel * (real.moisCourant / 12);

  // Salaires
  const sumSal = useMemo(() => {
    const filtered = anneBlanche
      ? salaires
      : salaires.filter((r) => num(r.fields.mois) <= real.moisCourant);
    return filtered.reduce((s, r) => s + num(r.fields.montant_impute), 0);
  }, [salaires, anneBlanche, real.moisCourant]);

  // Charges simulées (somme + ventilation)
  const simChargesTotal = simCharges.reduce((s, c) => s + c.montant, 0);
  const simChargesAudio = simCharges.reduce(
    (s, c) =>
      s + (c.pole === "audio" ? c.montant : c.pole === "global" ? c.montant * pAudio : 0),
    0,
  );
  const simChargesVideo = simCharges.reduce(
    (s, c) =>
      s + (c.pole === "video" ? c.montant : c.pole === "global" ? c.montant * pVideo : 0),
    0,
  );

  // Charges totales
  const chargesTotal = chReelTotalEff + chProv + sumSal + simChargesTotal;
  const chargesAudioTotal = chReelAudioEff + chProv * pAudio + sumSal * pAudio + simChargesAudio;
  const chargesVideoTotal = chReelVideoEff + chProv * pVideo + sumSal * pVideo + simChargesVideo;

  // % année écoulée (toujours utilisé dans le rendu pour CalcRow)
  const pctAnneeEcoulee = saisonAudio
    .slice(0, real.moisCourant)
    .reduce((s, v) => s + v / 100, 0);

  // ── KPIs simulés (état utilisateur courant) ──────────────────────────
  const paramsSimule: KpisParams = {
    caObjAudio, caObjVideo, pctAudio, reserve,
    plancherAudio, plafondAudio, plancherVideo, plafondVideo,
    tauxOption, tauxConfirme, saisonAudio, saisonVideo,
    anneBlanche, caReelAudio, caReelVideo, caReelTotal,
    chargesAudioTotal, chargesVideoTotal, chargesTotal,
    moisCourant: real.moisCourant, scope,
  };
  const kpisSimule = calculerKpis(paramsSimule);

  // ── KPIs baseline (données Airtable d'origine, avant édition) ────────
  const paramsBaseline = useMemo<KpisParams>(() => {
    const pAudioBase = real.pctAudio;
    const pVideoBase = 1 - real.pctAudio;
    const chProvBase = chargesProv
      .filter((r) => num(r.fields.mois) <= real.moisCourant)
      .reduce((s, r) => s + num(r.fields.montant_provisionne), 0);
    const sumSalBase = salaires
      .filter((r) => num(r.fields.mois) <= real.moisCourant)
      .reduce((s, r) => s + num(r.fields.montant_impute), 0);
    const chargesTotalBase = real.chReelTotal + chProvBase + sumSalBase;
    const chargesAudioBase =
      real.chargesAudio + real.chargesCommunes * pAudioBase + chProvBase * pAudioBase + sumSalBase * pAudioBase;
    const chargesVideoBase =
      real.chargesVideo + real.chargesCommunes * pVideoBase + chProvBase * pVideoBase + sumSalBase * pVideoBase;
    return {
      caObjAudio: real.caObjectifAudio,
      caObjVideo: real.caObjectifVideo,
      pctAudio: real.pctAudio * 100,
      reserve: real.reserve * 100,
      plancherAudio: real.plancherAudio,
      plafondAudio: real.plafondAudio,
      plancherVideo: real.plancherVideo,
      plafondVideo: real.plafondVideo,
      tauxOption: real.tauxOption * 100,
      tauxConfirme: real.tauxConfirme * 100,
      saisonAudio: real.saisonAudio.map((v) => v * 100),
      saisonVideo: real.saisonVideo.map((v) => v * 100),
      anneBlanche: false,
      caReelAudio: real.caAudio,
      caReelVideo: real.caVideo,
      caReelTotal: real.caTotal,
      chargesAudioTotal: chargesAudioBase,
      chargesVideoTotal: chargesVideoBase,
      chargesTotal: chargesTotalBase,
      moisCourant: real.moisCourant,
      scope,
    };
  }, [real, chargesProv, salaires, scope]);
  const kpisBaseline = calculerKpis(paramsBaseline);
  void kpisBaseline; // calculé pour comparaison future, pas encore affiché

  // Destructurations — conservent les noms utilisés dans le rendu
  const { capacite, capDetail, projAudio, projVideo, projTotal,
          enveloppeAudio, enveloppeVideo, resT, resA, resV } = kpisSimule;
  void resT; void resA; void resV;

  // Données graphique
  const chartData = useMemo(() => {
    const moisIdx = real.moisCourant - 1; // 0-based dernier mois réel
    const sa = scope === "audio" ? saisonAudio : scope === "video" ? saisonVideo : saisonAudio;
    const caObjScope = scope === "audio" ? caObjAudio : scope === "video" ? caObjVideo : caObjGlobal;
    const caReelScope = scope === "audio" ? caReelAudio : scope === "video" ? caReelVideo : caReelTotal;
    const chargesScope = scope === "audio" ? chargesAudioTotal : scope === "video" ? chargesVideoTotal : chargesTotal;

    // Répartition charges YTD prorata sur mois écoulés (uniforme)
    const moisEcoules = anneBlanche ? 0 : real.moisCourant;
    const moisRestants = 12 - moisEcoules;

    let cumulRev = 0;
    let cumulCh = 0;
    // Revenus mensuels réels = caReel * (saison_i / sum_i<=current)
    const sumSaisonEcoulee = sa.slice(0, moisEcoules).reduce((s, v) => s + v / 100, 0) || 1;

    return MOIS.map((label, i) => {
      const mois1 = i + 1;
      const isReel = mois1 <= moisEcoules;
      const isProj = mois1 > moisEcoules;

      // Revenu du mois
      let revMois = 0;
      let chMois = 0;
      if (isReel) {
        revMois = caReelScope * (sa[i] / 100) / sumSaisonEcoulee;
        chMois = chargesScope / Math.max(moisEcoules, 1);
      } else {
        // projeté : objectif * saison
        revMois = caObjScope * (sa[i] / 100);
        // charges projetées : on étend la moyenne actuelle ou rien si année blanche
        if (anneBlanche) {
          chMois = chargesScope / 12;
        } else {
          chMois = (chargesScope / Math.max(moisEcoules, 1));
        }
      }
      cumulRev += revMois;
      cumulCh += chMois;

      return {
        mois: label,
        revenusReel: isReel ? cumulRev : null,
        chargesReel: isReel ? cumulCh : null,
        soldeReel: isReel ? cumulRev - cumulCh : null,
        revenusProj: isProj || mois1 === moisEcoules ? cumulRev : null,
        chargesProj: isProj || mois1 === moisEcoules ? cumulCh : null,
        soldeProj: isProj || mois1 === moisEcoules ? cumulRev - cumulCh : null,
      };
    });
    // moisRestants used implicitly above
    void moisRestants;
  }, [scope, saisonAudio, saisonVideo, caObjAudio, caObjVideo, caObjGlobal,
      caReelAudio, caReelVideo, caReelTotal, chargesAudioTotal, chargesVideoTotal,
      chargesTotal, real.moisCourant, anneBlanche]);

  if (loading && !hydrated) {
    return (
      <div className="-m-8 flex min-h-screen" style={{ backgroundColor: "#161616" }}>
        <div className="p-6 w-full">
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  // Charge helpers
  const addCharge = () => {
    setSimCharges((p) => [
      ...p,
      { id: Math.random().toString(36).slice(2), label: "", montant: 0, pole: "global" },
    ]);
  };
  const updateCharge = (id: string, patch: Partial<SimCharge>) => {
    setSimCharges((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeCharge = (id: string) => {
    setSimCharges((p) => p.filter((c) => c.id !== id));
  };

  const SimuleBadge = () => (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: "rgba(232,197,71,0.15)", color: C_ACCENT }}
    >
      Simulé
    </span>
  );

  return (
    <div className="-m-8 flex min-h-screen" style={{ backgroundColor: "#161616" }}>
      {/* ─────────── Sidebar gauche ─────────── */}
      <aside
        className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-4"
        style={{ backgroundColor: "#12121A" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Paramètres</h2>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Recharger depuis Airtable"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>

        {/* Année blanche */}
        <div className="flex items-center justify-between rounded-md border border-border p-2">
          <span className="text-xs text-foreground">Année blanche (réalisé = 0)</span>
          <Switch checked={anneBlanche} onCheckedChange={setAnneBlanche} />
        </div>

        {/* Paramètres annuels */}
        <Section title="Paramètres annuels">
          <Field label="CA objectif Audio" suffix="€" value={caObjAudio} onChange={setCaObjAudio} pole="audio" />
          <Field label="CA objectif Vidéo" suffix="€" value={caObjVideo} onChange={setCaObjVideo} pole="video" />
          <Readonly label="CA objectif Global" value={fmtEUR(caObjGlobal)} />
          <Field label="% attribution Audio" suffix="%" value={pctAudio} onChange={setPctAudio} pole="audio" />
          <Readonly label={`→ Vidéo : ${pctVideo.toFixed(0)} %`} value="" pole="video" tiny />
          <Field label="Réserve de sécurité" suffix="%" value={reserve} onChange={setReserve} />
        </Section>

        {/* Garde-fous */}
        <Section title="Garde-fous enveloppe">
          <span className="text-[10px] uppercase tracking-wide" style={{ color: "#94a3b8" }}>Audio</span>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Plancher" suffix="€" value={plancherAudio} onChange={setPlancherAudio} compact />
            <Field label="Plafond" suffix="€" value={plafondAudio} onChange={setPlafondAudio} compact />
          </div>
          <span className="text-[10px] uppercase tracking-wide" style={{ color: "#9da4e8" }}>Vidéo</span>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Plancher" suffix="€" value={plancherVideo} onChange={setPlancherVideo} compact />
            <Field label="Plafond" suffix="€" value={plafondVideo} onChange={setPlafondVideo} compact />
          </div>
        </Section>

        <Section title="Taux de concrétisation">
          <Field label="Taux Option" suffix="%" value={tauxOption} onChange={setTauxOption} />
          <Field label="Taux Confirmé" suffix="%" value={tauxConfirme} onChange={setTauxConfirme} />
        </Section>

        {/* Charges simulées */}
        <Section title="Charges simulées">
          {simCharges.map((c) => (
            <div key={c.id} className="rounded-md border border-border p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Input
                  value={c.label}
                  onChange={(e) => updateCharge(c.id, { label: e.target.value })}
                  placeholder="Libellé"
                  className="h-7 flex-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => removeCharge(c.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="relative">
                  <Input
                    type="number"
                    value={c.montant}
                    onChange={(e) => updateCharge(c.id, { montant: parseFloat(e.target.value) || 0 })}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    className="h-7 pr-5 text-xs"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[10px] text-muted-foreground">€</span>
                </div>
                <select
                  value={c.pole}
                  onChange={(e) => updateCharge(c.id, { pole: e.target.value as ChargePole })}
                  className="flex h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                >
                  <option value="global">Global</option>
                  <option value="audio">Audio</option>
                  <option value="video">Vidéo</option>
                </select>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addCharge}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/40"
          >
            <Plus className="h-3 w-3" />
            Ajouter une charge
          </button>
        </Section>
      </aside>

      {/* ─────────── Zone droite ─────────── */}
      <div className="flex-1 p-6 space-y-4">
        <header className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Simulateur · {ANNEE}</h1>
          <SimuleBadge />
          {anneBlanche && (
            <span className="text-xs text-muted-foreground">Mode année blanche</span>
          )}
        </header>

        {/* Saisonnalité */}
        <div className="rounded-lg border border-border p-4" style={{ backgroundColor: "#181820" }}>
          <button
            type="button"
            onClick={() => setSeasonOpen((o) => !o)}
            className="flex w-full items-center gap-2 text-sm font-medium text-foreground"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", seasonOpen && "rotate-180")} />
            Saisonnalité avancée
          </button>
          {seasonOpen && (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SeasonGrid title="Audio" pole="audio" values={saisonAudio} onChange={(i, v) =>
                setSaisonAudio((p) => p.map((x, idx) => (idx === i ? v : x)))
              } total={totalSaisonAudio} />
              <SeasonGrid title="Vidéo" pole="video" values={saisonVideo} onChange={(i, v) =>
                setSaisonVideo((p) => p.map((x, idx) => (idx === i ? v : x)))
              } total={totalSaisonVideo} />
            </div>
          )}
        </div>

        {/* Charges fixes par catégorie */}
        <div className="rounded-lg border border-border p-4" style={{ backgroundColor: "#181820" }}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setChargesFixesOpen((o) => !o)}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", chargesFixesOpen && "rotate-180")} />
              Charges fixes par catégorie
              <span className="text-xs text-muted-foreground">
                ({fmtEUR(chProvAnnuel)} / an)
              </span>
            </button>
            {chargesFixesOpen && (
              <button
                type="button"
                onClick={resetChargesFixes}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                Réinitialiser ce tableau
              </button>
            )}
          </div>
          {chargesFixesOpen && (
            <div className="mt-4 space-y-2">
              {chargesFixesGroupes.map((g) => {
                const sousTotal = g.rows.reduce((s, r) => {
                  const e = chargesFixesEdit[r.id];
                  const m = e?.montant ?? r.montant;
                  const t = e?.taux ?? r.taux;
                  return s + m * (t / 100);
                }, 0);
                const isOpen = !!openGroupes[g.type_charge];
                return (
                  <div key={g.type_charge} className="rounded-md border border-border" style={{ backgroundColor: "#1F1F2A" }}>
                    <button
                      type="button"
                      onClick={() => setOpenGroupes((p) => ({ ...p, [g.type_charge]: !p[g.type_charge] }))}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                        <span className="font-medium">{g.type_charge || "—"}</span>
                        <span className="text-xs text-muted-foreground">({g.rows.length})</span>
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">{fmtEUR(sousTotal)}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border px-3 py-2">
                        <div className="hidden grid-cols-[1.4fr_120px_90px_120px_70px] gap-3 pb-2 text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
                          <div>Catégorie</div>
                          <div className="text-right">Montant annuel</div>
                          <div className="text-right">Taux</div>
                          <div className="text-right">Imputé</div>
                          <div className="text-right">Pôle</div>
                        </div>
                        <div className="space-y-1.5">
                          {g.rows.map((r) => {
                            const e = chargesFixesEdit[r.id];
                            const montant = e?.montant ?? r.montant;
                            const taux = e?.taux ?? r.taux;
                            const impute = montant * (taux / 100);
                            const modifie = !!e && (e.montant !== r.montant || e.taux !== r.taux);
                            const poleLabel = r.pole === "audio" ? "Audio" : r.pole === "video" ? "Vidéo" : "Global";
                            return (
                              <div
                                key={r.id}
                                className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1.4fr_120px_90px_120px_70px] md:gap-3"
                              >
                                <div className="flex items-center gap-2 text-sm text-foreground">
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 rounded-full",
                                      modifie ? "bg-sky-400" : "bg-transparent",
                                    )}
                                    aria-hidden
                                  />
                                  <span>{r.categorie || r.type_charge}</span>
                                </div>
                                <Input
                                  type="number"
                                  value={montant}
                                  onChange={(ev) => {
                                    const v = Number(ev.target.value) || 0;
                                    setChargesFixesEdit((p) => ({
                                      ...p,
                                      [r.id]: { montant: v, taux: p[r.id]?.taux ?? r.taux },
                                    }));
                                  }}
                                  className="h-8 text-right tabular-nums"
                                />
                                <Input
                                  type="number"
                                  value={taux}
                                  onChange={(ev) => {
                                    const v = Number(ev.target.value) || 0;
                                    setChargesFixesEdit((p) => ({
                                      ...p,
                                      [r.id]: { montant: p[r.id]?.montant ?? r.montant, taux: v },
                                    }));
                                  }}
                                  className="h-8 text-right tabular-nums"
                                />
                                <div className="text-right text-sm tabular-nums text-foreground">{fmtEUR(impute)}</div>
                                <div className="text-right text-xs text-muted-foreground">{poleLabel}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cartes métriques */}
        {anneBlanche ? (
          <section className="grid grid-cols-1 gap-4">
            <MetricCard title="CA objectif annuel" badge>
              <p className="text-2xl font-semibold text-foreground">{fmtEUR(caObjGlobal)}</p>
              <ul className="mt-3 space-y-1 text-sm">
                <PoleLine label="Audio" value={fmtEUR(caObjAudio)} pole="audio" />
                <PoleLine label="Vidéo" value={fmtEUR(caObjVideo)} pole="video" />
              </ul>
            </MetricCard>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MetricCard title="CA réel · YTD" badge>
              <p className="text-2xl font-semibold text-foreground">{fmtEUR(caReelTotal)}</p>
              <ul className="mt-3 space-y-1 text-sm">
                <PoleLine label="Audio" value={fmtEUR(caReelAudio)} pole="audio" />
                <PoleLine label="Vidéo" value={fmtEUR(caReelVideo)} pole="video" />
                <PoleLine label="Pôle" value={fmtEUR(caReelPole)} />
              </ul>
            </MetricCard>
            <MetricCard title="Projection fin d'année" badge>
              <p className="text-2xl font-semibold text-foreground">{fmtEUR(projTotal)}</p>
              <ul className="mt-3 space-y-1 text-sm">
                <PoleLine label="Audio" value={fmtEUR(projAudio)} pole="audio" />
                <PoleLine label="Vidéo" value={fmtEUR(projVideo)} pole="video" />
              </ul>
            </MetricCard>
          </section>
        )}

        {/* Enveloppes (mode normal seulement) */}
        {!anneBlanche && (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <EnvelopeCard pole="audio" title="🎙 Enveloppe Audio" value={enveloppeAudio} ca={caReelAudio} charges={chargesAudioTotal} />
            <EnvelopeCard pole="video" title="🎬 Enveloppe Vidéo" value={enveloppeVideo} ca={caReelVideo} charges={chargesVideoTotal} />
          </section>
        )}

        {/* Capacité d'investissement */}
        <section>
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                  💡 Capacité d'investissement
                </h3>
                <SimuleBadge />
              </div>
              <ScopeToggle scope={scope} setScope={setScope} />
            </div>
            <p className={cn("text-3xl font-semibold", signClass(capacite[scope]))}>
              {fmtEUR(capacite[scope])}
            </p>

            <div className="mt-5 border-t border-border" />
            <div className="mt-4 space-y-0">
              {anneBlanche ? (
                <>
                  <CalcRow op="" label="CA objectif" value={fmtEUR(capDetail.caObj)} />
                  <CalcRow op="−" label="Charges totales" value={`− ${fmtEUR(capDetail.ch)}`} />
                  <CalcRow op="−" label={`Réserve sécurité (${reserve.toFixed(0)}%)`}
                    value={`− ${fmtEUR(capDetail.caObj * reserveDecimal)}`} />
                  <div className="mt-3 border-t border-border" />
                  <div className="mt-3">
                    <CalcRow op="=" label="Capacité d'investissement"
                      value={fmtEUR(capacite[scope])} semantic={capacite[scope]} bold />
                  </div>
                </>
              ) : (
                <>
                  <CalcRow op="" label="CA réel YTD" value={fmtEUR(capDetail.caR)} />
                  <CalcRow op="−" label="CA objectif YTD" value={`− ${fmtEUR(capDetail.objYTD)}`} />
                  <CalcRow op="=" label="Surplus" value={fmtEUR(capDetail.surplus)} />
                  <CalcRow op="×" label={`% année écoulée (${(pctAnneeEcoulee * 100).toFixed(0)}%)`}
                    value={`× ${(pctAnneeEcoulee * 100).toFixed(0)}%`} />
                  <CalcRow op="=" label="Surplus pondéré" value={fmtEUR(capDetail.surplusPond)} />
                  <CalcRow op="+" label="CA objectif YTD" value={`+ ${fmtEUR(capDetail.objYTD)}`} />
                  <CalcRow op="=" label="CA pondéré" value={fmtEUR(capDetail.caPond)} />
                  <CalcRow op="−" label="Charges totales" value={`− ${fmtEUR(capDetail.ch)}`} />
                  <CalcRow op="=" label="Résultat pondéré" value={fmtEUR(capDetail.resPond)} semantic={capDetail.resPond} />
                  <CalcRow op="−" label={`Réserve sécurité (${reserve.toFixed(0)}%)`}
                    value={capDetail.reserveMontant > 0 ? `− ${fmtEUR(capDetail.reserveMontant)}` : fmtEUR(0)} />
                  <div className="mt-3 border-t border-border" />
                  <div className="mt-3">
                    <CalcRow op="=" label="Capacité d'investissement"
                      value={fmtEUR(capacite[scope])} semantic={capacite[scope]} bold />
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Graphique projection */}
        <section>
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                Projection mensuelle cumulée
              </h3>
              <ScopeToggle scope={scope} setScope={setScope} />
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#2e2e2e" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mois" stroke="#888" tick={{ fontSize: 11, fill: "#888" }} />
                  <YAxis
                    stroke="#888"
                    tick={{ fontSize: 11, fill: "#888" }}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip
                    contentStyle={{ background: "#1f1f1f", border: "0.5px solid #2e2e2e", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#F0F0F0" }}
                    formatter={(value: number) => fmtEUR(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#888" }} />
                  <ReferenceLine y={0} stroke="#2e2e2e" />
                  {/* Réelles */}
                  <Line type="monotone" dataKey="revenusReel" name="Revenus cumulés" stroke={C_POS} strokeWidth={2} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="chargesReel" name="Charges cumulées" stroke={C_NEG} strokeWidth={2} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="soldeReel" name="Solde" stroke={C_ACCENT} strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={false} />
                  {/* Projetées */}
                  <Line type="monotone" dataKey="revenusProj" name="Revenus (proj.)" stroke={C_POS} strokeWidth={2} strokeDasharray="2 4" strokeOpacity={0.55} dot={false} connectNulls={false} legendType="none" />
                  <Line type="monotone" dataKey="chargesProj" name="Charges (proj.)" stroke={C_NEG} strokeWidth={2} strokeDasharray="2 4" strokeOpacity={0.55} dot={false} connectNulls={false} legendType="none" />
                  <Line type="monotone" dataKey="soldeProj" name="Solde (proj.)" stroke={C_ACCENT} strokeWidth={2} strokeDasharray="2 4" strokeOpacity={0.55} dot={false} connectNulls={false} legendType="none" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

const poleColor = (pole?: Pole) => ({
  bg: pole === "audio" ? "rgba(148,163,184,0.08)" : pole === "video" ? "rgba(129,140,248,0.07)" : undefined,
  text: pole === "audio" ? "#94a3b8" : pole === "video" ? "#9da4e8" : undefined,
});

function Field({
  label, suffix, value, onChange, pole, compact,
}: {
  label: string; suffix: string; value: number; onChange: (v: number) => void;
  pole?: Pole; compact?: boolean;
}) {
  const { bg, text } = poleColor(pole);
  return (
    <div className="rounded-md p-1" style={bg ? { backgroundColor: bg } : undefined}>
      <span
        className={cn("mb-1 block uppercase tracking-wide", compact ? "text-[9px]" : "text-[10px]")}
        style={{ color: text ?? "var(--color-muted-foreground)" }}
      >
        {label}
      </span>
      <div className="relative">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          className="h-8 pr-6 text-xs"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
          {suffix}
        </span>
      </div>
    </div>
  );
}

function Readonly({ label, value, pole, tiny }: { label: string; value: string; pole?: Pole; tiny?: boolean }) {
  const { bg, text } = poleColor(pole);
  if (tiny) {
    return (
      <span className="block text-[10px] pl-1" style={{ color: text ?? "var(--color-muted-foreground)" }}>
        {label} {value}
      </span>
    );
  }
  return (
    <div className="rounded-md p-1" style={bg ? { backgroundColor: bg } : undefined}>
      <span className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: text ?? "var(--color-muted-foreground)" }}>
        {label}
      </span>
      <div className="flex h-8 items-center rounded-md border border-border bg-background/30 px-2 text-xs text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

function ScopeToggle({ scope, setScope }: { scope: Scope; setScope: (s: Scope) => void }) {
  const opts: { v: Scope; l: string }[] = [
    { v: "global", l: "Global" },
    { v: "audio", l: "Audio" },
    { v: "video", l: "Vidéo" },
  ];
  return (
    <div className="flex gap-1">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => setScope(o.v)}
          className={cn(
            "rounded border px-2 py-0.5 text-[11px] transition-colors",
            scope === o.v
              ? "border-border bg-muted text-foreground"
              : "border-border/40 bg-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function MetricCard({ title, badge, children }: { title: string; badge?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
        {badge && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: "rgba(232,197,71,0.15)", color: C_ACCENT }}>Simulé</span>
        )}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function PoleLine({ label, value, pole }: { label: string; value: string; pole?: Pole }) {
  const { bg, text } = poleColor(pole);
  return (
    <li
      className="flex items-center justify-between rounded px-2 py-1"
      style={pole ? { backgroundColor: bg, color: text } : { color: "var(--color-muted-foreground)" }}
    >
      <span>{label}</span>
      <span className="font-medium tabular-nums" style={pole ? { color: text } : { color: "var(--color-foreground)" }}>
        {value}
      </span>
    </li>
  );
}

function EnvelopeCard({ pole, title, value, ca, charges }: {
  pole: Pole; title: string; value: number; ca: number; charges: number;
}) {
  const { bg, text } = poleColor(pole);
  return (
    <div className="rounded-lg border border-border p-5" style={{ backgroundColor: bg }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium" style={{ color: text }}>{title}</h3>
        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: "rgba(232,197,71,0.15)", color: C_ACCENT }}>Simulé</span>
      </div>
      <p className={cn("mt-2 text-3xl font-semibold", signClass(value))}>{fmtEUR(value)}</p>
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

function SeasonGrid({ title, pole, values, onChange, total }: {
  title: string; pole: Pole; values: number[]; onChange: (i: number, v: number) => void; total: number;
}) {
  const ok = Math.abs(total - 100) < 0.01;
  const { bg, text } = poleColor(pole);
  return (
    <div className="rounded-md border border-border p-4" style={{ backgroundColor: bg }}>
      <h4 className="mb-3 text-sm font-medium" style={{ color: text }}>{title}</h4>
      <div className="grid grid-cols-4 gap-2">
        {MOIS.map((m, i) => (
          <label key={i} className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{m}</span>
            <div className="relative">
              <Input
                type="number"
                value={values[i] ?? 0}
                onChange={(e) => onChange(i, parseFloat(e.target.value) || 0)}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                className="h-8 pr-5 text-xs"
              />
              <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[10px] text-muted-foreground">%</span>
            </div>
          </label>
        ))}
      </div>
      <p className={cn("mt-3 text-xs", ok ? "text-positive" : "text-destructive")}>
        Total : {total.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}%
        {!ok && " — doit être égal à 100%"}
      </p>
    </div>
  );
}

function CalcRow({ op, label, value, semantic, bold }: {
  op: string; label: string; value: string; semantic?: number; bold?: boolean;
}) {
  const valueColor = semantic === undefined ? "#F0F0F0"
    : semantic >= 0 ? "var(--color-positive)" : "var(--color-destructive)";
  const labelColor = semantic === undefined ? "#888" : valueColor;
  const isTotal = op === "=";
  return (
    <div
      className={cn(
        "grid grid-cols-[1.25rem_1fr_auto] items-center gap-3 px-2 py-1 text-sm rounded",
        bold && "font-semibold",
      )}
      style={isTotal ? { backgroundColor: "rgba(255,255,255,0.04)" } : undefined}
    >
      <span className="font-mono" style={{ color: "#555" }}>{op}</span>
      <span style={{ color: labelColor }}>{label}</span>
      <span className="tabular-nums" style={{ color: valueColor }}>{value}</span>
    </div>
  );
}
