import { SESSION_TYPES, type PublicUser, type Team, type TrainingSession } from '../lib/types';

/**
 * Sérialisation des exports RGPD.
 *
 * La politique de confidentialité promet la portabilité, les CGV promettent la
 * réversibilité au club : ce module produit les fichiers qui tiennent ces deux
 * promesses. Il ne lit rien — les données lui arrivent déjà chargées, sous le
 * régime des policies RLS — et se contente de mettre en forme.
 *
 * Deux formats pour un même contenu, parce que les deux destinataires ne sont
 * pas les mêmes : le JSON est le format « structuré et couramment utilisé » au
 * sens de l'article 20 du RGPD, réimportable tel quel ; le CSV est ce qu'un
 * staff ouvre réellement, dans un tableur, le jour où il quitte le service.
 */

/** Version du format : un export daté doit rester interprétable plus tard. */
const FORMAT_VERSION = 1;

const TYPE_LABELS = new Map(SESSION_TYPES.map((t) => [t.value, t.label]));

function profileToJson(user: PublicUser) {
  return {
    id: user.id,
    email: user.email,
    prenom: user.firstName,
    nom: user.lastName,
    role: user.role,
    poste: user.position ?? null,
    equipe_id: user.teamId,
    compte_cree_le: user.createdAt,
  };
}

function teamToJson(team: Team) {
  // Le jeton d'invitation est volontairement absent : c'est un secret d'accès,
  // pas une donnée personnelle, et un export circule par e-mail.
  return { id: team.id, nom: team.name, coach_id: team.coachId, creee_le: team.createdAt };
}

function sessionToJson(session: TrainingSession) {
  return {
    id: session.id,
    joueur_id: session.userId,
    date: session.date,
    type: session.type,
    duree_min: session.durationMin,
    rpe: session.rpe,
    commentaire: session.comment ?? null,
    entrees: session.inputs ?? null,
    saisie_le: session.createdAt,
  };
}

/** Export d'un utilisateur pour lui-même : son profil et toutes ses séances. */
export function buildPersonalExport(input: {
  user: PublicUser;
  team: Team | null;
  sessions: TrainingSession[];
  generatedAt: string;
}) {
  return {
    format: 'rpe-tracker/export-personnel',
    version: FORMAT_VERSION,
    genere_le: input.generatedAt,
    profil: profileToJson(input.user),
    equipe: input.team ? teamToJson(input.team) : null,
    seances: input.sessions.map(sessionToJson),
  };
}

/**
 * Export d'équipe, à l'usage du club.
 *
 * Contient les séances nominatives de l'effectif — exactement ce que le coach
 * voit déjà à l'écran, ni plus. Le fichier produit est donc à traiter par le
 * club avec le même soin que l'application elle-même.
 */
export function buildTeamExport(input: {
  team: Team;
  coach: PublicUser;
  players: PublicUser[];
  sessionsByPlayer: Map<string, TrainingSession[]>;
  generatedAt: string;
}) {
  return {
    format: 'rpe-tracker/export-equipe',
    version: FORMAT_VERSION,
    genere_le: input.generatedAt,
    equipe: teamToJson(input.team),
    coach: profileToJson(input.coach),
    joueurs: input.players.map((p) => ({
      ...profileToJson(p),
      seances: (input.sessionsByPlayer.get(p.id) ?? []).map(sessionToJson),
    })),
  };
}

/**
 * Échappement CSV, variante RFC 4180 : guillemets doublés, champ entouré dès
 * qu'il contient un séparateur, un guillemet ou un saut de ligne. Un
 * commentaire de séance est du texte libre, il contient tout cela.
 */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Tableau des séances.
 *
 * Séparateur point-virgule et BOM UTF-8 : sans les deux, Excel en configuration
 * française met toute la ligne dans une colonne et casse les accents. Ce n'est
 * pas une coquetterie — un export illisible n'est pas une donnée restituée.
 */
export function sessionsToCsv(
  sessions: TrainingSession[],
  playerById: Map<string, PublicUser>,
): string {
  const header = [
    'joueur_id',
    'prenom',
    'nom',
    'date',
    'type',
    'duree_min',
    'rpe',
    'commentaire',
    'saisie_le',
  ];
  const lines = sessions.map((s) => {
    const p = playerById.get(s.userId);
    return [
      s.userId,
      p?.firstName ?? '',
      p?.lastName ?? '',
      s.date,
      TYPE_LABELS.get(s.type) ?? s.type,
      s.durationMin,
      s.rpe,
      s.comment ?? '',
      s.createdAt,
    ]
      .map(csvCell)
      .join(';');
  });
  // Ecrit par code point : un BOM litteral dans le source est invisible a la
  // relecture, et le linter le refuse a juste titre.
  const bom = String.fromCharCode(0xfeff);
  return `${bom}${header.join(';')}\r\n${lines.map((l) => `${l}\r\n`).join('')}`;
}

/** Nom de fichier daté : plusieurs exports successifs ne s'écrasent pas. */
export function exportFileName(prefix: string, generatedAt: string, extension: string): string {
  const stamp = generatedAt.slice(0, 19).replace(/[:T]/g, '-');
  const slug = prefix
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${slug || 'export'}-${stamp}.${extension}`;
}

/**
 * Déclenche le téléchargement d'un fichier construit en mémoire.
 *
 * Rien ne transite par un serveur : les données sont déjà dans la page, les
 * renvoyer pour se les faire rendre en pièce jointe n'ajouterait qu'un point
 * de fuite.
 */
export function downloadFile(name: string, mime: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Sans révocation, le blob reste en mémoire jusqu'au rechargement de l'onglet,
  // et un export d'équipe pèse.
  URL.revokeObjectURL(url);
}
