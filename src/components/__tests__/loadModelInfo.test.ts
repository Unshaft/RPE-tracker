import { describe, expect, it } from 'vitest';
import { DEFAULT_LOAD_PARAMS } from '../../lib/loadModels';
import type { LoadModelInputSchema } from '../../lib/types';
import {
  MODEL_COPY,
  modelInputKeys,
  playerInputLabels,
  draftFromParams,
  paramsSummary,
  validateParams,
  type ParamsDraft,
} from '../loadModelInfo';

function draft(patch: Partial<ParamsDraft> = {}): ParamsDraft {
  return { ...draftFromParams(DEFAULT_LOAD_PARAMS), ...patch };
}

describe('draftFromParams', () => {
  it('repart des paramètres en vigueur sans les reformater', () => {
    expect(draftFromParams(DEFAULT_LOAD_PARAMS)).toEqual({
      acuteWindowDays: '7',
      chronicWindowDays: '28',
      chronicMethod: 'rolling_average',
      low: '0.8',
      optimalMax: '1.3',
      cautionMax: '1.5',
      weeklyLookbackWeeks: '4',
    });
  });

  it('fait l’aller-retour sans rien perdre', () => {
    const { params, errors } = validateParams(draftFromParams(DEFAULT_LOAD_PARAMS));
    expect(errors).toEqual({});
    expect(params).toEqual(DEFAULT_LOAD_PARAMS);
  });
});

describe('validateParams', () => {
  it('accepte les bornes extremes du contrat', () => {
    const { errors } = validateParams(
      draft({ acuteWindowDays: '3', chronicWindowDays: '56', weeklyLookbackWeeks: '8' }),
    );
    expect(errors).toEqual({});
  });

  it('refuse une fenêtre aiguë hors plage, avec un message chiffre', () => {
    const { errors } = validateParams(draft({ acuteWindowDays: '15' }));
    expect(errors.acuteWindowDays).toBe('Entre 3 et 14 jours.');
  });

  it('refuse une fenêtre chronique hors plage', () => {
    expect(validateParams(draft({ chronicWindowDays: '13' })).errors.chronicWindowDays).toBe(
      'Entre 14 et 56 jours.',
    );
  });

  it('refuse une profondeur de reference hors plage', () => {
    expect(validateParams(draft({ weeklyLookbackWeeks: '9' })).errors.weeklyLookbackWeeks).toBe(
      'Entre 2 et 8 semaines.',
    );
  });

  it('refuse une fenêtre non entiere', () => {
    expect(validateParams(draft({ acuteWindowDays: '7.5' })).errors.acuteWindowDays).toBe(
      'Nombre entier attendu.',
    );
  });

  it('ne lit pas un champ vide comme un zero', () => {
    const { errors } = validateParams(draft({ chronicWindowDays: '' }));
    expect(errors.chronicWindowDays).toBe('Valeur manquante.');
  });

  it('refuse des seuils non strictement croissants', () => {
    const { errors } = validateParams(draft({ low: '1.3', optimalMax: '1.3' }));
    expect(errors.optimalMax).toBe('Doit être strictement supérieur à 1.3.');
  });

  it('refuse un seuil de vigilance sous le seuil optimal', () => {
    const { errors } = validateParams(draft({ optimalMax: '1.4', cautionMax: '1.2' }));
    expect(errors.cautionMax).toBe('Doit être strictement supérieur à 1.4.');
  });

  it('accepte des seuils deplaces mais croissants', () => {
    const { params, errors } = validateParams(
      draft({ low: '0.9', optimalMax: '1.2', cautionMax: '1.35' }),
    );
    expect(errors).toEqual({});
    expect(params.acwrThresholds).toEqual({ low: 0.9, optimalMax: 1.2, cautionMax: 1.35 });
  });

  it('borne les seuils a 0-3', () => {
    expect(validateParams(draft({ cautionMax: '3.5' })).errors.cautionMax).toBe('Entre 0 et 3.');
  });

  it('transmet la methode chronique telle quelle', () => {
    expect(validateParams(draft({ chronicMethod: 'ewma' })).params.chronicMethod).toBe('ewma');
  });

  it('retombe sur le défaut pour un champ invalide, sans propager NaN', () => {
    const { params } = validateParams(draft({ acuteWindowDays: 'abc' }));
    expect(params.acuteWindowDays).toBe(DEFAULT_LOAD_PARAMS.acuteWindowDays);
  });
});

describe('paramsSummary', () => {
  it('annonce le défaut quand rien n’est surcharge', () => {
    expect(paramsSummary({})).toBe('paramètres par défaut');
  });

  it('resume les surcharges enregistrees', () => {
    expect(paramsSummary({ acuteWindowDays: 5, chronicMethod: 'ewma' })).toBe(
      'aiguë 5 j · EWMA',
    );
  });
});

describe('MODEL_COPY', () => {
  it('couvre tout le catalogue ferme', () => {
    expect(Object.keys(MODEL_COPY).sort()).toEqual([
      'foster_srpe',
      'foster_srpe_strength',
      'srpe_differentiated',
      'volume_load',
    ]);
  });

  it('ne declare « sans champ supplementaire » que pour les modèles par défaut', () => {
    const sansSurcout = Object.entries(MODEL_COPY)
      .filter(([, c]) => c.noExtraInput)
      .map(([code]) => code)
      .sort();
    expect(sansSurcout).toEqual(['foster_srpe', 'foster_srpe_strength']);
  });
});


/* Schémas repris tels quels de la migration du catalogue. */
const SCHEMA_FOSTER: LoadModelInputSchema = {
  fields: [
    { key: 'rpe', source: 'column', type: 'integer', min: 1, max: 10, required: true },
    { key: 'duration_min', source: 'column', type: 'integer', min: 1, max: 600, required: true },
  ],
};
const SCHEMA_DIFF: LoadModelInputSchema = {
  fields: [
    { key: 'rpe_breathing', source: 'inputs', type: 'integer', min: 1, max: 10, required: true },
    { key: 'rpe_muscular', source: 'inputs', type: 'integer', min: 1, max: 10, required: true },
    { key: 'duration_min', source: 'column', type: 'integer', min: 1, max: 600, required: true },
  ],
};
const SCHEMA_VOLUME: LoadModelInputSchema = {
  fields: [{ key: 'exercises', source: 'inputs', type: 'array', required: true }],
};

describe('playerInputLabels', () => {
  it('n’ajoute rien au formulaire actuel pour le session-RPE', () => {
    expect(playerInputLabels(SCHEMA_FOSTER)).toEqual(['RPE global (1-10)', 'Durée (minutes)']);
  });

  it('remplace le RPE global par les deux notes du sRPE différencié', () => {
    expect(playerInputLabels(SCHEMA_DIFF)).toEqual([
      'RPE respiratoire (1-10)',
      'RPE musculaire (1-10)',
      'Durée (minutes)',
    ]);
  });

  it('garde le RPE et la durée sous volume-load, en plus du tonnage', () => {
    // Regle produit : `rpe` est `not null` et l'historique doit rester
    // exploitable apres un changement de modele.
    expect(playerInputLabels(SCHEMA_VOLUME)).toEqual([
      'RPE global (1-10)',
      'Durée (minutes)',
      'Liste d’exercices (séries × répétitions × kilos)',
    ]);
  });
});

describe('modelInputKeys', () => {
  it('lit le catalogue quand il est charge', () => {
    const catalog = [
      {
        code: 'volume_load' as const,
        domain: 'strength' as const,
        label: 'Volume-load',
        reference: 'Peterson et al., 2011',
        inputSchema: SCHEMA_VOLUME,
        isDefault: false,
      },
    ];
    expect(modelInputKeys(catalog, 'volume_load')).toEqual(['exercises']);
  });

  it('retombe sur un repli fidele quand le catalogue manque', () => {
    expect(modelInputKeys([], 'srpe_differentiated')).toEqual([
      'rpe_breathing',
      'rpe_muscular',
      'duration_min',
    ]);
  });
});
