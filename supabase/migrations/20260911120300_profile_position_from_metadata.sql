-- Le poste est saisi à l'inscription, mais quand la confirmation d'e-mail est
-- exigée il n'y a pas de session pour l'écrire ensuite. Il transite donc dans
-- les métadonnées du compte, et c'est le trigger qui le pose sur le profil.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  insert into public.profiles (id, email, first_name, last_name, role, position)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    case
      when new.raw_user_meta_data ->> 'role' = 'coach' then 'coach'
      else 'player'
    end,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'position', '')), '')
  );
  return new;
end;
$fn$;
