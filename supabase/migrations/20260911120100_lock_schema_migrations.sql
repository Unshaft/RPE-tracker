-- `schema_migrations` vit dans le schéma `public`, donc PostgREST l'expose.
-- C'est une table d'outillage : personne ne doit la voir depuis l'API.
--
-- RLS sans aucune policy la rend illisible pour anon/authenticated, et les
-- droits sont révoqués par sécurité. Le script de migration s'y connecte en
-- tant que propriétaire de la table et continue d'y écrire.

alter table public.schema_migrations enable row level security;

revoke all on public.schema_migrations from anon, authenticated;
