-- Création d'équipe atomique.
--
-- Jusqu'ici le client insérait l'équipe, puis mettait à jour `profiles.team_id`
-- dans un second aller-retour. Deux requêtes, donc deux issues possibles : si
-- la seconde échouait, le coach se retrouvait avec une équipe créée à laquelle
-- il n'était pas rattaché — état que RLS rend quasiment irrécupérable côté
-- client, puisqu'il ne voit plus que les équipes dont il est membre ou coach
-- (il reste coach, donc il la voit, mais aucun de ses écrans n'en tient compte).
--
-- Une fonction, une transaction : soit les deux écritures passent, soit aucune.
--
-- Le code d'invitation est désormais tiré ici et non plus par le navigateur :
-- le jeton qui ouvre l'effectif d'un club n'a pas à être choisi par le client.

create or replace function public.create_team(team_name text)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  caller uuid := (select auth.uid());
  nom text := trim(coalesce(team_name, ''));
  equipe public.teams;
begin
  if caller is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  -- Rejoue la condition de la policy `teams_insert` : la fonction étant
  -- `security definer`, elle court-circuite RLS et doit porter elle-même la
  -- règle d'autorisation, sans quoi n'importe quel joueur se créerait une
  -- équipe et deviendrait lecteur des séances de son effectif.
  if not exists (
    select 1 from public.profiles where id = caller and role = 'coach'
  ) then
    raise exception 'Reserve aux coachs' using errcode = '42501';
  end if;

  if length(nom) < 1 or length(nom) > 80 then
    raise exception 'Nom d equipe invalide' using errcode = '23514';
  end if;

  -- Un coach = une équipe (limite assumée de la V1). Sans cette garde, une
  -- seconde création déplacerait silencieusement le coach vers la nouvelle
  -- équipe et le couperait des séances de l'ancienne.
  if exists (select 1 from public.teams where coach_id = caller) then
    raise exception 'Une equipe existe deja pour ce coach' using errcode = 'P0004';
  end if;

  for tentative in 1..5 loop
    begin
      insert into public.teams (name, coach_id, invite_code)
      values (nom, caller, private.nouveau_code_invitation())
      returning * into equipe;

      update public.profiles set team_id = equipe.id where id = caller;
      return equipe;
    exception when unique_violation then
      -- Collision sur le code : on retire, plutôt que de faire échouer la
      -- création sous les yeux du coach pour un tirage malheureux.
      null;
    end;
  end loop;

  raise exception 'Impossible de generer un code d invitation' using errcode = '23505';
end;
$fn$;

revoke execute on function public.create_team(text) from public, anon;
grant execute on function public.create_team(text) to authenticated;
