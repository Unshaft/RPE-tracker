-- Fermeture du chemin d'insertion directe dans `public.teams`.
--
-- `create_team` (20260919130100) est devenue l'unique façon de créer une
-- équipe : elle tire le code d'invitation côté base et rattache le coach dans
-- la même transaction. Le chemin PostgREST était resté ouvert le temps que les
-- appelants migrent ; plus personne ne l'emprunte — ni `src/`, ni
-- `scripts/smoke-rls.mjs`, dont la section 2 passe par la RPC.
--
-- Le laisser ouvert ne serait pas une commodité mais une seconde porte, plus
-- permissive que la première : un `insert` direct laisse le client choisir le
-- jeton d'invitation et n'écrit pas `profiles.team_id`, c'est-à-dire
-- exactement les deux défauts que `create_team` a été écrite pour supprimer.
--
-- Deux gestes, et les deux comptent. Révoquer le privilège suffirait à bloquer
-- l'écriture, mais laisserait derrière une policy qui décrit une opération
-- devenue impossible — une règle de sécurité qu'on ne peut plus éprouver est
-- une règle qu'on finit par croire sur parole.

revoke insert on public.teams from anon, authenticated;

drop policy if exists teams_insert on public.teams;

-- `create_team` est `security definer` : elle ne passe ni par ce privilège ni
-- par cette policy, et porte elle-même la condition qui s'y trouvait (coach, et
-- coach de l'équipe qu'il crée). Rien à y changer.
