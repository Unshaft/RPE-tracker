/**
 * Validation des champs d'authentification.
 *
 * Regle du jeu : ces fonctions sont pures et sans dependance UI, pour rester
 * testables et reutilisables (inscription, profil, reinitialisation).
 */

/**
 * RFC 5322 en entier n'a pas d'interet ici : on veut attraper les fautes de
 * frappe reelles (accent oublie, domaine incomplet, espace colle) sans rejeter
 * une adresse valide. Le serveur reste l'autorite finale.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Domaines souvent mal tapes -> suggestion. */
const COMMON_DOMAINS: Record<string, string> = {
  'gmail.fr': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'yahoo.fp': 'yahoo.fr',
  'wanadou.fr': 'wanadoo.fr',
  'orange.com': 'orange.fr',
};

export interface EmailCheck {
  valid: boolean;
  /** Message a afficher sous le champ, null si tout va bien. */
  error: string | null;
  /** Correction probable du domaine, ex. "kp@gmail.com". */
  suggestion: string | null;
}

export function checkEmail(raw: string): EmailCheck {
  const email = raw.trim();

  if (!email) return { valid: false, error: 'Renseigne ton adresse e-mail.', suggestion: null };
  if (/\s/.test(email)) return { valid: false, error: "L'adresse ne doit pas contenir d'espace.", suggestion: null };
  if (!email.includes('@')) return { valid: false, error: "Il manque le « @ ».", suggestion: null };
  if (!EMAIL_RE.test(email)) return { valid: false, error: "Adresse e-mail invalide (ex. prenom@club.fr).", suggestion: null };
  if (email.length > 254) return { valid: false, error: 'Adresse trop longue.', suggestion: null };

  const [local, domain] = email.split('@');
  const fix = COMMON_DOMAINS[domain.toLowerCase()];

  return { valid: true, error: null, suggestion: fix ? `${local}@${fix}` : null };
}

/** Longueur minimale : doit rester >= au reglage Supabase du projet. */
export const PASSWORD_MIN = 8;

export interface PasswordRule {
  id: string;
  label: string;
  met: boolean;
}

export interface PasswordCheck {
  valid: boolean;
  error: string | null;
  rules: PasswordRule[];
  /** 0 (vide) a 4 (fort) — pilote la jauge. */
  score: 0 | 1 | 2 | 3 | 4;
  strengthLabel: string;
}

/** Mots de passe trop evidents, rejetes meme s'ils cochent les regles. */
const BLOCKLIST = [
  'password', 'motdepasse', 'azertyuiop', 'qwertyuiop', '123456789',
  'badminton', 'rpetracker',
];

export function checkPassword(password: string, context: { email?: string; firstName?: string; lastName?: string } = {}): PasswordCheck {
  const rules: PasswordRule[] = [
    { id: 'length', label: `${PASSWORD_MIN} caractères minimum`, met: password.length >= PASSWORD_MIN },
    { id: 'case', label: 'Une majuscule et une minuscule', met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { id: 'digit', label: 'Un chiffre', met: /\d/.test(password) },
  ];

  const met = rules.filter((r) => r.met).length;
  const lower = password.toLowerCase();

  // Un mot de passe qui contient le prenom, le nom ou l'identifiant e-mail est
  // devinable : on le refuse independamment des regles de composition.
  const personal = [context.firstName, context.lastName, context.email?.split('@')[0]]
    .map((v) => v?.trim().toLowerCase())
    .filter((v): v is string => !!v && v.length >= 3);

  let error: string | null = null;
  if (!password) error = 'Choisis un mot de passe.';
  else if (met < rules.length) error = 'Le mot de passe ne remplit pas toutes les conditions.';
  else if (BLOCKLIST.some((b) => lower.includes(b))) error = 'Mot de passe trop courant, choisis-en un autre.';
  else if (personal.some((p) => lower.includes(p))) error = 'Évite ton nom ou ton adresse e-mail dans le mot de passe.';

  let score: PasswordCheck['score'] = 0;
  if (password) {
    score = Math.min(met, 3) as 1 | 2 | 3;
    // Le 4e palier recompense la longueur reelle, pas seulement les regles.
    if (met === rules.length && password.length >= 12 && !error) score = 4;
    if (error && score > 2) score = 2;
  }

  const strengthLabel = ['', 'Trop faible', 'Faible', 'Correct', 'Fort'][score];

  return { valid: !error, error, rules, score, strengthLabel };
}
