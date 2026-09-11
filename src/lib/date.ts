/** Utilitaires de date en heure locale, cles au format YYYY-MM-DD. */

export function toDayKey(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + n);
  return toDayKey(d);
}

export function today(): string {
  return toDayKey(new Date());
}

export function diffDays(a: string, b: string): number {
  const ms = fromDayKey(a).getTime() - fromDayKey(b).getTime();
  return Math.round(ms / 86_400_000);
}

/** Liste des jours de `from` a `to` inclus. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; diffDays(to, k) >= 0; k = addDays(k, 1)) out.push(k);
  return out;
}

/** Les `n` derniers jours en terminant par `end` (inclus). */
export function lastNDays(end: string, n: number): string[] {
  return dayRange(addDays(end, -(n - 1)), end);
}

/** Lundi de la semaine ISO contenant `key`. */
export function startOfWeek(key: string): string {
  const d = fromDayKey(key);
  const shift = (d.getDay() + 6) % 7; // 0 = lundi
  return addDays(key, -shift);
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTH_LABELS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

export function dayLabel(key: string): string {
  return DAY_LABELS[(fromDayKey(key).getDay() + 6) % 7];
}

export function shortDate(key: string): string {
  const d = fromDayKey(key);
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

export function longDate(key: string): string {
  const d = fromDayKey(key);
  return `${dayLabel(key)} ${d.getDate()} ${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Aujourd’hui" / "Hier" / date courte. */
export function relativeDate(key: string, ref = today()): string {
  const delta = diffDays(ref, key);
  if (delta === 0) return "Aujourd’hui";
  if (delta === 1) return 'Hier';
  if (delta === -1) return 'Demain';
  return longDate(key);
}

export function weekLabel(mondayKey: string): string {
  return `${shortDate(mondayKey)} - ${shortDate(addDays(mondayKey, 6))}`;
}

/** Forme compacte pour les lignes de liste : « aujourd’hui », « il y a 3 j », « 12 août ». */
export function compactRelative(key: string, ref = today()): string {
  const delta = diffDays(ref, key);
  if (delta === 0) return 'aujourd’hui';
  if (delta === 1) return 'hier';
  if (delta > 1 && delta < 7) return `il y a ${delta} j`;
  return shortDate(key);
}

/** Dimanche de la semaine ISO contenant `key`. */
export function endOfWeek(key: string): string {
  return addDays(startOfWeek(key), 6);
}

/** Libelle compact d’une semaine calendaire : « sem. du 9 mars ». */
export function weekShortLabel(mondayKey: string): string {
  return `sem. du ${shortDate(mondayKey)}`;
}
