import { DEFAULT_LOAD_PARAMS, LOAD_PARAM_RANGES } from '../lib/loadModels';
import type {
  LoadDomain,
  LoadModel,
  LoadModelCode,
  LoadModelInputField,
  LoadModelInputSchema,
  LoadModelParams,
  ResolvedLoadParams,
} from '../lib/types';

/**
 * Habillage des modèles de charge : ce que la formule calcule, et ce qu'elle
 * coûte au joueur au moment de la saisie.
 *
 * Le libellé et la référence bibliographique viennent du catalogue en base —
 * eux font foi. Ce fichier ne porte que la traduction en langage de terrain,
 * qui n'a rien à faire dans une migration SQL.
 *
 * Le champ `asks` existe parce que le risque numéro un du produit n'est pas un
 * mauvais calcul, c'est un joueur qui arrête de saisir. Un coach doit savoir
 * qu'il alourdit le formulaire de son effectif **avant** de valider.
 */
export interface ModelCopy {
  /** Ce que la formule calcule, en une phrase. */
  what: string;
  /** Ce que le joueur devra saisir en plus du RPE et de la durée. */
  asks: string;
  /** Vrai quand le modèle n'ajoute aucun champ au formulaire actuel. */
  noExtraInput: boolean;
}

export const MODEL_COPY: Record<LoadModelCode, ModelCopy> = {
  foster_srpe: {
    what: 'Multiplie la difficulté ressentie par la durée de la séance (RPE × minutes).',
    asks: 'Rien de plus : le RPE et la durée, déjà demandés aujourd’hui.',
    noExtraInput: true,
  },
  srpe_differentiated: {
    what:
      'Sépare l’effort respiratoire de l’effort musculaire, puis multiplie leur moyenne par la durée.',
    asks: 'Une deuxième note de 1 à 10 : un curseur RPE supplémentaire à chaque séance terrain.',
    noExtraInput: false,
  },
  foster_srpe_strength: {
    what: 'Multiplie la difficulté ressentie par la durée de la séance de musculation.',
    asks: 'Rien de plus : le RPE et la durée, déjà demandés aujourd’hui.',
    noExtraInput: true,
  },
  volume_load: {
    what: 'Additionne le tonnage soulevé : séries × répétitions × charge, exercice par exercice.',
    asks:
      'Le détail de la séance, exercice par exercice (séries, répétitions, kilos). C’est le modèle le plus exigeant pour le joueur.',
    noExtraInput: false,
  },
};

export const DOMAIN_LABEL: Record<LoadDomain, string> = {
  field: 'Terrain',
  strength: 'Musculation',
};

export const DOMAIN_HINT: Record<LoadDomain, string> = {
  field: 'Séances entraînement, match, individuel et récupération.',
  strength: 'Séances de musculation uniquement.',
};

/** Libellés des clés d'`input_schema`, telles qu'un joueur les voit. */
const FIELD_LABELS: Record<string, string> = {
  rpe: 'RPE global (1-10)',
  duration_min: 'Durée (minutes)',
  rpe_breathing: 'RPE respiratoire (1-10)',
  rpe_muscular: 'RPE musculaire (1-10)',
  exercises: 'Liste d’exercices (séries × répétitions × kilos)',
  sets: 'séries',
  reps: 'répétitions',
  weight_kg: 'kilos',
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export function schemaFields(schema: LoadModelInputSchema | undefined): LoadModelInputField[] {
  return schema?.fields ?? [];
}

/**
 * Champs réellement présentés au joueur pour un modèle donné.
 *
 * Ce n'est pas exactement l'`input_schema` : le RPE global et la durée sont
 * saisis et enregistrés quel que soit le modèle, y compris quand la formule ne
 * s'en sert pas (volume-load). C'est une règle produit — la colonne `rpe` est
 * `not null`, et un club doit pouvoir changer de modèle sans rendre son
 * historique inexploitable. Le seul cas où le RPE global disparaît du
 * formulaire est le sRPE différencié, où il est déduit des deux notes plutôt
 * que redemandé.
 */
export function playerInputLabels(schema: LoadModelInputSchema | undefined): string[] {
  const keys = schemaFields(schema).map((f) => f.key);
  const shown = keys.includes('rpe_breathing')
    ? ['rpe_breathing', 'rpe_muscular', 'duration_min']
    : ['rpe', 'duration_min'];
  for (const key of keys) {
    if (!shown.includes(key)) shown.push(key);
  }
  return shown.map(fieldLabel);
}

/**
 * Repli hors ligne, miroir du catalogue livré par la migration.
 *
 * Le formulaire de saisie doit rester juste même si la lecture du catalogue a
 * échoué : sans ce repli, une équipe en sRPE différencié perdrait sa seconde
 * note sans qu'aucun message ne le signale. Le catalogue en base reste la
 * source, ceci n'est qu'un filet.
 */
const FALLBACK_INPUT_KEYS: Record<LoadModelCode, string[]> = {
  foster_srpe: ['rpe', 'duration_min'],
  foster_srpe_strength: ['rpe', 'duration_min'],
  srpe_differentiated: ['rpe_breathing', 'rpe_muscular', 'duration_min'],
  volume_load: ['exercises'],
};

/** Clés d'entrée d'un modèle, lues au catalogue quand il est chargé. */
export function modelInputKeys(catalog: LoadModel[], code: LoadModelCode): string[] {
  const entry = catalog.find((m) => m.code === code);
  return entry ? schemaFields(entry.inputSchema).map((f) => f.key) : FALLBACK_INPUT_KEYS[code];
}

/* ------------------------------------------------------------------ *
 * Paramètres d'analyse : brouillon de saisie et validation
 *
 * Le formulaire manipule des chaînes et non des nombres, parce qu'un champ
 * vidé le temps de retaper une valeur ne doit pas être réinterprété en zéro
 * sous les doigts du coach. La conversion et les bornes sont donc ici, dans une
 * fonction pure — testable sans DOM, et rejouée à chaque frappe.
 * ------------------------------------------------------------------ */

export interface ParamsDraft {
  acuteWindowDays: string;
  chronicWindowDays: string;
  chronicMethod: 'rolling_average' | 'ewma';
  low: string;
  optimalMax: string;
  cautionMax: string;
  weeklyLookbackWeeks: string;
}

export type ParamErrors = Partial<Record<keyof ParamsDraft, string>>;

export function draftFromParams(params: ResolvedLoadParams): ParamsDraft {
  return {
    acuteWindowDays: String(params.acuteWindowDays),
    chronicWindowDays: String(params.chronicWindowDays),
    chronicMethod: params.chronicMethod,
    low: String(params.acwrThresholds.low),
    optimalMax: String(params.acwrThresholds.optimalMax),
    cautionMax: String(params.acwrThresholds.cautionMax),
    weeklyLookbackWeeks: String(params.weeklyLookbackWeeks),
  };
}

function integerIn(raw: string, min: number, max: number, unit: string): number | string {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) return 'Valeur manquante.';
  if (!Number.isInteger(value)) return 'Nombre entier attendu.';
  if (value < min || value > max) return `Entre ${min} et ${max} ${unit}.`;
  return value;
}

function ratioIn(raw: string): number | string {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) return 'Valeur manquante.';
  if (value < 0 || value > 3) return 'Entre 0 et 3.';
  return value;
}

/**
 * Valide un brouillon et renvoie des paramètres prêts à enregistrer.
 *
 * Les bornes rejouent celles des `check` de la base : mieux vaut un message
 * sous le champ fautif qu'une erreur Postgres générique après l'envoi. La base
 * reste l'autorité, cette fonction n'est qu'un service rendu au coach.
 */
export function validateParams(draft: ParamsDraft): {
  params: LoadModelParams;
  errors: ParamErrors;
} {
  const errors: ParamErrors = {};
  const r = LOAD_PARAM_RANGES;

  const acute = integerIn(
    draft.acuteWindowDays,
    r.acuteWindowDays.min,
    r.acuteWindowDays.max,
    'jours',
  );
  const chronic = integerIn(
    draft.chronicWindowDays,
    r.chronicWindowDays.min,
    r.chronicWindowDays.max,
    'jours',
  );
  const lookback = integerIn(
    draft.weeklyLookbackWeeks,
    r.weeklyLookbackWeeks.min,
    r.weeklyLookbackWeeks.max,
    'semaines',
  );
  const low = ratioIn(draft.low);
  const optimalMax = ratioIn(draft.optimalMax);
  const cautionMax = ratioIn(draft.cautionMax);

  if (typeof acute === 'string') errors.acuteWindowDays = acute;
  if (typeof chronic === 'string') errors.chronicWindowDays = chronic;
  if (typeof lookback === 'string') errors.weeklyLookbackWeeks = lookback;
  if (typeof low === 'string') errors.low = low;
  if (typeof optimalMax === 'string') errors.optimalMax = optimalMax;
  if (typeof cautionMax === 'string') errors.cautionMax = cautionMax;

  // Des seuils non strictement croissants rendraient une zone inatteignable :
  // la zone « vigilance » disparaîtrait sans qu'aucun chiffre ne paraisse faux.
  if (typeof low === 'number' && typeof optimalMax === 'number' && optimalMax <= low) {
    errors.optimalMax = `Doit être strictement supérieur à ${low}.`;
  }
  if (typeof optimalMax === 'number' && typeof cautionMax === 'number' && cautionMax <= optimalMax) {
    errors.cautionMax = `Doit être strictement supérieur à ${optimalMax}.`;
  }

  const d = DEFAULT_LOAD_PARAMS;
  return {
    params: {
      acuteWindowDays: typeof acute === 'number' ? acute : d.acuteWindowDays,
      chronicWindowDays: typeof chronic === 'number' ? chronic : d.chronicWindowDays,
      chronicMethod: draft.chronicMethod,
      weeklyLookbackWeeks: typeof lookback === 'number' ? lookback : d.weeklyLookbackWeeks,
      acwrThresholds: {
        low: typeof low === 'number' ? low : d.acwrThresholds.low,
        optimalMax: typeof optimalMax === 'number' ? optimalMax : d.acwrThresholds.optimalMax,
        cautionMax: typeof cautionMax === 'number' ? cautionMax : d.acwrThresholds.cautionMax,
      },
    },
    errors,
  };
}

/** Résumé lisible d'un jeu de paramètres, pour l'historique. */
export function paramsSummary(p: LoadModelParams): string {
  const parts: string[] = [];
  if (p.acuteWindowDays) parts.push(`aiguë ${p.acuteWindowDays} j`);
  if (p.chronicWindowDays) parts.push(`chronique ${p.chronicWindowDays} j`);
  if (p.chronicMethod) parts.push(p.chronicMethod === 'ewma' ? 'EWMA' : 'moyenne glissante');
  if (p.acwrThresholds) {
    const t = p.acwrThresholds;
    parts.push(`seuils ${t.low} / ${t.optimalMax} / ${t.cautionMax}`);
  }
  if (p.weeklyLookbackWeeks) parts.push(`réf. ${p.weeklyLookbackWeeks} sem.`);
  return parts.length ? parts.join(' · ') : 'paramètres par défaut';
}
