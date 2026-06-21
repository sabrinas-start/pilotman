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
  const projAudio = p.anneBlanche
    ? p.caObjAudio
    : p.caReelAudio + p.caObjAudio * restantA;
  const restantV = p.saisonVideo.slice(p.moisCourant).reduce((s, v) => s + v / 100, 0);
  const projVideo = p.anneBlanche
    ? p.caObjVideo
    : p.caReelVideo + p.caObjVideo * restantV;
  const projTotal = projAudio + projVideo;

  // Enveloppes
  const resT = p.anneBlanche
    ? caObjGlobal - p.chargesTotal
    : p.caReelTotal - p.chargesTotal;
  const resA = p.anneBlanche
    ? p.caObjAudio - p.chargesAudioTotal
    : p.caReelAudio - p.chargesAudioTotal;
  const resV = p.anneBlanche
    ? p.caObjVideo - p.chargesVideoTotal
    : p.caReelVideo - p.chargesVideoTotal;
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
      pipeRetenuTotal:
        num(metriques.ca_pipe_optimiste_total) + num(metriques.ca_pipe_pondere_total),
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
  const [simRevenus, setSimRevenus] = useState<SimCharge[]>([]);
  const [chargesFixesEdit, setChargesFixesEdit] =
    useState<Record<string, { montant: number; taux: number }>>({});
  const [openGroupes, setOpenGroupes] = useState<Record<string, boolean>>({});
  const [salairesEdit, setSalairesEdit] =
    useState<Record<string, { montant: number; taux: number }>>({});

  const [seasonOpen, setSeasonOpen] = useState(false);
  const [objectifsOpen, setObjectifsOpen] = useState(false);
  const [chargesFixesOpen, setChargesFixesOpen] = useState(false);
  const [salairesOpen, setSalairesOpen] = useState(false);
  const [chargesSimOpen, setChargesSimOpen] = useState(false);
  const [revenusSimOpen, setRevenusSimOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("global");
  const [hydrated, setHydrated] = useState(false);
  const [fixesHydrated, setFixesHydrated] = useState(false);
  const [salHydrated, setSalHydrated] = useState(false);

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
    setSimRevenus([]);
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
    setSalHydrated(false);
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
    const groupes = new Map<
      string,
      { categorie: string; type_charge: string; somme: number; firstId: string }
    >();
    for (const r of chargesProv) {
      const categorie = str(r.fields.categorie);
      const type_charge = str(r.fields.type_charge);
      const cle = categorie || type_charge;
      if (!cle) continue;
      const existing = groupes.get(cle);
      if (existing) {
        existing.somme += num(r.fields.montant_provisionne);
      } else {
        groupes.set(cle, {
          categorie,
          type_charge,
          somme: num(r.fields.montant_provisionne),
          firstId: r.id,
        });
      }
    }
    return Array.from(groupes.entries()).map(([cle, g]) => {
      const montant = Math.round(g.somme * 100) / 100;
      const pole: "audio" | "video" | "global" =
        g.categorie.includes("Tournage Son") ? "audio"
          : g.categorie.includes("Tournage Image") ? "video"
          : "global";
      return {
        id: g.firstId || cle,
        categorie: g.categorie || g.type_charge,
        type_charge: g.type_charge,
        pole,
        montant,
        taux: 100,
      };
    });
  }, [chargesProv]);


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

  // Revenus simulés (ajoutés au CA réel) — calculés ici pour pouvoir abonder caReel*
  const _simRevenusAudio = simRevenus.reduce(
    (s, c) =>
      s + (c.pole === "audio" ? c.montant : c.pole === "global" ? c.montant * pAudio : 0),
    0,
  );
  const _simRevenusVideo = simRevenus.reduce(
    (s, c) =>
      s + (c.pole === "video" ? c.montant : c.pole === "global" ? c.montant * pVideo : 0),
    0,
  );

  // CA réel (dépend de anneBlanche) — abondé des revenus simulés
  const caReelAudio = (anneBlanche ? 0 : real.caAudio) + _simRevenusAudio;
  const caReelVideo = (anneBlanche ? 0 : real.caVideo) + _simRevenusVideo;
  const caReelTotal = (anneBlanche ? 0 : real.caTotal) + _simRevenusAudio + _simRevenusVideo;
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

  // ── Salaires par salarié (source de sumSal) ──────────────────────────
  type SalarieRow = { id: string; nom: string; montant: number; taux: number };
  const salairesBase = useMemo<SalarieRow[]>(() => {
    const agg = new Map<string, { somme: number; tauxDec: number }>();
    for (const r of salaires) {
      const nom = str(r.fields.nom_salarie);
      if (!nom) continue;
      const existing = agg.get(nom);
      if (existing) {
        existing.somme += num(r.fields.montant_impute);
      } else {
        agg.set(nom, {
          somme: num(r.fields.montant_impute),
          tauxDec: num(r.fields.taux_imputation),
        });
      }
    }
    return Array.from(agg.entries()).map(([nom, { somme, tauxDec }]) => {
      const tauxPct = tauxDec * 100;
      const montantAnnuel = tauxDec > 0 ? Math.round((somme / tauxDec) * 100) / 100 : 0;
      return {
        id: nom,
        nom,
        montant: montantAnnuel,
        taux: tauxDec > 0 ? Math.round(tauxPct * 100) / 100 : 0,
      };
    });
  }, [salaires]);

  const resetSalaires = () => {
    const init: Record<string, { montant: number; taux: number }> = {};
    for (const r of salairesBase) init[r.id] = { montant: r.montant, taux: r.taux };
    setSalairesEdit(init);
  };

  useEffect(() => {
    if (!salHydrated && salairesQ.data && salairesBase.length > 0) {
      resetSalaires();
      setSalHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salHydrated, salairesQ.data, salairesBase]);

  // Salaires — source : tableau "Salaires par salarié" (édité ou Airtable)
  const sumSalAnnuel = useMemo(() => {
    return salairesBase.reduce((s, r) => {
      const e = salairesEdit[r.id];
      const montant = e?.montant ?? r.montant;
      const taux = e?.taux ?? r.taux;
      return s + montant * (taux / 100);
    }, 0);
  }, [salairesBase, salairesEdit]);
  const sumSal = anneBlanche ? sumSalAnnuel : sumSalAnnuel * (real.moisCourant / 12);

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

  // (Revenus simulés sont déjà ventilés via _simRevenusAudio/_simRevenusVideo plus haut,
  //  et abondent directement caReelAudio/Video/Total.)



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

  // ── Décompositions affichage (baseline) ─────────────────────────────
  const baselineBreakdown = useMemo(() => {
    const pAudioBase = real.pctAudio;
    const pVideoBase = 1 - real.pctAudio;
    const chProvBase = chargesProv
      .filter((r) => num(r.fields.mois) <= real.moisCourant)
      .reduce((s, r) => s + num(r.fields.montant_provisionne), 0);
    const sumSalBase = salaires
      .filter((r) => num(r.fields.mois) <= real.moisCourant)
      .reduce((s, r) => s + num(r.fields.montant_impute), 0);
    const chargesProvAnneeBase = chargesProv.reduce(
      (s, r) => s + num(r.fields.montant_provisionne),
      0,
    );
    const salairesAnneeBase = salaires.reduce(
      (s, r) => s + num(r.fields.montant_impute),
      0,
    );
    return {
      pAudioBase,
      pVideoBase,
      chargesReellesAudioBase: real.chargesAudio + real.chargesCommunes * pAudioBase,
      chargesReellesVideoBase: real.chargesVideo + real.chargesCommunes * pVideoBase,
      chargesProvAudioBase: chProvBase * pAudioBase,
      chargesProvVideoBase: chProvBase * pVideoBase,
      chargesSalAudioBase: sumSalBase * pAudioBase,
      chargesSalVideoBase: sumSalBase * pVideoBase,
      chargesProvAnneeBase,
      salairesAnneeBase,
      caObjectifGlobalBase: real.caObjectifAudio + real.caObjectifVideo,
    };
  }, [real, chargesProv, salaires]);

  // Projection charges (annualisée) pour solde projeté
  const chargesProjeteesBase =
    real.chReelTotal + baselineBreakdown.chargesProvAnneeBase + baselineBreakdown.salairesAnneeBase;
  const chargesProjeteesSimule =
    real.chReelTotal + chProvAnnuel + sumSalAnnuel + simChargesTotal;
  const soldeProjeteBase = kpisBaseline.projTotal - chargesProjeteesBase;
  const soldeProjeteSimule = kpisSimule.projTotal - chargesProjeteesSimule;

  // Destructurations — conservent les noms utilisés dans le rendu
  const { capacite, capDetail, projAudio, projVideo, projTotal,
          enveloppeAudio, enveloppeVideo, resT, resA, resV } = kpisSimule;
  void resT; void resA; void resV;

  // Données graphique
  const chartData = useMemo(() => {
    const moisIdx = real.moisCourant - 1; // 0-based dernier mois réel
    void moisIdx;
    const sa = scope === "audio" ? saisonAudio : scope === "video" ? saisonVideo : saisonAudio;
    const caObjScope = scope === "audio" ? caObjAudio : scope === "video" ? caObjVideo : caObjGlobal;
    // Baseline (réel) — utilisé pour les courbes "Revenus/Charges/Solde" existantes
    const caReelScopeBase =
      scope === "audio" ? paramsBaseline.caReelAudio
      : scope === "video" ? paramsBaseline.caReelVideo
      : paramsBaseline.caReelTotal;
    const chargesScopeBase =
      scope === "audio" ? paramsBaseline.chargesAudioTotal
      : scope === "video" ? paramsBaseline.chargesVideoTotal
      : paramsBaseline.chargesTotal;
    // Simulé — utilisé uniquement pour la courbe "Charges (simulé)"
    const chargesScopeSim =
      scope === "audio" ? chargesAudioTotal
      : scope === "video" ? chargesVideoTotal
      : chargesTotal;

    const moisEcoules = anneBlanche ? 0 : real.moisCourant;
    const moisRestants = 12 - moisEcoules;
    void moisRestants;

    let cumulRev = 0;
    let cumulCh = 0;
    let cumulChSim = 0;
    const sumSaisonEcoulee = sa.slice(0, moisEcoules).reduce((s, v) => s + v / 100, 0) || 1;

    return MOIS.map((label, i) => {
      const mois1 = i + 1;
      const isReel = mois1 <= moisEcoules;
      const isProj = mois1 > moisEcoules;

      let revMois = 0;
      let chMois = 0;
      let chMoisSim = 0;
      if (isReel) {
        revMois = caReelScopeBase * (sa[i] / 100) / sumSaisonEcoulee;
        chMois = chargesScopeBase / Math.max(moisEcoules, 1);
        chMoisSim = chargesScopeSim / Math.max(moisEcoules, 1);
      } else {
        revMois = caObjScope * (sa[i] / 100);
        if (anneBlanche) {
          chMois = chargesScopeBase / 12;
          chMoisSim = chargesScopeSim / 12;
        } else {
          chMois = chargesScopeBase / Math.max(moisEcoules, 1);
          chMoisSim = chargesScopeSim / Math.max(moisEcoules, 1);
        }
      }
      cumulRev += revMois;
      cumulCh += chMois;
      cumulChSim += chMoisSim;

      return {
        mois: label,
        revenusReel: isReel ? cumulRev : null,
        chargesReel: isReel ? cumulCh : null,
        soldeReel: isReel ? cumulRev - cumulCh : null,
        revenusProj: isProj || mois1 === moisEcoules ? cumulRev : null,
        chargesProj: isProj || mois1 === moisEcoules ? cumulCh : null,
        soldeProj: isProj || mois1 === moisEcoules ? cumulRev - cumulCh : null,
        chargesSim: cumulChSim,
      };
    });
  }, [scope, saisonAudio, saisonVideo, caObjAudio, caObjVideo, caObjGlobal,
      paramsBaseline, chargesAudioTotal, chargesVideoTotal,
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

  // Revenu helpers (même pattern que simCharges)
  const addRevenu = () => {
    setSimRevenus((p) => [
      ...p,
      { id: Math.random().toString(36).slice(2), label: "", montant: 0, pole: "global" },
    ]);
  };
  const updateRevenu = (id: string, patch: Partial<SimCharge>) => {
    setSimRevenus((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeRevenu = (id: string) => {
    setSimRevenus((p) => p.filter((c) => c.id !== id));
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
    <div className="-m-8 min-h-screen" style={{ backgroundColor: "#161616" }}>
      <div className="p-6 space-y-4">
        <header className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Simulateur · {ANNEE}</h1>
          <SimuleBadge />
          {anneBlanche && (
            <span className="text-xs text-muted-foreground">Mode année blanche</span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
              <span className="text-xs text-foreground">Année blanche (réalisé = 0)</span>
              <Switch checked={anneBlanche} onCheckedChange={setAnneBlanche} />
            </label>
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
        </header>

        {/* Objectifs & répartition */}
        <div className="rounded-lg border border-border p-4" style={{ backgroundColor: "#181820", borderLeft: "4px solid #6B7280", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
          <button
            type="button"
            onClick={() => setObjectifsOpen((o) => !o)}
            className="flex w-full items-center gap-2 text-sm font-medium text-foreground"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", objectifsOpen && "rotate-180")} />
            Objectifs &amp; répartition
          </button>
          {objectifsOpen && (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <Section title="Paramètres annuels">
                <Field label="CA objectif Audio" suffix="€" value={caObjAudio} onChange={setCaObjAudio} pole="audio" />
                <Field label="CA objectif Vidéo" suffix="€" value={caObjVideo} onChange={setCaObjVideo} pole="video" />
                <Readonly label="CA objectif Global" value={fmtEUR(caObjGlobal)} />
                <Field label="% attribution Audio" suffix="%" value={pctAudio} onChange={setPctAudio} pole="audio" />
                <Readonly label={`→ Vidéo : ${pctVideo.toFixed(0)} %`} value="" pole="video" tiny />
                <Field label="Réserve de sécurité" suffix="%" value={reserve} onChange={setReserve} />
              </Section>

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
            </div>
          )}
        </div>


        {/* Saisonnalité */}
        <div className="rounded-lg border border-border p-4" style={{ backgroundColor: "#181820", borderLeft: "4px solid #1D9E75", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Charges fixes par catégorie */}
        <div className="rounded-lg border border-border p-4" style={{ backgroundColor: "#181820", borderLeft: "4px solid #D85A30", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
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
                        <div className="hidden grid-cols-[1.4fr_1fr_0.7fr_1fr] gap-3 pb-2 text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
                          <div>Catégorie</div>
                          <div className="text-right">Montant annuel</div>
                          <div className="text-right">Taux</div>
                          <div className="text-right">Imputé</div>
                        </div>
                        <div className="space-y-1.5">
                          {g.rows.map((r) => {
                            const e = chargesFixesEdit[r.id];
                            const montant = e?.montant ?? r.montant;
                            const taux = e?.taux ?? r.taux;
                            const impute = montant * (taux / 100);
                            const modifie = !!e && (e.montant !== r.montant || e.taux !== r.taux);
                            return (
                              <div
                                key={r.id}
                                className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1.4fr_1fr_0.7fr_1fr] md:gap-3"
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
                                <div className="relative">
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
                                    onWheel={(ev) => (ev.target as HTMLInputElement).blur()}
                                    className="h-8 pr-6 text-right tabular-nums"
                                  />
                                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">€</span>
                                </div>
                                <div className="relative">
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
                                    onWheel={(ev) => (ev.target as HTMLInputElement).blur()}
                                    className="h-8 pr-6 text-right tabular-nums"
                                  />
                                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">%</span>
                                </div>
                                <div className="text-right text-sm tabular-nums text-foreground">{fmtEUR(impute)}</div>
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

        {/* Salaires par salarié */}
        <div className="rounded-lg border border-border p-4" style={{ backgroundColor: "#181820", borderLeft: "4px solid #D85A30", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSalairesOpen((o) => !o)}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", salairesOpen && "rotate-180")} />
              Salaires par salarié
              <span className="text-xs text-muted-foreground">
                ({fmtEUR(sumSalAnnuel)} / an)
              </span>
            </button>
            {salairesOpen && (
              <button
                type="button"
                onClick={resetSalaires}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                Réinitialiser ce tableau
              </button>
            )}
          </div>
          {salairesOpen && (
            <div className="mt-4">
              <div className="hidden grid-cols-[1.4fr_1fr_0.7fr_1fr] gap-3 pb-2 text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
                <div>Salarié</div>
                <div className="text-right">Montant annuel</div>
                <div className="text-right">Taux</div>
                <div className="text-right">Imputé</div>
              </div>
              <div className="space-y-1.5">
                {salairesBase.map((r) => {
                  const e = salairesEdit[r.id];
                  const montant = e?.montant ?? r.montant;
                  const taux = e?.taux ?? r.taux;
                  const impute = montant * (taux / 100);
                  const modifie = !!e && (e.montant !== r.montant || e.taux !== r.taux);
                  return (
                    <div
                      key={r.id}
                      className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1.4fr_1fr_0.7fr_1fr] md:gap-3"
                    >
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            modifie ? "bg-sky-400" : "bg-transparent",
                          )}
                          aria-hidden
                        />
                        <span>{r.nom}</span>
                      </div>
                      <div className="relative">
                        <Input
                          type="number"
                          value={montant}
                          onChange={(ev) => {
                            const v = Number(ev.target.value) || 0;
                            setSalairesEdit((p) => ({
                              ...p,
                              [r.id]: { montant: v, taux: p[r.id]?.taux ?? r.taux },
                            }));
                          }}
                          onWheel={(ev) => (ev.target as HTMLInputElement).blur()}
                          className="h-8 pr-6 text-right tabular-nums"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">€</span>
                      </div>
                      <div className="relative">
                        <Input
                          type="number"
                          value={taux}
                          onChange={(ev) => {
                            const v = Number(ev.target.value) || 0;
                            setSalairesEdit((p) => ({
                              ...p,
                              [r.id]: { montant: p[r.id]?.montant ?? r.montant, taux: v },
                            }));
                          }}
                          onWheel={(ev) => (ev.target as HTMLInputElement).blur()}
                          className="h-8 pr-6 text-right tabular-nums"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">%</span>
                      </div>
                      <div className="text-right text-sm tabular-nums text-foreground">{fmtEUR(impute)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Charges simulées */}
        <div className="rounded-lg border border-border p-4" style={{ backgroundColor: "#181820", borderLeft: "4px solid #D85A30", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setChargesSimOpen((o) => !o)}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", chargesSimOpen && "rotate-180")} />
              Charges simulées
              <span className="text-xs text-muted-foreground">
                ({simCharges.length} ligne{simCharges.length > 1 ? "s" : ""})
              </span>
            </button>
            <button
              type="button"
              onClick={addCharge}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              Ajouter une charge
            </button>
          </div>
          {chargesSimOpen && (
            <div className="mt-4 space-y-1.5">
              {simCharges.length === 0 && (
                <p className="text-xs text-muted-foreground">Aucune charge simulée.</p>
              )}
              {simCharges.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1.4fr_140px_110px_32px] md:gap-3"
                >
                  <Input
                    value={c.label}
                    onChange={(e) => updateCharge(c.id, { label: e.target.value })}
                    placeholder="Libellé"
                    className="h-8 text-sm"
                  />
                  <div className="relative">
                    <Input
                      type="number"
                      value={c.montant}
                      onChange={(e) => updateCharge(c.id, { montant: parseFloat(e.target.value) || 0 })}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      className="h-8 pr-6 text-right tabular-nums"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">€</span>
                  </div>
                  <select
                    value={c.pole}
                    onChange={(e) => updateCharge(c.id, { pole: e.target.value as ChargePole })}
                    className="flex h-8 w-full rounded-md border border-input bg-[#1a1a22] text-foreground px-2 text-xs"
                  >
                    <option value="global" className="bg-[#1a1a22] text-foreground">Global</option>
                    <option value="audio" className="bg-[#1a1a22] text-foreground">Audio</option>
                    <option value="video" className="bg-[#1a1a22] text-foreground">Vidéo</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeCharge(c.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revenus simulés */}
        <div className="rounded-lg border border-border p-4" style={{ backgroundColor: "#181820", borderLeft: "4px solid #1D9E75", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setRevenusSimOpen((o) => !o)}
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", revenusSimOpen && "rotate-180")} />
              Revenus simulés
              <span className="text-xs text-muted-foreground">
                ({simRevenus.length} ligne{simRevenus.length > 1 ? "s" : ""})
              </span>
            </button>
            <button
              type="button"
              onClick={addRevenu}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              Ajouter un revenu
            </button>
          </div>
          {revenusSimOpen && (
            <div className="mt-4 space-y-1.5">
              {simRevenus.length === 0 && (
                <p className="text-xs text-muted-foreground">Aucun revenu simulé.</p>
              )}
              {simRevenus.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1.4fr_140px_110px_32px] md:gap-3"
                >
                  <Input
                    value={c.label}
                    onChange={(e) => updateRevenu(c.id, { label: e.target.value })}
                    placeholder="Libellé"
                    className="h-8 text-sm"
                  />
                  <div className="relative">
                    <Input
                      type="number"
                      value={c.montant}
                      onChange={(e) => updateRevenu(c.id, { montant: parseFloat(e.target.value) || 0 })}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      className="h-8 pr-6 text-right tabular-nums"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">€</span>
                  </div>
                  <select
                    value={c.pole}
                    onChange={(e) => updateRevenu(c.id, { pole: e.target.value as ChargePole })}
                    className="flex h-8 w-full rounded-md border border-input bg-[#1a1a22] text-foreground px-2 text-xs"
                  >
                    <option value="global" className="bg-[#1a1a22] text-foreground">Global</option>
                    <option value="audio" className="bg-[#1a1a22] text-foreground">Audio</option>
                    <option value="video" className="bg-[#1a1a22] text-foreground">Vidéo</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeRevenu(c.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* ─── Résultats ─── */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_3fr]">
          <ComparisonCard
            title="Projection fin d'année"
            reel={scope === "audio" ? kpisBaseline.projAudio : scope === "video" ? kpisBaseline.projVideo : kpisBaseline.projTotal}
            simule={scope === "audio" ? kpisSimule.projAudio : scope === "video" ? kpisSimule.projVideo : kpisSimule.projTotal}
            right={<ScopeToggle scope={scope} setScope={setScope} />}
            anneBlanche={anneBlanche}
            footer={
              <div className="mt-3 border-t border-border pt-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs" style={{ color: C_ACCENT }}>Pipe attendu</span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: C_ACCENT }}>
                    {fmtEUR(real.pipeRetenuTotal)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">donnée réelle, non simulable</p>
              </div>
            }
          >
            {!anneBlanche && (
              <div className="mt-3 border-t border-border pt-2">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span></span>
                  <span className="w-24 text-right">Réel</span>
                  <span className="w-24 text-right" style={{ color: C_ACCENT }}>Simulé</span>
                </div>
                <CompareRow
                  label="Objectif annuel"
                  reel={baselineBreakdown.caObjectifGlobalBase}
                  simule={caObjGlobal}
                />
                <CompareRow
                  label="Charges projetées"
                  reel={chargesProjeteesBase}
                  simule={chargesProjeteesSimule}
                />
                <CompareRow
                  label="Solde projeté annuel"
                  reel={soldeProjeteBase}
                  simule={soldeProjeteSimule}
                  semantic
                />
              </div>
            )}
          </ComparisonCard>
          <ComparisonCard
            title="💡 Capacité d'investissement"
            reel={kpisBaseline.capacite[scope]}
            simule={kpisSimule.capacite[scope]}
            anneBlanche={anneBlanche}
            right={<ScopeToggle scope={scope} setScope={setScope} />}
          >
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                Détail du calcul
              </p>
              {anneBlanche ? (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: C_ACCENT }}>Simulé</p>
                  <div className="space-y-0">
                    <CalcRow op="" label="CA objectif" value={fmtEUR(capDetail.caObj)} />
                    <CalcRow op="−" label="Charges totales" value={`− ${fmtEUR(capDetail.ch)}`} />
                    <CalcRow op="−" label={`Réserve sécurité (${reserve.toFixed(0)}%)`}
                      value={`− ${fmtEUR(capDetail.caObj * reserveDecimal)}`} />
                    <div className="mt-2 border-t border-border" />
                    <div className="mt-2">
                      <CalcRow op="=" label="Capacité d'investissement"
                        value={fmtEUR(capacite[scope])} semantic={capacite[scope]} bold />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <CapDetailCol
                    title="Réel"
                    titleColor="var(--color-muted-foreground)"
                    detail={kpisBaseline.capDetail}
                    capacite={kpisBaseline.capacite[scope]}
                    reservePct={real.reserve * 100}
                    pctAnneeEcoulee={
                      real.saisonAudio.slice(0, real.moisCourant).reduce((s, v) => s + v, 0) * 100
                    }
                  />
                  <CapDetailCol
                    title="Simulé"
                    titleColor={C_ACCENT}
                    detail={kpisSimule.capDetail}
                    capacite={kpisSimule.capacite[scope]}
                    reservePct={reserve}
                    pctAnneeEcoulee={pctAnneeEcoulee * 100}
                  />
                </div>
              )}
            </div>
          </ComparisonCard>
        </section>



        {/* Graphique projection */}
        <section>
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                Revenus vs Charges cumulées
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
                  <Line type="monotone" dataKey="revenusReel" name="Revenus cumulés" stroke={C_POS} strokeWidth={2} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="chargesReel" name="Charges cumulées" stroke={C_NEG} strokeWidth={2} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="soldeReel" name="Solde" stroke={C_ACCENT} strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="revenusProj" name="Revenus (proj.)" stroke={C_POS} strokeWidth={2} strokeDasharray="2 4" strokeOpacity={0.55} dot={false} connectNulls={false} legendType="none" />
                  <Line type="monotone" dataKey="chargesProj" name="Charges (proj.)" stroke={C_NEG} strokeWidth={2} strokeDasharray="2 4" strokeOpacity={0.55} dot={false} connectNulls={false} legendType="none" />
                  <Line type="monotone" dataKey="soldeProj" name="Solde (proj.)" stroke={C_ACCENT} strokeWidth={2} strokeDasharray="2 4" strokeOpacity={0.55} dot={false} connectNulls={false} legendType="none" />
                  <Line type="monotone" dataKey="chargesSim" name="Charges (simulé)" stroke="#D85A30" strokeWidth={1} strokeDasharray="2 3" strokeOpacity={0.4} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Enveloppes (mode normal seulement) */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ComparisonCard
            title="🎙 Enveloppe Audio"
            reel={kpisBaseline.enveloppeAudio}
            simule={kpisSimule.enveloppeAudio}
            pole="audio"
            anneBlanche={anneBlanche}
          >
            {!anneBlanche && (
              <div className="mt-3 border-t border-border pt-2">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span></span>
                  <span className="w-24 text-right">Réel</span>
                  <span className="w-24 text-right" style={{ color: C_ACCENT }}>Simulé</span>
                </div>
                <CompareRow
                  label="dont charges réelles"
                  reel={baselineBreakdown.chargesReellesAudioBase}
                  simule={chReelAudioEff}
                />
                <CompareRow
                  label="dont provisions"
                  reel={baselineBreakdown.chargesProvAudioBase}
                  simule={chProv * pAudio}
                />
                <CompareRow
                  label="dont salaires"
                  reel={baselineBreakdown.chargesSalAudioBase}
                  simule={sumSal * pAudio}
                />
              </div>
            )}
          </ComparisonCard>
          <ComparisonCard
            title="🎬 Enveloppe Vidéo"
            reel={kpisBaseline.enveloppeVideo}
            simule={kpisSimule.enveloppeVideo}
            pole="video"
            anneBlanche={anneBlanche}
          >
            {!anneBlanche && (
              <div className="mt-3 border-t border-border pt-2">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span></span>
                  <span className="w-24 text-right">Réel</span>
                  <span className="w-24 text-right" style={{ color: C_ACCENT }}>Simulé</span>
                </div>
                <CompareRow
                  label="dont charges réelles"
                  reel={baselineBreakdown.chargesReellesVideoBase}
                  simule={chReelVideoEff}
                />
                <CompareRow
                  label="dont provisions"
                  reel={baselineBreakdown.chargesProvVideoBase}
                  simule={chProv * pVideo}
                />
                <CompareRow
                  label="dont salaires"
                  reel={baselineBreakdown.chargesSalVideoBase}
                  simule={sumSal * pVideo}
                />
              </div>
            )}
          </ComparisonCard>
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

function ComparisonCard({ title, reel, simule, pole, right, children, footer, anneBlanche }: {
  title: string; reel: number; simule: number; pole?: Pole; right?: React.ReactNode;
  children?: React.ReactNode; footer?: React.ReactNode; anneBlanche?: boolean;
}) {
  const ecart = simule - reel;
  const { bg, text } = poleColor(pole);
  const ecartColor = ecart > 0 ? "var(--color-positive)"
    : ecart < 0 ? "var(--color-destructive)"
    : "var(--color-muted-foreground)";
  const sign = ecart > 0 ? "+" : "";
  return (
    <div className="rounded-lg border border-border p-5" style={pole ? { backgroundColor: bg } : { backgroundColor: "var(--color-surface, #1a1a22)" }}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium" style={{ color: text ?? "var(--color-muted-foreground)" }}>{title}</h3>
        {right}
      </div>
      {anneBlanche ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide" style={{ color: C_ACCENT }}>Simulé</p>
          <p className={cn("text-2xl font-semibold tabular-nums", signClass(simule))}>{fmtEUR(simule)}</p>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Réel</p>
              <p className={cn("text-xl font-semibold tabular-nums", signClass(reel))}>{fmtEUR(reel)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: C_ACCENT }}>Simulé</p>
              <p className={cn("text-xl font-semibold tabular-nums", signClass(simule))}>{fmtEUR(simule)}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
            <span className="text-xs text-muted-foreground">Écart</span>
            <span className="text-sm font-medium tabular-nums" style={{ color: ecartColor }}>
              {sign}{fmtEUR(ecart)}
            </span>
          </div>
        </>
      )}
      {children}
      {footer}
    </div>
  );
}

function CompareRow({ label, reel, simule, semantic }: {
  label: string; reel: number; simule: number; semantic?: boolean;
}) {
  const cls = (n: number) => semantic ? signClass(n) : "text-foreground";
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("w-24 text-right tabular-nums", cls(reel))}>{fmtEUR(reel)}</span>
      <span className={cn("w-24 text-right tabular-nums", cls(simule))}>{fmtEUR(simule)}</span>
    </div>
  );
}

function CapDetailCol({
  title, titleColor, detail, capacite, reservePct, pctAnneeEcoulee,
}: {
  title: string;
  titleColor: string;
  detail: { caR: number; caObj: number; ch: number; objYTD: number; surplus: number; surplusPond: number; caPond: number; resPond: number; reserveMontant: number };
  capacite: number;
  reservePct: number;
  pctAnneeEcoulee: number; // 0-100
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: titleColor }}>{title}</p>
      <div className="space-y-0">
        <CalcRow op="" label="CA réel YTD" value={fmtEUR(detail.caR)} />
        <CalcRow op="−" label="CA objectif YTD" value={`− ${fmtEUR(detail.objYTD)}`} />
        <CalcRow op="=" label="Surplus" value={fmtEUR(detail.surplus)} />
        <CalcRow op="×" label={`% année écoulée (${pctAnneeEcoulee.toFixed(0)}%)`} value={`× ${pctAnneeEcoulee.toFixed(0)}%`} />
        <CalcRow op="=" label="Surplus pondéré" value={fmtEUR(detail.surplusPond)} />
        <CalcRow op="+" label="CA objectif YTD" value={`+ ${fmtEUR(detail.objYTD)}`} />
        <CalcRow op="=" label="CA pondéré" value={fmtEUR(detail.caPond)} />
        <CalcRow op="−" label="Charges totales" value={`− ${fmtEUR(detail.ch)}`} />
        <CalcRow op="=" label="Résultat pondéré" value={fmtEUR(detail.resPond)} semantic={detail.resPond} />
        <CalcRow op="−" label={`Réserve sécurité (${reservePct.toFixed(0)}%)`}
          value={detail.reserveMontant > 0 ? `− ${fmtEUR(detail.reserveMontant)}` : fmtEUR(0)} />
        <div className="mt-2 border-t border-border" />
        <div className="mt-2">
          <CalcRow op="=" label="Capacité" value={fmtEUR(capacite)} semantic={capacite} bold />
        </div>
      </div>
    </div>
  );
}
