import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import * as db from '../lib/db';
import { DEFAULT_LOAD_CONTEXT, type LoadContext } from '../lib/loadModels';
import type { LoadModel, TeamLoadModel } from '../lib/types';

/**
 * Catalogue des modèles de charge et historique des choix de l'équipe, chargés
 * une fois pour toute l'application.
 *
 * Ils sont montés au-dessus des écrans et non lus écran par écran, parce que
 * tout chiffre affiché en dépend : une page qui oublierait de passer le
 * contexte n'afficherait pas une erreur, elle afficherait silencieusement les
 * chiffres du modèle par défaut. Un contexte React rend cet oubli impossible.
 *
 * Le catalogue voyage avec, pour que le formulaire de saisie sache quels
 * champs demander sans payer une requête supplémentaire au moment où le joueur
 * ouvre l'écran — c'est justement là que chaque milliseconde coûte une saisie.
 */
export interface LoadModelsState {
  ctx: LoadContext;
  /** Tous les choix datés de l'équipe, du plus ancien au plus récent. */
  history: TeamLoadModel[];
  /** Catalogue fermé, en lecture seule. */
  catalog: LoadModel[];
  loading: boolean;
  error: string | null;
}

const EMPTY: LoadModelsState = {
  ctx: DEFAULT_LOAD_CONTEXT,
  history: [],
  catalog: [],
  loading: false,
  error: null,
};

const LoadModelsContext = createContext<LoadModelsState>(EMPTY);

export function LoadModelsProvider({ children }: { children: ReactNode }) {
  const { user, revision } = useAuth();
  const teamId = user?.teamId ?? null;
  const signedIn = Boolean(user);
  // `loading` part à vrai dès qu'il y a quelque chose à charger : sans cela les
  // écrans afficheraient d'abord les chiffres du modèle par défaut, puis les
  // vrais, et le staff verrait ses courbes sauter au chargement.
  const [state, setState] = useState<LoadModelsState>(() => ({
    ...EMPTY,
    loading: signedIn,
  }));

  useEffect(() => {
    if (!signedIn) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    Promise.all([db.getLoadModelCatalog(), db.getTeamLoadContext(teamId)]).then(
      ([catalog, ctx]) => {
        if (cancelled) return;
        setState({ ctx, history: flatten(ctx), catalog, loading: false, error: null });
      },
      (err: unknown) => {
        if (cancelled) return;
        setState({
          ...EMPTY,
          error: err instanceof Error ? err.message : 'Modèles de charge indisponibles.',
        });
      },
    );

    return () => {
      cancelled = true;
    };
    // `revision` est incrémenté à chaque mutation : enregistrer un modèle
    // depuis l'écran de configuration recharge donc tout le reste de l'app.
  }, [signedIn, teamId, revision]);

  return <LoadModelsContext.Provider value={state}>{children}</LoadModelsContext.Provider>;
}

/** Historique à plat, ordre chronologique, tous domaines confondus. */
function flatten(ctx: LoadContext): TeamLoadModel[] {
  return [...ctx.field, ...ctx.strength].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
}

export function useLoadModels(): LoadModelsState {
  return useContext(LoadModelsContext);
}

/** Raccourci pour les écrans qui n'ont besoin que de calculer. */
export function useLoadContext(): LoadContext {
  return useContext(LoadModelsContext).ctx;
}
