import type {
  LoadDomain,
  LoadModelCode,
  LoadModelParams,
  ResolvedLoadParams,
  SessionType,
  TeamLoadModel,
  TrainingSession,
} from './types';

/**
 * Catalogue des modèles de charge et résolution du modèle applicable.
 *
 * Trois règles portent tout ce fichier :
 *
 *  1. rien n'est persisté. Une charge est toujours recalculée depuis les
 *     entrées brutes, ce qui veut dire qu'un changement de modèle se voit
 *     immédiatement sur tout l'historique, sans migration ;
 *  2. le catalogue est fermé. Pas d'éditeur de formule : un coach choisit
 *     parmi des modèles publiés, pour qu'on puisse toujours citer la source ;
 *  3. un choix est daté. La résolution se fait séance par séance, à la date de
 *     la séance, jamais à la date du jour — sans quoi changer de modèle en
 *     novembre réécrirait rétroactivement la saison entière.
 */

export const LOAD_DOMAINS: LoadDomain[] = ['field', 'strength'];

/**
 * Le domaine se déduit du type de séance, il n'est pas saisi.
 *
 * La musculation est isolée parce que son tonnage se compte en kilos soulevés,
 * pas en unités RPE × minutes : les deux ne se comparent pas.
 */
export function domainForType(type: SessionType): LoadDomain {
  return type === 'muscu' ? 'strength' : 'field';
}

/**
 * Modèle retenu quand une équipe n'a rien configuré. Ce sont exactement les
 * formules d'avant l'introduction des modèles : une équipe existante ne doit
 * voir aucun chiffre bouger.
 */
export const DEFAULT_MODEL_BY_DOMAIN: Record<LoadDomain, LoadModelCode> = {
  field: 'foster_srpe',
  strength: 'foster_srpe_strength',
};

export const DEFAULT_LOAD_PARAMS: ResolvedLoadParams = {
  acuteWindowDays: 7,
  chronicWindowDays: 28,
  chronicMethod: 'rolling_average',
  acwrThresholds: { low: 0.8, optimalMax: 1.3, cautionMax: 1.5 },
  weeklyLookbackWeeks: 4,
};

/** Plages admises, reprises telles quelles des `check` de la base. */
export const LOAD_PARAM_RANGES = {
  acuteWindowDays: { min: 3, max: 14 },
  chronicWindowDays: { min: 14, max: 56 },
  weeklyLookbackWeeks: { min: 2, max: 8 },
} as const;

export function resolveParams(params: LoadModelParams | undefined): ResolvedLoadParams {
  return {
    ...DEFAULT_LOAD_PARAMS,
    ...params,
    acwrThresholds: params?.acwrThresholds ?? DEFAULT_LOAD_PARAMS.acwrThresholds,
  };
}

/**
 * Historique des choix d'une équipe, un domaine à la fois.
 *
 * On porte l'historique complet et non le seul modèle courant : c'est la seule
 * façon de recalculer une courbe telle qu'elle se présentait au moment où le
 * staff l'a lue.
 */
export type LoadContext = Readonly<Record<LoadDomain, readonly TeamLoadModel[]>>;

/** Aucune configuration : tout retombe sur les modèles et paramètres par défaut. */
export const DEFAULT_LOAD_CONTEXT: LoadContext = { field: [], strength: [] };

export function buildLoadContext(models: TeamLoadModel[]): LoadContext {
  const byDomain: Record<LoadDomain, TeamLoadModel[]> = { field: [], strength: [] };
  for (const m of models) byDomain[m.domain].push(m);
  // Tri croissant : la résolution parcourt à rebours pour trouver la dernière
  // date d'effet antérieure ou égale à la séance.
  for (const domain of LOAD_DOMAINS) {
    byDomain[domain].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }
  return byDomain;
}

export interface EffectiveLoadModel {
  domain: LoadDomain;
  modelCode: LoadModelCode;
  params: ResolvedLoadParams;
  /** `null` quand rien n'est configuré : c'est le modèle par défaut qui parle. */
  effectiveFrom: string | null;
}

/** Modèle en vigueur pour un domaine à une date donnée. */
export function resolveLoadModel(
  context: LoadContext,
  domain: LoadDomain,
  date: string,
): EffectiveLoadModel {
  const history = context[domain];
  for (let i = history.length - 1; i >= 0; i--) {
    const candidate = history[i];
    if (candidate.effectiveFrom <= date) {
      return {
        domain,
        modelCode: candidate.modelCode,
        params: resolveParams(candidate.params),
        effectiveFrom: candidate.effectiveFrom,
      };
    }
  }
  return {
    domain,
    modelCode: DEFAULT_MODEL_BY_DOMAIN[domain],
    params: DEFAULT_LOAD_PARAMS,
    effectiveFrom: null,
  };
}

/**
 * Paramètres d'analyse (fenêtres, seuils, profondeur d'historique) retenus pour
 * une lecture à la date `date`.
 *
 * Le contrat attache les paramètres à chaque ligne `team_load_models`, donc
 * potentiellement une fois par domaine. Or une fenêtre aiguë, un ACWR ou un
 * ratio hebdomadaire portent sur la charge totale du joueur, terrain et muscu
 * confondus : deux fenêtres concurrentes n'auraient pas de sens. On retient
 * donc celles du domaine `field`, qui est le domaine de référence du suivi.
 */
export function analysisParams(context: LoadContext, date: string): ResolvedLoadParams {
  return resolveLoadModel(context, 'field', date).params;
}

/** Entrées nécessaires au calcul d'une séance, quel que soit le modèle. */
export type LoadInput = Pick<TrainingSession, 'rpe' | 'durationMin' | 'type' | 'date'> &
  Pick<Partial<TrainingSession>, 'inputs'>;

/**
 * Applique une formule du catalogue.
 *
 * Les entrées manquantes ne font pas échouer le calcul : une séance saisie
 * avant un changement de modèle n'a évidemment pas les champs du nouveau
 * modèle. Les deux retombées sont assumées et différentes :
 *  - le sRPE différencié retombe sur le RPE global, qui en est la meilleure
 *    approximation disponible ;
 *  - le volume-load retombe sur 0, parce qu'aucun tonnage n'a été saisi et
 *    qu'inventer une charge à partir d'un RPE serait un mensonge. C'est
 *    précisément ce que la date d'effet sert à éviter.
 */
export function applyLoadModel(code: LoadModelCode, session: LoadInput): number {
  switch (code) {
    case 'foster_srpe':
    case 'foster_srpe_strength':
      return session.rpe * session.durationMin;
    case 'srpe_differentiated': {
      const breathing = session.inputs?.rpeBreathing ?? session.rpe;
      const muscular = session.inputs?.rpeMuscular ?? session.rpe;
      return ((breathing + muscular) / 2) * session.durationMin;
    }
    case 'volume_load':
      return (session.inputs?.exercises ?? []).reduce(
        (total, e) => total + e.sets * e.reps * e.weightKg,
        0,
      );
  }
}

/** Charge d'une séance, avec le modèle en vigueur à sa date pour son domaine. */
export function loadForSession(
  session: LoadInput,
  context: LoadContext = DEFAULT_LOAD_CONTEXT,
): number {
  const model = resolveLoadModel(context, domainForType(session.type), session.date);
  return applyLoadModel(model.modelCode, session);
}
