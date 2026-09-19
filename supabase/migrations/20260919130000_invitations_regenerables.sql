-- Invitations régénérables, révocables, expirables — et freinées.
--
-- Deux problèmes se règlent ici parce qu'ils partagent le même objet.
--
-- 1. Le code à 6 caractères était éternel : un joueur exclu du club gardait un
--    accès valide à vie, et un code diffusé par erreur l'était pour toujours.
-- 2. `join_team` n'avait aucun frein. L'espace est de 32⁶ ≈ 10⁹ : coûteux à
--    balayer, mais parfaitement scriptable, et entrer dans l'effectif d'un club
--    professionnel vaut le coût.
--
-- Le parti retenu est de garder **un seul jeton**. Le code court reste ce qu'on
-- dicte au bord du terrain ; le lien partageable n'est que ce même code porté
-- dans une URL. Deux secrets distincts auraient doublé la surface à révoquer
-- pour aucun gain : révoquer, c'est effacer le jeton, point.

-- --------------------------------------------------------------------------
-- Le jeton : révocable, daté
-- --------------------------------------------------------------------------

-- `null` = invitation révoquée. La contrainte d'unicité reste posée sur la
-- colonne, et Postgres ne compare pas les `null` entre eux : plusieurs équipes
-- peuvent être révoquées en même temps sans se marcher dessus.
alter table public.teams alter column invite_code drop not null;

-- Nullable = pas d'expiration. C'est le cas par défaut, et celui de toutes les
-- équipes déjà créées : la migration ne change rien à leur code actuel.
alter table public.teams add column invite_expires_at timestamptz;

-- Sert à l'écran coach (« régénéré le … ») ; `now()` pour l'existant est faux
-- d'un jour ou deux, mais un `null` obligerait chaque lecture à gérer le cas.
alter table public.teams add column invite_rotated_at timestamptz not null default now();

-- La policy `teams_update_own` autorise le coach à écrire sa ligne d'équipe,
-- donc à se fabriquer un code choisi ou à repousser sa propre expiration. Le
-- jeton ne se manipule que par les fonctions ci-dessous : on ramène le
-- privilège d'écriture à la seule colonne `name`. Aucune policy ne peut
-- redonner un privilège — les deux se cumulent, elles ne se remplacent pas.
--
-- En deux temps, et c'est obligatoire : Supabase accorde `update` au niveau de
-- la table, et un `REVOKE` de colonne ne rogne pas un droit accordé sur la
-- table entière (il ne retire que des droits accordés colonne par colonne).
-- Révoquer colonne par colonne ici n'aurait strictement rien fait.
revoke update on public.teams from anon, authenticated;
grant update (name) on public.teams to authenticated;

-- --------------------------------------------------------------------------
-- Génération du code
--
-- Passe côté base : le client ne doit plus choisir le jeton qui le laisse
-- entrer. `random()` est écarté — c'est un générateur pseudo-aléatoire
-- prévisible, et un code d'invitation est un secret.
--
-- `gen_random_uuid()` fournit 122 bits cryptographiques ; on en prend 32, soit
-- exactement quatre fois 32⁶. Le modulo ne biaise donc aucun symbole.
-- --------------------------------------------------------------------------

create or replace function private.nouveau_code_invitation()
returns text
language plpgsql
volatile
set search_path = ''
as $fn$
declare
  -- Sans 0/O ni 1/I : un code est lu à voix haute ou recopié depuis un écran.
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  reste bigint := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint;
  code text := '';
begin
  for i in 1..6 loop
    code := code || substr(alphabet, (reste % 32)::int + 1, 1);
    reste := reste / 32;
  end loop;
  return code;
end;
$fn$;

revoke execute on function private.nouveau_code_invitation() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- Tentatives de rattachement
--
-- Une table plutôt qu'un compteur : c'est la fenêtre glissante qui fait le
-- frein, et un compteur remis à zéro toutes les quinze minutes offrirait un
-- créneau franc à qui sait l'attendre.
--
-- RLS activée et **aucune policy** : le contenu n'est lisible par personne via
-- l'API, pas même par l'utilisateur qui en est le sujet. Lui montrer ses
-- propres tentatives lui dirait où il en est du quota, donc quand relancer le
-- balayage. Même dispositif que `public.schema_migrations`
-- (`20260911120100_lock_schema_migrations.sql`) : le seul accès légitime est
-- celui de `join_team`, qui court-circuite RLS en `security definer`.
-- --------------------------------------------------------------------------

create table public.join_team_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index join_team_attempts_user_idx
  on public.join_team_attempts (user_id, attempted_at desc);

alter table public.join_team_attempts enable row level security;
revoke all on public.join_team_attempts from anon, authenticated;

-- --------------------------------------------------------------------------
-- Rejoindre une équipe : version freinée
--
-- Changement de contrat : **la fonction ne lève plus d'exception sur un code
-- refusé, elle renvoie `null`.** Ce n'est pas un détail de style.
--
-- Une exception qui remonte hors d'une fonction annule sa transaction, donc
-- annulerait l'enregistrement de la tentative qui vient d'être écrit : le
-- compteur resterait à zéro et le frein ne freinerait rien. Compter les échecs
-- et les signaler par une exception sont deux choses incompatibles ici.
--
-- Bénéfice collatéral : code inconnu, code révoqué, code expiré et quota épuisé
-- produisent tous exactement la même réponse. Rien ne permet de distinguer
-- « ce code n'existe pas » de « ce code existe mais tu es bloqué », ce qui
-- aurait fait de la limitation elle-même un oracle d'énumération.
-- --------------------------------------------------------------------------

create or replace function public.join_team(invite_code text)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  -- Cinq essais par quart d'heure : un coach dicte son code, un joueur le
  -- retape deux ou trois fois au pire. Un balayage, lui, a besoin de millions.
  quota_court constant integer := 5;
  fenetre_courte constant interval := interval '15 minutes';
  -- Second plafond : sans lui, une attente patiente entre deux salves rendrait
  -- le premier quota purement cosmétique (480 essais par jour et par compte).
  quota_long constant integer := 20;
  fenetre_longue constant interval := interval '24 hours';

  caller uuid := (select auth.uid());
  code text := upper(trim(join_team.invite_code));
  target public.teams;
  echecs_recents integer;
  echecs_du_jour integer;
begin
  -- Seul cas qui reste une exception : il ne dépend que de l'état de
  -- l'appelant, jamais de l'existence d'un code, et n'a rien à comptabiliser.
  if caller is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  -- Purge à l'écriture plutôt que par une tâche planifiée : la table n'a de
  -- sens que sur la plus longue fenêtre, et le projet n'a pas d'ordonnanceur.
  delete from public.join_team_attempts
  where attempted_at < now() - fenetre_longue;

  select
    count(*) filter (where attempted_at > now() - fenetre_courte),
    count(*)
  into echecs_recents, echecs_du_jour
  from public.join_team_attempts
  where user_id = caller;

  if echecs_recents >= quota_court or echecs_du_jour >= quota_long then
    -- Volontairement avant toute lecture de `teams` : bloqué, l'appelant ne
    -- doit même pas pouvoir mesurer un écart de temps de réponse.
    --
    -- La tentative bloquée n'est pas enregistrée : la compter prolongerait le
    -- blocage aussi longtemps que dure le martèlement, ce qui punirait surtout
    -- le joueur légitime qui réessaie, sans gêner un script.
    return null;
  end if;

  select * into target
  from public.teams t
  where t.invite_code = code
    and (t.invite_expires_at is null or t.invite_expires_at > now());

  if not found then
    insert into public.join_team_attempts (user_id) values (caller);
    return null;
  end if;

  -- Succès : le compteur repart à zéro. Un joueur qui s'est trompé trois fois
  -- puis a réussi ne doit pas traîner ses erreurs pour le reste de la journée.
  delete from public.join_team_attempts where user_id = caller;

  update public.profiles set team_id = target.id where id = caller;

  return target;
end;
$fn$;

revoke execute on function public.join_team(text) from public, anon;
grant execute on function public.join_team(text) to authenticated;

-- --------------------------------------------------------------------------
-- Régénérer / révoquer, côté coach
-- --------------------------------------------------------------------------

-- Régénérer **invalide immédiatement** le code précédent : il n'y a qu'un jeton
-- par équipe, et il est écrasé. C'est l'effet recherché (couper l'accès d'un
-- joueur exclu) et c'est aussi ce qui casse le lien déjà distribué aux autres :
-- l'interface doit le faire confirmer.
create or replace function public.rotate_team_invite(expires_at timestamptz default null)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  caller uuid := (select auth.uid());
  equipe public.teams;
begin
  if caller is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  select * into equipe from public.teams where coach_id = caller;
  if not found then
    raise exception 'Aucune equipe a administrer' using errcode = '42501';
  end if;

  if expires_at is not null and expires_at <= now() then
    raise exception 'Date d expiration deja passee' using errcode = '22023';
  end if;

  -- Même parade qu'à la création : une collision d'unicité est un tirage
  -- malheureux, pas une erreur à montrer au coach.
  for tentative in 1..5 loop
    begin
      update public.teams
      set invite_code = private.nouveau_code_invitation(),
          invite_expires_at = rotate_team_invite.expires_at,
          invite_rotated_at = now()
      where id = equipe.id
      returning * into equipe;
      return equipe;
    exception when unique_violation then
      null;
    end;
  end loop;

  raise exception 'Impossible de generer un code d invitation' using errcode = '23505';
end;
$fn$;

revoke execute on function public.rotate_team_invite(timestamptz) from public, anon;
grant execute on function public.rotate_team_invite(timestamptz) to authenticated;

-- Révoquer, c'est effacer le jeton — pas le marquer inactif. Un jeton conservé
-- « pour l'historique » reste un secret à protéger, et la seule raison de le
-- relire serait de le remettre en service.
create or replace function public.revoke_team_invite()
returns public.teams
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  caller uuid := (select auth.uid());
  equipe public.teams;
begin
  if caller is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  update public.teams
  set invite_code = null,
      invite_expires_at = null,
      invite_rotated_at = now()
  where coach_id = caller
  returning * into equipe;

  if not found then
    raise exception 'Aucune equipe a administrer' using errcode = '42501';
  end if;

  return equipe;
end;
$fn$;

revoke execute on function public.revoke_team_invite() from public, anon;
grant execute on function public.revoke_team_invite() to authenticated;
