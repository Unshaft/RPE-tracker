import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Header, Main } from '../../components/Layout';
import { Card, EmptyState, Loading, Section, StatusBadge } from '../../components/ui';
import { useLoadModels } from '../../components/loadContext';
import {
  DOMAIN_HINT,
  DOMAIN_LABEL,
  MODEL_COPY,
  playerInputLabels,
  draftFromParams,
  paramsSummary,
  validateParams,
  type ParamsDraft,
} from '../../components/loadModelInfo';
import { useAuth } from '../../lib/auth';
import { longDate, today } from '../../lib/date';
import * as db from '../../lib/db';
import {
  DEFAULT_LOAD_PARAMS,
  LOAD_DOMAINS,
  LOAD_PARAM_RANGES,
  resolveLoadModel,
  type LoadContext,
} from '../../lib/loadModels';
import type {
  LoadDomain,
  LoadModel,
  LoadModelCode,
  ResolvedLoadParams,
  TeamLoadModel,
} from '../../lib/types';

/**
 * Configuration des modèles de charge de l'équipe.
 *
 * Trois choses que cet écran doit faire comprendre sans que le coach ait à
 * lire une documentation :
 *  1. changer de modèle ne réécrit pas les courbes passées — c'est
 *     contre-intuitif, et c'est ce qui autorise à essayer ;
 *  2. chaque modèle a une source citable : c'est l'argument qui tient face au
 *     préparateur physique du club ;
 *  3. un modèle plus riche se paie en champs de saisie côté joueur, donc en
 *     taux de complétion. Le coût est annoncé avant de valider, pas après.
 */
export function LoadModelSettings() {
  const { team } = useAuth();
  const { ctx, history, catalog, loading, error } = useLoadModels();

  if (!team) {
    return (
      <Shell>
        <Card>
          <EmptyState title="Aucune équipe">
            Crée ton équipe depuis ton profil pour configurer ses modèles de charge.
          </EmptyState>
        </Card>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell subtitle={team.name}>
        <Card>
          <Loading label="Chargement du catalogue…" />
        </Card>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell subtitle={team.name}>
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      </Shell>
    );
  }

  return (
    <>
      <Header title="Modèles de charge" subtitle={team.name} />
      <Main>
        <div style={{ paddingTop: 14 }}>
          <div className="alert alert--info">
            <strong>Changer de modèle ne réécrit pas le passé.</strong> Chaque choix porte une date
            d’effet : les séances antérieures continuent d’être calculées avec le modèle qui avait
            cours ce jour-là. Une courbe de novembre gardera la forme que le staff lui a vue.
          </div>
        </div>

        {/* Terrain et musculation sont deux reglages independants qu'on compare
            en les lisant l'un a cote de l'autre. Empiles, le second passe sous
            la ligne de flottaison et se regle a l'aveugle. */}
        <div className="pair">
          {LOAD_DOMAINS.map((domain) => (
            <DomainCard
              key={domain}
              domain={domain}
              teamId={team.id}
              ctx={ctx}
              catalog={catalog}
              history={history}
            />
          ))}
        </div>

        <HistorySection history={history} catalog={catalog} />
      </Main>
    </>
  );
}

function Shell({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <>
      <Header title="Modèles de charge" subtitle={subtitle} />
      <Main>
        <div style={{ paddingTop: 24 }}>{children}</div>
      </Main>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Un domaine = un formulaire indépendant
 * ------------------------------------------------------------------ */

function DomainCard({
  domain,
  teamId,
  ctx,
  catalog,
  history,
}: {
  domain: LoadDomain;
  teamId: string;
  ctx: LoadContext;
  catalog: LoadModel[];
  history: TeamLoadModel[];
}) {
  const ref = today();
  const effective = resolveLoadModel(ctx, domain, ref);
  const models = catalog.filter((m) => m.domain === domain);
  const current = models.find((m) => m.code === effective.modelCode);

  // Le formulaire est remonté après chaque enregistrement : ses valeurs
  // initiales décrivent l'état en vigueur, elles doivent donc repartir de
  // l'historique rechargé plutôt que de rester figées sur la saisie précédente.
  const formKey = `${domain}:${history.length}:${effective.modelCode}:${effective.effectiveFrom}`;

  return (
    <Section title={`Charge ${DOMAIN_LABEL[domain].toLowerCase()}`}>
      <Card
        title={current?.label ?? effective.modelCode}
        hint={DOMAIN_HINT[domain]}
        action={
          <StatusBadge status={effective.effectiveFrom ? 'good' : 'neutral'}>
            {effective.effectiveFrom ? 'Configuré' : 'Par défaut'}
          </StatusBadge>
        }
      >
        {current && <Reference reference={current.reference} />}
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          {MODEL_COPY[effective.modelCode].what}
        </p>
        <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>
          {effective.effectiveFrom
            ? `En vigueur depuis le ${longDate(effective.effectiveFrom)}.`
            : 'Aucun choix enregistré : c’est le modèle par défaut du catalogue qui s’applique.'}
        </p>
      </Card>

      <DomainForm
        key={formKey}
        domain={domain}
        teamId={teamId}
        models={models}
        initialCode={effective.modelCode}
        initialParams={domain === 'field' ? effective.params : undefined}
      />
    </Section>
  );
}

/** La référence bibliographique est un argument, pas une mention légale. */
function Reference({ reference }: { reference: string }) {
  if (!reference) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        marginTop: 2,
        flexWrap: 'wrap',
      }}
    >
      <span className="tag">Source</span>
      <cite
        style={{
          fontStyle: 'normal',
          fontSize: 13.5,
          fontWeight: 640,
          color: 'var(--text-primary)',
        }}
      >
        {reference}
      </cite>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Paramètres : saisis en texte, validés à la frappe
 * ------------------------------------------------------------------ */

function NumberField({
  label,
  hint,
  value,
  onChange,
  error,
  min,
  max,
  step = 1,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  min: number;
  max: number;
  step?: number;
}) {
  const id = `p-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={error ? 'input input--invalid' : 'input'}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <span className="field__error" id={`${id}-err`} role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="field__hint">{hint}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Formulaire d'un domaine
 * ------------------------------------------------------------------ */

function DomainForm({
  domain,
  teamId,
  models,
  initialCode,
  initialParams,
}: {
  domain: LoadDomain;
  teamId: string;
  models: LoadModel[];
  initialCode: LoadModelCode;
  /** Absent pour la musculation : ses paramètres d'analyse ne sont pas lus. */
  initialParams?: ResolvedLoadParams;
}) {
  const [code, setCode] = useState<LoadModelCode>(initialCode);
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [draft, setDraft] = useState<ParamsDraft>(() =>
    draftFromParams(initialParams ?? DEFAULT_LOAD_PARAMS),
  );
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { refresh } = useAuth();

  const editsParams = domain === 'field';
  const { params, errors } = useMemo(() => validateParams(draft), [draft]);
  const invalid = editsParams && Object.keys(errors).length > 0;
  const selected = models.find((m) => m.code === code);
  const inPast = effectiveFrom < today();

  function set<K extends keyof ParamsDraft>(key: K, value: ParamsDraft[K]) {
    setSaved(false);
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || invalid) return;
    setBusy(true);
    setSaveError(null);
    try {
      await db.setTeamLoadModel({
        teamId,
        domain,
        modelCode: code,
        // Les paramètres d'analyse ne sont lus que sur la ligne `field` : en
        // écrire sur la ligne muscu laisserait croire qu'ils comptent.
        params: editsParams ? params : undefined,
        effectiveFrom,
      });
      setSaved(true);
      refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card title="Choisir un modèle">
        <div className="stack" role="radiogroup" aria-label={`Modèle ${DOMAIN_LABEL[domain]}`}>
          {models.map((m) => (
            <ModelOption
              key={m.code}
              model={m}
              checked={code === m.code}
              onSelect={() => {
                setCode(m.code);
                setSaved(false);
              }}
            />
          ))}
        </div>
      </Card>

      {selected && !MODEL_COPY[selected.code].noExtraInput && (
        <div className="alert alert--info" style={{ marginTop: 10 }}>
          Ce modèle ajoute des champs au formulaire de tes joueurs. Le RPE et la durée restent
          demandés et enregistrés dans tous les cas : tu peux revenir en arrière sans perdre
          l’exploitabilité de l’historique.
        </div>
      )}

      <Card
        title="Date d’effet"
        hint="Le modèle s’applique aux séances datées à partir de ce jour."
      >
        <div className="field">
          <label className="field__label" htmlFor={`eff-${domain}`}>
            À partir du
          </label>
          <input
            id={`eff-${domain}`}
            className="input"
            type="date"
            value={effectiveFrom}
            onChange={(e) => {
              setEffectiveFrom(e.target.value);
              setSaved(false);
            }}
          />
          <span className="field__hint">
            {inPast
              ? 'Date passée : les séances déjà saisies depuis ce jour seront recalculées avec ce modèle.'
              : 'Les séances antérieures gardent le modèle qui avait cours à leur date.'}
          </span>
        </div>
      </Card>

      {editsParams ? (
        <Card
          title="Paramètres d’analyse"
          hint="Fenêtres, seuils et profondeur de référence utilisés par l’ACWR et le ratio hebdomadaire."
        >
          <div className="grid-2">
            <NumberField
              label="Fenêtre aiguë (jours)"
              hint={`${LOAD_PARAM_RANGES.acuteWindowDays.min} à ${LOAD_PARAM_RANGES.acuteWindowDays.max}`}
              value={draft.acuteWindowDays}
              onChange={(v) => set('acuteWindowDays', v)}
              error={errors.acuteWindowDays}
              min={LOAD_PARAM_RANGES.acuteWindowDays.min}
              max={LOAD_PARAM_RANGES.acuteWindowDays.max}
            />
            <NumberField
              label="Fenêtre chronique (jours)"
              hint={`${LOAD_PARAM_RANGES.chronicWindowDays.min} à ${LOAD_PARAM_RANGES.chronicWindowDays.max}`}
              value={draft.chronicWindowDays}
              onChange={(v) => set('chronicWindowDays', v)}
              error={errors.chronicWindowDays}
              min={LOAD_PARAM_RANGES.chronicWindowDays.min}
              max={LOAD_PARAM_RANGES.chronicWindowDays.max}
            />
          </div>

          <div className="field" style={{ marginTop: 10 }}>
            <label className="field__label" htmlFor="chronic-method">
              Méthode chronique
            </label>
            <select
              id="chronic-method"
              className="input"
              value={draft.chronicMethod}
              onChange={(e) => set('chronicMethod', e.target.value as ParamsDraft['chronicMethod'])}
            >
              <option value="rolling_average">Moyenne glissante (Gabbett)</option>
              <option value="ewma">Moyenne exponentielle — EWMA (Williams et al., 2017)</option>
            </select>
            <span className="field__hint">
              L’EWMA fait décroître progressivement le poids des séances anciennes, au lieu de les
              oublier d’un coup à la fin de la fenêtre.
            </span>
          </div>

          <div className="field" style={{ marginTop: 10 }}>
            <span className="field__label">Seuils de lecture du ratio</span>
            <span className="field__hint">
              Sous-charge en dessous du premier seuil, zone optimale jusqu’au deuxième, vigilance
              jusqu’au troisième, risque élevé au-delà. Les trois doivent rester strictement
              croissants.
            </span>
          </div>
          <div
            className="grid-2"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))' }}
          >
            <NumberField
              label="Sous-charge <"
              value={draft.low}
              onChange={(v) => set('low', v)}
              error={errors.low}
              min={0}
              max={3}
              step={0.05}
            />
            <NumberField
              label="Optimal ≤"
              value={draft.optimalMax}
              onChange={(v) => set('optimalMax', v)}
              error={errors.optimalMax}
              min={0}
              max={3}
              step={0.05}
            />
            <NumberField
              label="Vigilance ≤"
              value={draft.cautionMax}
              onChange={(v) => set('cautionMax', v)}
              error={errors.cautionMax}
              min={0}
              max={3}
              step={0.05}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            <NumberField
              label="Semaines de référence (ratio hebdo)"
              hint={`${LOAD_PARAM_RANGES.weeklyLookbackWeeks.min} à ${LOAD_PARAM_RANGES.weeklyLookbackWeeks.max} semaines`}
              value={draft.weeklyLookbackWeeks}
              onChange={(v) => set('weeklyLookbackWeeks', v)}
              error={errors.weeklyLookbackWeeks}
              min={LOAD_PARAM_RANGES.weeklyLookbackWeeks.min}
              max={LOAD_PARAM_RANGES.weeklyLookbackWeeks.max}
            />
          </div>
        </Card>
      ) : (
        <div className="alert alert--info" style={{ marginTop: 10 }}>
          <strong>Pas de paramètres d’analyse ici.</strong> Un ACWR ou un ratio hebdomadaire porte
          sur la charge totale d’un joueur, terrain et musculation confondues : deux fenêtres
          concurrentes n’auraient pas de sens. Les fenêtres, seuils et semaines de référence
          appliqués sont donc ceux réglés au-dessus, sur la charge terrain.
        </div>
      )}

      {saveError && (
        <div className="alert alert--error" style={{ marginTop: 10 }} role="alert">
          {saveError}
        </div>
      )}
      {saved && !saveError && (
        <div className="alert alert--success" style={{ marginTop: 10 }} role="status">
          Modèle enregistré. Les écrans repartent de ce choix à partir du {longDate(effectiveFrom)}.
        </div>
      )}

      <div className="stack" style={{ marginTop: 12 }}>
        <button className="btn" type="submit" disabled={busy || invalid}>
          {busy ? 'Enregistrement…' : `Enregistrer le modèle ${DOMAIN_LABEL[domain].toLowerCase()}`}
        </button>
        {invalid && (
          <span className="field__error" role="alert">
            Corrige les paramètres signalés avant d’enregistrer.
          </span>
        )}
      </div>
    </form>
  );
}

function ModelOption({
  model,
  checked,
  onSelect,
}: {
  model: LoadModel;
  checked: boolean;
  onSelect: () => void;
}) {
  const copy = MODEL_COPY[model.code];
  const inputs = playerInputLabels(model.inputSchema);
  return (
    <label
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 10,
        padding: 12,
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
        background: checked ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      <input
        type="radio"
        name={`model-${model.domain}`}
        checked={checked}
        onChange={onSelect}
        style={{ marginTop: 3, accentColor: 'var(--accent)' }}
      />
      <span>
        <span style={{ display: 'block', fontWeight: 660, fontSize: 14.5 }}>{model.label}</span>
        <Reference reference={model.reference} />
        <span
          style={{
            display: 'block',
            marginTop: 6,
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          {copy.what}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 6,
            fontSize: 12.5,
            color: copy.noExtraInput ? 'var(--text-muted)' : 'var(--status-warning-ink)',
          }}
        >
          <strong style={{ fontWeight: 640 }}>Côté joueur :</strong> {copy.asks}
        </span>
        {inputs.length > 0 && (
          <span
            className="chips"
            style={{ marginTop: 6, gap: 6 }}
            aria-label="Champs demandés au joueur"
          >
            {inputs.map((label) => (
              <span key={label} className="tag">
                {label}
              </span>
            ))}
          </span>
        )}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Historique
 * ------------------------------------------------------------------ */

function HistorySection({ history, catalog }: { history: TeamLoadModel[]; catalog: LoadModel[] }) {
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // Du plus récent au plus ancien : c'est la dernière décision qu'on relit.
  const rows = useMemo(
    () => history.slice().sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [history],
  );

  async function remove(entry: TeamLoadModel) {
    if (!confirm(`Supprimer le choix du ${longDate(entry.effectiveFrom)} ?`)) return;
    try {
      await db.deleteTeamLoadModel(entry.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  return (
    <Section title="Historique des modèles">
      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      <Card flush hint="Chaque ligne reste vraie pour les séances de sa période.">
        {rows.length === 0 ? (
          <EmptyState title="Aucun choix enregistré">
            L’équipe utilise les modèles par défaut du catalogue : session-RPE de Foster, terrain
            comme musculation.
          </EmptyState>
        ) : (
          <div className="list">
            {rows.map((entry) => {
              const model = catalog.find((m) => m.code === entry.modelCode);
              return (
                <div key={entry.id} className="list__row" style={{ cursor: 'default' }}>
                  <div className="list__body">
                    <div className="list__title">
                      {DOMAIN_LABEL[entry.domain]} · {model?.label ?? entry.modelCode}
                    </div>
                    <div className="list__sub">
                      Depuis le {longDate(entry.effectiveFrom)}
                      {model?.reference ? ` · ${model.reference}` : ''}
                    </div>
                    <div className="list__sub">
                      {entry.domain === 'field'
                        ? paramsSummary(entry.params)
                        : 'paramètres d’analyse non lus pour ce domaine'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => remove(entry)}
                  >
                    Retirer
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </Section>
  );
}
