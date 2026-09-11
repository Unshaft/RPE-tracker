-- Les fonctions d'appui aux policies doivent être exécutables par `authenticated`.
--
-- Une policy est évaluée avec les privilèges du rôle appelant, pas avec ceux de
-- son auteur : en révoquant EXECUTE à `authenticated`, toute requête déclenchait
-- « permission denied for function is_coach », et les tables devenaient
-- illisibles même pour leur propriétaire légitime.
--
-- Ce GRANT n'ouvre pas ces fonctions à l'API : PostgREST n'expose que le schéma
-- `public`, et `private` en reste absent. Il faut en revanche USAGE sur le
-- schéma pour que l'exécution soit possible pendant l'évaluation des policies.

grant usage on schema private to authenticated;

grant execute on function private.current_team_id() to authenticated;
grant execute on function private.is_coach() to authenticated;

-- `anon` n'a aucune raison d'y toucher : rien n'est lisible sans être connecté.
revoke usage on schema private from anon;
