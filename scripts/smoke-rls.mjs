/**
 * Vérifie de bout en bout, avec la clé anon (donc soumis aux policies RLS),
 * qu'un coach et ses joueurs voient exactement ce qu'ils doivent voir — et
 * rien de plus.
 *
 *   node --env-file=.env.local scripts/smoke-rls.mjs
 *
 * Crée des comptes jetables puis les supprime avec la clé service-role.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error('Variables Supabase manquantes. Lancer avec --env-file=.env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();
const pwd = 'motdepasse-test-1234';
const created = [];

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  ok  ' : '  ÉCHEC'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Crée un compte confirmé et renvoie un client authentifié en son nom. */
async function makeUser(email, meta) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: pwd,
    email_confirm: true,
    user_metadata: meta,
  });
  if (error) throw new Error(`création de ${email} : ${error.message}`);
  created.push(data.user.id);

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: pwd });
  if (signInError) throw new Error(`connexion de ${email} : ${signInError.message}`);
  return { client, id: data.user.id };
}

try {
  console.log('\n1. Comptes et trigger de profil');
  const coach = await makeUser(`coach+${stamp}@example.test`, {
    first_name: 'Cé',
    last_name: 'Coach',
    role: 'coach',
  });
  const player = await makeUser(`joueur+${stamp}@example.test`, {
    first_name: 'Jo',
    last_name: 'Joueur',
    role: 'player',
  });
  const outsider = await makeUser(`ext+${stamp}@example.test`, {
    first_name: 'Ex',
    last_name: 'Terne',
    role: 'player',
  });

  const { data: coachProfile } = await coach.client
    .from('profiles')
    .select('*')
    .eq('id', coach.id)
    .single();
  check('le trigger crée le profil', !!coachProfile);
  check('le rôle vient des métadonnées', coachProfile?.role === 'coach', `role=${coachProfile?.role}`);
  check('le prénom vient des métadonnées', coachProfile?.first_name === 'Cé');

  console.log('\n2. Création d’équipe et code d’invitation');
  const inviteCode = 'TEST' + String(stamp).slice(-2);
  const { data: team, error: teamError } = await coach.client
    .from('teams')
    .insert({ name: 'Équipe test', coach_id: coach.id, invite_code: inviteCode })
    .select('*')
    .single();
  check('le coach crée son équipe', !!team, teamError?.message);
  await coach.client.from('profiles').update({ team_id: team.id }).eq('id', coach.id);

  const { data: joined, error: joinError } = await player.client.rpc('join_team', {
    invite_code: inviteCode,
  });
  check('le joueur rejoint via le code', joined?.id === team.id, joinError?.message);

  const { error: badCodeError } = await player.client.rpc('join_team', { invite_code: 'ZZZZZZ' });
  check('un code inconnu est refusé', !!badCodeError);

  console.log('\n3. Un joueur ne peut pas énumérer les équipes');
  const { data: outsiderTeams } = await outsider.client.from('teams').select('*');
  check('équipes invisibles hors de la sienne', (outsiderTeams ?? []).length === 0,
    `${(outsiderTeams ?? []).length} ligne(s)`);

  console.log('\n4. Séances');
  const { data: session, error: sessionError } = await player.client
    .from('training_sessions')
    .insert({
      user_id: player.id,
      session_date: '2026-09-11',
      type: 'entrainement',
      duration_min: 90,
      rpe: 7,
    })
    .select('*')
    .single();
  check('le joueur enregistre sa séance', !!session, sessionError?.message);

  const { error: forgedError } = await outsider.client.from('training_sessions').insert({
    user_id: player.id,
    session_date: '2026-09-11',
    type: 'match',
    duration_min: 60,
    rpe: 9,
  });
  check('impossible d’écrire au nom d’un autre', !!forgedError);

  const { error: rpeError } = await player.client.from('training_sessions').insert({
    user_id: player.id,
    session_date: '2026-09-11',
    type: 'match',
    duration_min: 60,
    rpe: 42,
  });
  check('un RPE hors échelle est refusé', !!rpeError);

  console.log('\n5. Cloisonnement des lectures');
  const { data: coachSees } = await coach.client.from('training_sessions').select('*');
  check('le coach voit la séance de son joueur',
    (coachSees ?? []).some((s) => s.id === session.id),
    `${(coachSees ?? []).length} ligne(s)`);

  const { data: outsiderSees } = await outsider.client.from('training_sessions').select('*');
  check('un tiers ne voit aucune séance', (outsiderSees ?? []).length === 0,
    `${(outsiderSees ?? []).length} ligne(s)`);

  const { data: coachRoster } = await coach.client
    .from('profiles')
    .select('*')
    .eq('team_id', team.id);
  check('le coach voit son effectif', (coachRoster ?? []).length === 2,
    `${(coachRoster ?? []).length} profil(s)`);

  const { data: outsiderProfiles } = await outsider.client.from('profiles').select('*');
  check('un tiers ne voit que son propre profil', (outsiderProfiles ?? []).length === 1,
    `${(outsiderProfiles ?? []).length} profil(s)`);

  const { error: coachWriteError } = await coach.client
    .from('training_sessions')
    .update({ rpe: 3 })
    .eq('id', session.id)
    .select('*')
    .single();
  check('le coach ne peut pas modifier une séance', !!coachWriteError);

  console.log('\n6. Rattachement différé (confirmation d’e-mail)');
  // Reproduit ce que fait `settlePendingTeam` à la première connexion : le
  // compte a été créé sans session, l'intention est restée en métadonnées.
  const late = await makeUser(`tardif+${stamp}@example.test`, {
    first_name: 'Ta',
    last_name: 'Rdif',
    role: 'player',
    position: 'Ailier',
    pending_invite_code: inviteCode,
  });

  const { data: lateProfile } = await late.client
    .from('profiles')
    .select('*')
    .eq('id', late.id)
    .single();
  check('le poste des métadonnées atterrit sur le profil',
    lateProfile?.position === 'Ailier', `position=${lateProfile?.position}`);
  check('pas encore d’équipe avant règlement', lateProfile?.team_id === null);

  const { data: lateUser } = await late.client.auth.getUser();
  const pending = lateUser.user?.user_metadata?.pending_invite_code;
  check('le code est conservé en métadonnées', pending === inviteCode);

  const { error: lateJoinError } = await late.client.rpc('join_team', { invite_code: pending });
  check('le rattachement se fait à la connexion', !lateJoinError, lateJoinError?.message);

  await late.client.auth.updateUser({ data: { pending_invite_code: null } });
  const { data: settled } = await late.client.auth.getUser();
  check('l’intention est effacée après règlement',
    !settled.user?.user_metadata?.pending_invite_code);

  const { data: lateAfter } = await late.client
    .from('profiles')
    .select('team_id')
    .eq('id', late.id)
    .single();
  check('le joueur est bien dans l’équipe', lateAfter?.team_id === team.id);

  console.log('\n7. Table d’outillage masquée');
  const { data: migrations } = await outsider.client.from('schema_migrations').select('*');
  check('schema_migrations inaccessible', (migrations ?? []).length === 0);
} catch (err) {
  console.error('\nErreur inattendue :', err.message);
  failures++;
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id);
  console.log(`\n${created.length} compte(s) de test supprimé(s).`);
}

console.log(failures === 0 ? '\nToutes les vérifications passent.' : `\n${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
