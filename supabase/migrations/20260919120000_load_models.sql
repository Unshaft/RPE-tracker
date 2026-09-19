-- Modèles de charge configurables par équipe.
--
-- Jusqu'ici la charge d'une séance était `rpe × duration_min`, codé en dur dans
-- le front. Une équipe doit pouvoir choisir sa formule dans un catalogue fermé,
-- issu de la littérature, sans qu'aucune charge ne soit jamais persistée :
-- seules les entrées saisies le sont, le calcul reste fait à la lecture. Un
-- changement de modèle relit donc tout l'historique, sans migration de données.
--
-- Deux domaines indépendants, parce que charge terrain et charge musculation ne
-- sont pas dans la même unité : `field` (entrainement, match, individuel,
-- recuperation) et `strength` (muscu).

-- --------------------------------------------------------------------------
-- Catalogue des modèles
-- --------------------------------------------------------------------------

create table public.load_models (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{2,39}$'),
  domain text not null check (domain in ('field', 'strength')),
  label text not null check (length(trim(label)) between 1 and 80),
  -- Citation de la littérature : le staff doit pouvoir remonter à la source.
  reference text not null default '',
  -- Décrit les champs à demander au joueur ; c'est ce qui pilote le formulaire
  -- de saisie côté front, pour qu'ajouter un modèle ne demande pas de `switch`
  -- supplémentaire dans l'UI.
  input_schema jsonb not null default '{}'::jsonb
    check (jsonb_typeof(input_schema) = 'object'),
  is_default boolean not null default false,
  -- Cible de la clé étrangère composite de `team_load_models` : c'est elle qui
  -- rend structurellement impossible de ranger un modèle muscu en `field`.
  unique (code, domain)
);

-- Un seul modèle par défaut par domaine, sinon « le modèle par défaut » ne veut
-- plus rien dire au moment où une équipe n'a rien configuré.
create unique index load_models_default_par_domaine_idx
  on public.load_models (domain)
  where is_default;

insert into public.load_models (code, domain, label, reference, is_default, input_schema) values
  (
    'foster_srpe', 'field', 'Session-RPE (Foster)', 'Foster et al., 1998', true,
    '{"fields": [
        {"key": "rpe", "source": "column", "type": "integer", "min": 1, "max": 10, "required": true},
        {"key": "duration_min", "source": "column", "type": "integer", "min": 1, "max": 600, "required": true}
      ]}'::jsonb
  ),
  (
    'srpe_differentiated', 'field', 'sRPE différencié', 'Weston et al., 2015', false,
    '{"fields": [
        {"key": "rpe_breathing", "source": "inputs", "type": "integer", "min": 1, "max": 10, "required": true},
        {"key": "rpe_muscular", "source": "inputs", "type": "integer", "min": 1, "max": 10, "required": true},
        {"key": "duration_min", "source": "column", "type": "integer", "min": 1, "max": 600, "required": true}
      ]}'::jsonb
  ),
  (
    'foster_srpe_strength', 'strength', 'Session-RPE musculation', 'Foster et al., 1998', true,
    '{"fields": [
        {"key": "rpe", "source": "column", "type": "integer", "min": 1, "max": 10, "required": true},
        {"key": "duration_min", "source": "column", "type": "integer", "min": 1, "max": 600, "required": true}
      ]}'::jsonb
  ),
  (
    'volume_load', 'strength', 'Volume-load (tonnage)', 'Peterson et al., 2011', false,
    '{"fields": [
        {"key": "exercises", "source": "inputs", "type": "array", "required": true,
         "item": [
           {"key": "sets", "type": "integer", "min": 1, "max": 50},
           {"key": "reps", "type": "integer", "min": 1, "max": 200},
           {"key": "weight_kg", "type": "number", "min": 0, "max": 500}
         ]}
      ]}'::jsonb
  );

-- --------------------------------------------------------------------------
-- Validation des paramètres et des entrées
--
-- Le jsonb est pratique pour ne pas ajouter une colonne par paramètre, mais un
-- jsonb libre n'est pas un contrat : une faute de frappe dans une clé passerait
-- silencieusement et le calcul repartirait sur la valeur par défaut sans que
-- personne ne le voie. Ces fonctions ferment le jeu de clés et vérifient les
-- plages annoncées au staff. Elles sont IMMUTABLE parce qu'un `check` l'exige,
-- et n'accèdent à aucune table.
--
-- Contrairement aux fonctions d'appui aux policies, leur EXECUTE n'est pas
-- révoqué : un `check` est évalué avec les droits de celui qui écrit, et un
-- joueur doit donc pouvoir les exécuter pour enregistrer sa séance.
-- --------------------------------------------------------------------------

create or replace function private.est_nombre_dans(valeur jsonb, borne_min numeric, borne_max numeric)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select valeur is null
      or (jsonb_typeof(valeur) = 'number' and (valeur #>> '{}')::numeric between borne_min and borne_max);
$fn$;

create or replace function private.params_charge_valides(params jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  seuils jsonb;
  bas numeric;
  optimal numeric;
  vigilance numeric;
begin
  if jsonb_typeof(params) is distinct from 'object' then
    return false;
  end if;

  -- Toute clé inconnue est un refus : mieux vaut une erreur à l'écriture qu'un
  -- paramètre ignoré en silence pendant une saison.
  if params - array[
       'acute_window_days', 'chronic_window_days', 'chronic_method',
       'acwr_thresholds', 'weekly_lookback_weeks'
     ] <> '{}'::jsonb then
    return false;
  end if;

  if not private.est_nombre_dans(params -> 'acute_window_days', 3, 14) then return false; end if;
  if not private.est_nombre_dans(params -> 'chronic_window_days', 14, 56) then return false; end if;
  if not private.est_nombre_dans(params -> 'weekly_lookback_weeks', 2, 8) then return false; end if;

  if params ? 'chronic_method'
     and (params ->> 'chronic_method') not in ('rolling_average', 'ewma') then
    return false;
  end if;

  if params ? 'acwr_thresholds' then
    seuils := params -> 'acwr_thresholds';
    -- Les gardes sont imbriquees et non chainees par `or` : une expression
    -- booleenne n'evalue pas forcement ses termes de gauche a droite, et
    -- `jsonb - text[]` leve une exception sur autre chose qu'un objet.
    if jsonb_typeof(seuils) is distinct from 'object' then
      return false;
    end if;
    if seuils - array['low', 'optimal_max', 'caution_max'] <> '{}'::jsonb then
      return false;
    end if;
    if not (seuils ? 'low' and seuils ? 'optimal_max' and seuils ? 'caution_max') then
      return false;
    end if;
    if not (
      private.est_nombre_dans(seuils -> 'low', 0, 3)
      and private.est_nombre_dans(seuils -> 'optimal_max', 0, 3)
      and private.est_nombre_dans(seuils -> 'caution_max', 0, 3)
    ) then
      return false;
    end if;
    bas := (seuils #>> '{low}')::numeric;
    optimal := (seuils #>> '{optimal_max}')::numeric;
    vigilance := (seuils #>> '{caution_max}')::numeric;
    -- Des seuils non croissants produiraient une zone vide, jamais atteignable.
    if not (bas < optimal and optimal < vigilance) then
      return false;
    end if;
  end if;

  return true;
end;
$fn$;

create or replace function private.entrees_seance_valides(entrees jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  exercice jsonb;
begin
  if jsonb_typeof(entrees) is distinct from 'object' then
    return false;
  end if;

  if entrees - array['rpe_breathing', 'rpe_muscular', 'exercises'] <> '{}'::jsonb then
    return false;
  end if;

  if not private.est_nombre_dans(entrees -> 'rpe_breathing', 1, 10) then return false; end if;
  if not private.est_nombre_dans(entrees -> 'rpe_muscular', 1, 10) then return false; end if;

  if entrees ? 'exercises' then
    if jsonb_typeof(entrees -> 'exercises') is distinct from 'array' then
      return false;
    end if;
    -- Une liste d'exercices est une seance de muscu, pas un import de capteur :
    -- au-dela de 40 lignes c'est une saisie aberrante ou un abus.
    if jsonb_array_length(entrees -> 'exercises') > 40 then
      return false;
    end if;
    for exercice in select * from jsonb_array_elements(entrees -> 'exercises') loop
      if jsonb_typeof(exercice) is distinct from 'object' then
        return false;
      end if;
      if exercice - array['sets', 'reps', 'weight_kg'] <> '{}'::jsonb then
        return false;
      end if;
      if not (exercice ? 'sets' and exercice ? 'reps' and exercice ? 'weight_kg') then
        return false;
      end if;
      if not (
        private.est_nombre_dans(exercice -> 'sets', 1, 50)
        and private.est_nombre_dans(exercice -> 'reps', 1, 200)
        and private.est_nombre_dans(exercice -> 'weight_kg', 0, 500)
      ) then
        return false;
      end if;
    end loop;
  end if;

  return true;
end;
$fn$;

-- --------------------------------------------------------------------------
-- Choix d'une équipe, versionné par date d'effet
-- --------------------------------------------------------------------------

create table public.team_load_models (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  domain text not null check (domain in ('field', 'strength')),
  model_code text not null,
  -- Surcharges des paramètres d'analyse ; `{}` = les valeurs par défaut.
  params jsonb not null default '{}'::jsonb
    check (private.params_charge_valides(params)),
  -- Date d'effet, jamais rétroactive au-delà de ce que le coach assume : c'est
  -- elle qui permet d'expliquer la forme d'une courbe de novembre.
  effective_from date not null,
  created_at timestamptz not null default now(),
  -- Le couple (code, domaine) est repris du catalogue : impossible de rattacher
  -- `volume_load` au domaine terrain, la base le refuse.
  foreign key (model_code, domain) references public.load_models (code, domain),
  -- Deux modèles concurrents le même jour pour le même domaine : le « modèle en
  -- vigueur » deviendrait ambigu.
  unique (team_id, domain, effective_from)
);

-- La résolution se fait toujours « dernier modèle dont la date d'effet précède
-- la séance », pour une équipe et un domaine donnés.
create index team_load_models_lookup_idx
  on public.team_load_models (team_id, domain, effective_from desc);

-- --------------------------------------------------------------------------
-- Entrées additionnelles sur les séances
--
-- `rpe` et `duration_min` restent des colonnes à part entière : elles portent
-- leurs contraintes, leurs index et tout l'historique. `inputs` ne reçoit que
-- ce qui est propre aux modèles étendus.
-- --------------------------------------------------------------------------

alter table public.training_sessions
  add column inputs jsonb not null default '{}'::jsonb;

alter table public.training_sessions
  add constraint training_sessions_inputs_valides
  check (private.entrees_seance_valides(inputs));

-- --------------------------------------------------------------------------
-- Fonction d'appui
-- --------------------------------------------------------------------------

-- SECURITY DEFINER pour ne pas faire dépendre une policy de `team_load_models`
-- des policies de `teams` : la lisibilité de l'une ne doit pas conditionner
-- l'autre.
create or replace function private.entraine_equipe(equipe uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.teams
    where id = equipe and coach_id = (select auth.uid())
  );
$fn$;

revoke execute on function private.entraine_equipe(uuid) from public, anon;
grant execute on function private.entraine_equipe(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- RLS
-- --------------------------------------------------------------------------

alter table public.load_models enable row level security;
alter table public.team_load_models enable row level security;

-- Catalogue : lisible par tout compte connecté, écrit par personne. Aucune
-- policy d'écriture n'est créée, et les droits sont révoqués pour que même une
-- policy ajoutée par erreur plus tard ne suffise pas.
create policy load_models_select on public.load_models
  for select to authenticated
  using (true);

revoke insert, update, delete on public.load_models from anon, authenticated;
grant select on public.load_models to authenticated;

-- Le joueur lit le modèle de son équipe — son formulaire de saisie doit
-- afficher les bons champs — mais ne l'écrit jamais.
create policy team_load_models_select on public.team_load_models
  for select to authenticated
  using (
    (team_id is not null and team_id = (select private.current_team_id()))
    or private.entraine_equipe(team_id)
  );

create policy team_load_models_insert on public.team_load_models
  for insert to authenticated
  with check ((select private.is_coach()) and private.entraine_equipe(team_id));

create policy team_load_models_update on public.team_load_models
  for update to authenticated
  using ((select private.is_coach()) and private.entraine_equipe(team_id))
  with check ((select private.is_coach()) and private.entraine_equipe(team_id));

-- Suppression autorisée au coach : un choix daté par erreur doit pouvoir être
-- retiré, sinon la seule issue serait d'empiler une correction par-dessus.
create policy team_load_models_delete on public.team_load_models
  for delete to authenticated
  using ((select private.is_coach()) and private.entraine_equipe(team_id));
