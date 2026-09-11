-- Schéma initial du RPE Tracker.
--
-- Trois tables : les profils (adossés à auth.users), les équipes et les
-- séances d'entraînement. L'isolation est assurée par RLS : un joueur ne voit
-- que ses propres séances, un coach voit celles de son effectif.

-- --------------------------------------------------------------------------
-- Schéma privé : fonctions d'appui aux policies, jamais exposées à l'API.
-- --------------------------------------------------------------------------

create schema if not exists private;
revoke usage on schema private from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  coach_id uuid not null references auth.users (id) on delete cascade,
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  role text not null default 'player' check (role in ('player', 'coach')),
  team_id uuid references public.teams (id) on delete set null,
  position text,
  created_at timestamptz not null default now()
);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Jour de la séance, en heure locale du joueur : une date nue, pas un instant.
  session_date date not null,
  type text not null check (
    type in ('entrainement', 'match', 'muscu', 'individuel', 'recuperation')
  ),
  duration_min integer not null check (duration_min between 1 and 600),
  -- Échelle CR-10 de Borg.
  rpe smallint not null check (rpe between 1 and 10),
  comment text check (length(comment) <= 500),
  created_at timestamptz not null default now()
);

-- Index sur les colonnes des clés étrangères et des policies RLS.
create index profiles_team_id_idx on public.profiles (team_id);
create index teams_coach_id_idx on public.teams (coach_id);
-- L'historique se lit toujours par joueur et par date décroissante.
create index training_sessions_user_date_idx
  on public.training_sessions (user_id, session_date desc);

-- --------------------------------------------------------------------------
-- Fonctions d'appui
--
-- SECURITY DEFINER pour court-circuiter RLS et éviter la récursion infinie
-- d'une policy sur `profiles` qui interrogerait `profiles`.
-- --------------------------------------------------------------------------

create or replace function private.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select team_id from public.profiles where id = (select auth.uid());
$fn$;

create or replace function private.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'coach'
  );
$fn$;

revoke execute on function private.current_team_id() from public, anon, authenticated;
revoke execute on function private.is_coach() from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- RLS
-- --------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.training_sessions enable row level security;

-- Profils : le sien, et ceux de son équipe.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (team_id is not null and team_id = (select private.current_team_id()))
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Équipes : uniquement la sienne, ou celle dont on est le coach.
create policy teams_select on public.teams
  for select to authenticated
  using (
    id = (select private.current_team_id())
    or coach_id = (select auth.uid())
  );

-- Seul un coach crée une équipe, et il en est le coach.
create policy teams_insert on public.teams
  for insert to authenticated
  with check (coach_id = (select auth.uid()) and (select private.is_coach()));

create policy teams_update_own on public.teams
  for update to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

-- Séances : les siennes ; en lecture seule pour le coach de l'équipe.
create policy training_sessions_select on public.training_sessions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      (select private.is_coach())
      and exists (
        select 1 from public.profiles p
        where p.id = training_sessions.user_id
          and p.team_id is not null
          and p.team_id = (select private.current_team_id())
      )
    )
  );

-- Un joueur est seul maître de ses séances : le coach ne peut pas les écrire.
create policy training_sessions_insert_own on public.training_sessions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy training_sessions_update_own on public.training_sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy training_sessions_delete_own on public.training_sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- --------------------------------------------------------------------------
-- Création du profil à l'inscription
-- --------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  insert into public.profiles (id, email, first_name, last_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    case
      when new.raw_user_meta_data ->> 'role' = 'coach' then 'coach'
      else 'player'
    end
  );
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------------
-- Rejoindre une équipe par code d'invitation
--
-- Le joueur ne doit pas pouvoir lister les équipes pour deviner un code :
-- la résolution du code passe donc par cette fonction, et par elle seule.
-- --------------------------------------------------------------------------

create or replace function public.join_team(invite_code text)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  target public.teams;
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  select * into target from public.teams t
  where t.invite_code = upper(trim(join_team.invite_code));

  if not found then
    raise exception 'Code d invitation inconnu' using errcode = 'P0002';
  end if;

  update public.profiles set team_id = target.id where id = caller;

  return target;
end;
$fn$;

revoke execute on function public.join_team(text) from public, anon;
grant execute on function public.join_team(text) to authenticated;
