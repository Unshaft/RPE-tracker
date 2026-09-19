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
// Alphabet de `private.nouveau_code_invitation()` : ni 0/O ni 1/I, un code est
// lu à voix haute ou recopié depuis un écran.
const CODE_VALIDE = /^[A-HJ-NP-Z2-9]{6}$/;
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
  check(
    'le rôle vient des métadonnées',
    coachProfile?.role === 'coach',
    `role=${coachProfile?.role}`,
  );
  check('le prénom vient des métadonnées', coachProfile?.first_name === 'Cé');

  console.log('\n2. Création d’équipe et code d’invitation');
  // L'équipe se crée par `create_team` : une transaction qui insère l'équipe et
  // rattache le coach, et qui tire elle-même le code — le jeton qui ouvre
  // l'effectif d'un club n'est plus choisi par le navigateur.
  const { data: team, error: teamError } = await coach.client.rpc('create_team', {
    team_name: 'Équipe test',
  });
  check('le coach crée son équipe', !!team?.id, teamError?.message);
  check(
    'le code est tiré par la base',
    CODE_VALIDE.test(team?.invite_code ?? ''),
    `code=${team?.invite_code}`,
  );

  const { data: coachAfterCreate } = await coach.client
    .from('profiles')
    .select('team_id')
    .eq('id', coach.id)
    .single();
  check('le coach est rattaché dans la même transaction', coachAfterCreate?.team_id === team?.id);

  const { error: playerTeamError } = await player.client.rpc('create_team', {
    team_name: 'Équipe pirate',
  });
  check('un joueur ne crée pas d’équipe', !!playerTeamError);

  // Un coach = une équipe : limite assumée de la V1, portée par la fonction.
  const { error: deuxiemeEquipeError } = await coach.client.rpc('create_team', {
    team_name: 'Équipe en trop',
  });
  check('un coach n’a qu’une équipe', !!deuxiemeEquipeError);

  const { data: joined, error: joinError } = await player.client.rpc('join_team', {
    invite_code: team.invite_code,
  });
  check('le joueur rejoint via le code', joined?.id === team.id, joinError?.message);

  // Contrat changé par `20260919130000_invitations_regenerables.sql` : un code
  // refusé ne lève plus d'exception, il renvoie `null`. L'exception annulerait
  // la transaction, donc l'enregistrement de la tentative, donc le frein.
  const { data: refuse, error: badCodeError } = await player.client.rpc('join_team', {
    invite_code: 'ZZZZZZ',
  });
  check(
    'un code inconnu renvoie null, sans exception',
    refuse === null && !badCodeError,
    badCodeError?.message,
  );

  console.log('\n3. Un joueur ne peut pas énumérer les équipes');
  const { data: outsiderTeams } = await outsider.client.from('teams').select('*');
  check(
    'équipes invisibles hors de la sienne',
    (outsiderTeams ?? []).length === 0,
    `${(outsiderTeams ?? []).length} ligne(s)`,
  );

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

  // `inputs` porte les champs propres aux modèles étendus. Le jeu de clés est
  // fermé par un `check` : une faute de frappe doit faire échouer l'écriture,
  // pas repartir en silence sur la valeur par défaut.
  const { error: inputsError } = await player.client.from('training_sessions').insert({
    user_id: player.id,
    session_date: '2026-09-11',
    type: 'entrainement',
    duration_min: 60,
    rpe: 6,
    inputs: { rpe_respiratoire: 7 },
  });
  check('une entrée de séance inconnue est refusée', !!inputsError);

  console.log('\n5. Cloisonnement des lectures');
  const { data: coachSees } = await coach.client.from('training_sessions').select('*');
  check(
    'le coach voit la séance de son joueur',
    (coachSees ?? []).some((s) => s.id === session.id),
    `${(coachSees ?? []).length} ligne(s)`,
  );

  const { data: outsiderSees } = await outsider.client.from('training_sessions').select('*');
  check(
    'un tiers ne voit aucune séance',
    (outsiderSees ?? []).length === 0,
    `${(outsiderSees ?? []).length} ligne(s)`,
  );

  const { data: coachRoster } = await coach.client
    .from('profiles')
    .select('*')
    .eq('team_id', team.id);
  check(
    'le coach voit son effectif',
    (coachRoster ?? []).length === 2,
    `${(coachRoster ?? []).length} profil(s)`,
  );

  const { data: outsiderProfiles } = await outsider.client.from('profiles').select('*');
  check(
    'un tiers ne voit que son propre profil',
    (outsiderProfiles ?? []).length === 1,
    `${(outsiderProfiles ?? []).length} profil(s)`,
  );

  const { error: coachWriteError } = await coach.client
    .from('training_sessions')
    .update({ rpe: 3 })
    .eq('id', session.id)
    .select('*')
    .single();
  check('le coach ne peut pas modifier une séance', !!coachWriteError);

  console.log('\n6. Invitation : rattachement, rotation, révocation, frein');
  // Le rattachement différé par `pending_invite_code` a disparu avec le commit
  // 98654f4, et le code éternel avec la migration
  // `20260919130000_invitations_regenerables.sql`. Ce qui reste à vérifier,
  // c'est le jeton tel qu'il est aujourd'hui : unique par équipe, régénérable,
  // révocable, expirable, et protégé par un quota d'essais.
  const late = await makeUser(`tardif+${stamp}@example.test`, {
    first_name: 'Ta',
    last_name: 'Rdif',
    role: 'player',
    position: 'Ailier',
  });

  const { data: lateProfile } = await late.client
    .from('profiles')
    .select('*')
    .eq('id', late.id)
    .single();
  check(
    'le poste des métadonnées atterrit sur le profil',
    lateProfile?.position === 'Ailier',
    `position=${lateProfile?.position}`,
  );
  check('aucune équipe tant que le code n’est pas joué', lateProfile?.team_id === null);

  // `join_team` fait `upper(trim(...))` : le code saisi au clavier, en
  // minuscules et avec des espaces collés, doit être accepté tel quel.
  const { data: joinedLate, error: sloppyError } = await late.client.rpc('join_team', {
    invite_code: `  ${team.invite_code.toLowerCase()} `,
  });
  check(
    'le code est normalisé (casse et espaces)',
    joinedLate?.id === team.id,
    sloppyError?.message,
  );

  // Seul `authenticated` a le droit d'exécuter la fonction : sans session, le
  // code d'invitation ne sert à rien, même s'il fuite.
  const anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: anonJoinError } = await anonClient.rpc('join_team', {
    invite_code: team.invite_code,
  });
  check('un visiteur non connecté ne peut pas rejoindre', !!anonJoinError, anonJoinError?.message);

  // Le jeton ne se manipule que par les fonctions : le privilège d'UPDATE est
  // retiré au niveau colonne, ce qu'aucune policy ne peut redonner.
  const { error: forgedCodeError } = await coach.client
    .from('teams')
    .update({ invite_code: 'ABCDEF' })
    .eq('id', team.id);
  check('le coach ne choisit pas son code à la main', !!forgedCodeError);

  // Régénérer invalide immédiatement le code précédent : c'est l'effet
  // recherché quand un joueur est exclu du club.
  const ancienCode = team.invite_code;
  const { data: rotated, error: rotateError } = await coach.client.rpc('rotate_team_invite', {});
  check(
    'le coach régénère son code',
    CODE_VALIDE.test(rotated?.invite_code ?? ''),
    rotateError?.message,
  );
  check('le nouveau code diffère de l’ancien', rotated?.invite_code !== ancienCode);

  const { data: parAncienCode } = await late.client.rpc('join_team', {
    invite_code: ancienCode,
  });
  check('l’ancien code ne vaut plus rien', parAncienCode === null);

  const { data: parNouveauCode } = await late.client.rpc('join_team', {
    invite_code: rotated.invite_code,
  });
  check('le nouveau code rattache bien', parNouveauCode?.id === team.id);

  const { error: passeError } = await coach.client.rpc('rotate_team_invite', {
    expires_at: '2020-01-01T00:00:00Z',
  });
  check('une expiration déjà passée est refusée', !!passeError);

  const { error: joueurRotateError } = await player.client.rpc('rotate_team_invite', {});
  check('un joueur ne régénère pas de code', !!joueurRotateError);

  // Changer d'équipe est un cas réel (un joueur qui change de club) : il faut
  // un second coach, puisqu'un coach n'a droit qu'à une équipe.
  const coach2 = await makeUser(`coach2+${stamp}@example.test`, {
    first_name: 'Bi',
    last_name: 'Scoach',
    role: 'coach',
  });
  const { data: team2 } = await coach2.client.rpc('create_team', { team_name: 'Équipe bis' });
  const { data: moved } = await late.client.rpc('join_team', {
    invite_code: team2.invite_code,
  });
  check('un joueur déjà rattaché peut changer d’équipe', moved?.id === team2.id);

  const { data: lateAfter } = await late.client
    .from('profiles')
    .select('team_id')
    .eq('id', late.id)
    .single();
  check('le profil pointe sur la nouvelle équipe', lateAfter?.team_id === team2?.id);

  // Révoquer, c'est effacer le jeton : plus personne n'entre tant que le coach
  // n'en a pas régénéré un.
  const codeRevoque = team2.invite_code;
  const { data: revoked, error: revokeError } = await coach2.client.rpc('revoke_team_invite');
  check('le coach révoque son invitation', revoked?.invite_code === null, revokeError?.message);

  const { data: apresRevocation } = await late.client.rpc('join_team', {
    invite_code: codeRevoque,
  });
  check('un code révoqué ne rattache plus', apresRevocation === null);

  // Le frein : cinq essais par quart d'heure. Au-delà, même un code valide est
  // refusé — et sans message distinct, pour que la limitation ne serve pas
  // d'oracle d'énumération.
  const bruteforce = await makeUser(`brute+${stamp}@example.test`, {
    first_name: 'Br',
    last_name: 'Ute',
    role: 'player',
  });
  for (let i = 0; i < 5; i++) {
    await bruteforce.client.rpc('join_team', { invite_code: `ZZZZZ${i}` });
  }
  const { data: freine, error: freineError } = await bruteforce.client.rpc('join_team', {
    invite_code: rotated.invite_code,
  });
  check(
    'au-delà du quota, même un code valide est refusé',
    freine === null && !freineError,
    freineError?.message,
  );

  const { data: bruteProfile } = await bruteforce.client
    .from('profiles')
    .select('team_id')
    .eq('id', bruteforce.id)
    .single();
  check('le compte freiné n’est rattaché à rien', bruteProfile?.team_id === null);

  // La table des tentatives est fermée comme `schema_migrations` : la lire
  // dirait à l'appelant où il en est de son quota, donc quand relancer.
  const { data: tentatives } = await bruteforce.client.from('join_team_attempts').select('*');
  check(
    'join_team_attempts inaccessible',
    (tentatives ?? []).length === 0,
    `${(tentatives ?? []).length} ligne(s)`,
  );

  console.log('\n7. Modèles de charge');
  // Le catalogue est lisible par tout compte connecté — le formulaire de saisie
  // du joueur en dépend — mais personne ne l'écrit : aucune policy d'écriture
  // n'existe et les droits sont révoqués.
  const { data: catalogue } = await player.client.from('load_models').select('*');
  check(
    'le catalogue des modèles est lisible',
    (catalogue ?? []).length >= 4,
    `${(catalogue ?? []).length} modèle(s)`,
  );

  const { error: catalogueWriteError } = await coach.client
    .from('load_models')
    .insert({ code: 'bidon_test', domain: 'field', label: 'Bidon' });
  check('le catalogue est en lecture seule', !!catalogueWriteError);

  const { data: choice, error: choiceError } = await coach.client
    .from('team_load_models')
    .insert({
      team_id: team.id,
      domain: 'field',
      model_code: 'srpe_differentiated',
      effective_from: '2026-09-01',
    })
    .select('*')
    .single();
  check('le coach choisit le modèle de son équipe', !!choice, choiceError?.message);

  const { error: playerChoiceError } = await player.client.from('team_load_models').insert({
    team_id: team.id,
    domain: 'field',
    model_code: 'foster_srpe',
    effective_from: '2026-09-02',
  });
  check('le joueur ne choisit pas le modèle', !!playerChoiceError);

  const { data: playerSeesChoice } = await player.client.from('team_load_models').select('*');
  check(
    'le joueur voit le modèle de son équipe',
    (playerSeesChoice ?? []).length === 1,
    `${(playerSeesChoice ?? []).length} ligne(s)`,
  );

  const { data: outsiderChoices } = await outsider.client.from('team_load_models').select('*');
  check(
    'un tiers ne voit aucun choix de modèle',
    (outsiderChoices ?? []).length === 0,
    `${(outsiderChoices ?? []).length} ligne(s)`,
  );

  // Le couple (code, domaine) est une clé étrangère composite : un modèle de
  // musculation ne peut pas être rangé dans le domaine terrain.
  const { error: crossDomainError } = await coach.client.from('team_load_models').insert({
    team_id: team.id,
    domain: 'field',
    model_code: 'volume_load',
    effective_from: '2026-09-03',
  });
  check('un modèle muscu ne peut pas être rangé en terrain', !!crossDomainError);

  // `params` est un jsonb, mais pas un jsonb libre : les clés inconnues sont
  // refusées par un `check`, sinon une faute de frappe passerait une saison.
  const { error: badParamsError } = await coach.client.from('team_load_models').insert({
    team_id: team.id,
    domain: 'strength',
    model_code: 'volume_load',
    effective_from: '2026-09-04',
    params: { fenetre_aigue: 7 },
  });
  check('un paramètre de modèle inconnu est refusé', !!badParamsError);

  console.log('\n8. Table d’outillage masquée');
  const { data: migrations } = await outsider.client.from('schema_migrations').select('*');
  check('schema_migrations inaccessible', (migrations ?? []).length === 0);

  console.log('\n9. Suppression de compte (RGPD)');
  // Supprimer un coach supprime son équipe et détache ses joueurs : la fonction
  // refuse tant que l'appelant ne l'a pas explicitement confirmé. On vérifie le
  // refus, pas la suppression — l'équipe sert encore aux sections précédentes.
  const { error: sansConfirmationError } = await coach.client.rpc('delete_my_account', {});
  check(
    'un coach ne se supprime pas sans confirmer',
    !!sansConfirmationError,
    sansConfirmationError?.message,
  );

  const { data: equipeIntacte } = await coach.client
    .from('teams')
    .select('id')
    .eq('id', team.id)
    .maybeSingle();
  check('le refus n’a rien supprimé', equipeIntacte?.id === team.id);

  // Un joueur, lui, part sans confirmation : rien ne dépend de lui.
  const { error: suppressionError } = await outsider.client.rpc('delete_my_account', {});
  check('un joueur supprime son compte', !suppressionError, suppressionError?.message);

  const { data: profilSupprime } = await admin
    .from('profiles')
    .select('id')
    .eq('id', outsider.id)
    .maybeSingle();
  check('la cascade emporte le profil', !profilSupprime);
} catch (err) {
  console.error('\nErreur inattendue :', err.message);
  failures++;
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id);
  console.log(`\n${created.length} compte(s) de test supprimé(s).`);
}

console.log(failures === 0 ? '\nToutes les vérifications passent.' : `\n${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
