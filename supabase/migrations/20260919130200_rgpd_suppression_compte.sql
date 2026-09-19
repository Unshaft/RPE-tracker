-- Droit à l'effacement (RGPD, art. 17) : supprimer son compte depuis l'app.
--
-- La politique de confidentialité promet l'effacement et les CGV la
-- réversibilité ; jusqu'ici les deux passaient par la console Supabase, à la
-- main. Une promesse contractuelle tenue par une manipulation d'administrateur
-- n'est pas une promesse tenue.
--
-- L'export, lui, ne demande aucune fonction : tout ce qu'un joueur et un coach
-- ont le droit d'exporter est exactement ce que les policies leur laissent
-- déjà lire. Le faire côté client garantit qu'aucun chemin d'export n'échappe
-- à RLS — c'est la même surface, sérialisée.
--
-- --------------------------------------------------------------------------
-- Ce que la cascade emporte
-- --------------------------------------------------------------------------
--
-- Tout part de `auth.users`, où vit l'identité :
--
--   auth.users            → profiles           (on delete cascade)
--   profiles              → training_sessions  (on delete cascade)
--   auth.users            → teams.coach_id     (on delete cascade)
--   teams                 → team_load_models   (on delete cascade)
--   teams                 → profiles.team_id   (on delete SET NULL)
--   auth.users            → join_team_attempts (on delete cascade)
--
-- La dernière ligne de ce tableau est tout le problème du compte coach, et la
-- raison du paramètre de confirmation ci-dessous.

-- --------------------------------------------------------------------------
-- Le cas du coach
--
-- Supprimer un coach supprime son équipe. Les joueurs, eux, ne sont pas
-- supprimés : ils gardent leur compte et l'intégralité de leurs séances, et
-- sont seulement détachés (`team_id` repasse à `null`). Disparaissent en
-- revanche le nom de l'équipe, son code d'invitation et ses choix de modèles
-- de charge datés — donc la façon dont les courbes de la saison se lisaient.
--
-- Ce n'est pas un effet de bord acceptable en silence : la fonction refuse tant
-- que l'appelant n'a pas explicitement confirmé, et l'interface lui dit combien
-- de joueurs seront détachés avant de lui laisser confirmer.
--
-- Ne pas supprimer l'équipe n'était pas une option : `teams.coach_id` est
-- `not null` et référence `auth.users`. Une équipe sans coach n'existe pas dans
-- ce modèle, et la transmettre à quelqu'un d'autre suppose le multi-coach, qui
-- n'est pas au programme de la V1.
-- --------------------------------------------------------------------------

create or replace function public.delete_my_account(confirm_team_deletion boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  if exists (select 1 from public.teams where coach_id = caller)
     and not coalesce(confirm_team_deletion, false) then
    raise exception 'Suppression de l equipe non confirmee' using errcode = 'P0003';
  end if;

  -- Une seule instruction : la cascade fait le reste, et surtout elle ne peut
  -- pas oublier une table. Énumérer les `delete` un par un ici, c'est
  -- s'engager à penser à cette fonction à chaque nouvelle table — donc oublier.
  --
  -- Prérequis d'exploitation : le propriétaire de cette fonction (`postgres`,
  -- le rôle qui joue les migrations) doit avoir le droit de supprimer dans
  -- `auth.users`. C'est le cas par défaut sur Supabase ; à vérifier au moment
  -- de jouer la migration, faute de quoi l'appel échouera en `42501` et il
  -- faudra passer par une fonction Edge munie de la clé `service_role`.
  delete from auth.users where id = caller;
end;
$fn$;

revoke execute on function public.delete_my_account(boolean) from public, anon;
grant execute on function public.delete_my_account(boolean) to authenticated;
