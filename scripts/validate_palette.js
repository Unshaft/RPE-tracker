/**
 * Vérifie que la palette de `src/styles/global.css` respecte les règles que ce
 * fichier s'impose à lui-même : contraste du texte, lisibilité des encres
 * posées sur leur fond, régularité de la rampe ordinale RPE, distinguabilité
 * des séries sous déficience de la vision des couleurs.
 *
 *   node scripts/validate_palette.js            # toutes les règles
 *   node scripts/validate_palette.js --ordinal  # la rampe RPE seulement
 *
 * Sort en code 1 dès qu'une règle bloquante est violée. Les avertissements
 * (séries data-viz, CVD) sont affichés mais ne font pas échouer : ce sont des
 * marques graphiques, pas du texte, et le seuil y est une heuristique.
 *
 * Aucune dépendance : tout est calculé ici (sRGB, WCAG 2.1, OKLab, Viénot 1999).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const CSS = path.join(import.meta.dirname, '..', 'src', 'styles', 'global.css');

// Seuils. Le texte suit WCAG 2.1 AA ; le reste est documenté à chaque usage.
const AA_TEXTE = 4.5;
const AA_TEXTE_SECONDAIRE = 3; // texte d'appoint, jamais porteur d'information seule
const AA_GRAPHIQUE = 3; // WCAG 1.4.11, objets graphiques
const ECART_ORDINAL_MIN = 0.06; // pas minimal de clarté OKLab entre deux paliers
const TEINTE_ORDINALE_MAX = 12; // dispersion de teinte tolérée sur la rampe, en degrés
const DISTANCE_CVD_MIN = 0.05; // ΔOKLab en dessous duquel deux séries se confondent

// --------------------------------------------------------------------------
// Couleur
// --------------------------------------------------------------------------

/** `#rrggbb` vers composantes sRGB dans [0, 1]. Renvoie null si ce n'est pas un hexa. */
function versSrgb(valeur) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(valeur).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const versLineaire = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const versGamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** Luminance relative WCAG 2.1. */
function luminance(srgb) {
  const [r, g, b] = srgb.map(versLineaire);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG 2.1, entre 1 et 21. */
function contraste(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * sRGB vers OKLab. Utilisé plutôt que la luminance WCAG pour juger de la
 * *régularité* d'une rampe : OKLab est perceptuellement uniforme, une
 * différence de clarté constante s'y voit comme un pas constant.
 */
function oklab(srgb) {
  const [r, g, b] = srgb.map(versLineaire);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const teinte = (srgb) => {
  const [, a, b] = oklab(srgb);
  return (Math.atan2(b, a) * 180) / Math.PI;
};

const distanceOklab = (x, y) => {
  const a = oklab(x);
  const b = oklab(y);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

// Matrices de simulation Viénot, Brettel & Mollon (1999), appliquées en
// linéaire. Approximation courante et suffisante pour repérer deux teintes qui
// se referment l'une sur l'autre ; ce n'est pas un modèle clinique.
const CVD = {
  protanopie: [
    [0.11238, 0.88762, 0],
    [0.07276, 0.92724, 0],
    [0.00399, -0.00399, 1],
  ],
  deuteranopie: [
    [0.29275, 0.70725, 0],
    [0.34597, 0.65403, 0],
    [-0.02174, 0.02174, 1],
  ],
  tritanopie: [
    [1, 0.14461, -0.14461],
    [0, 0.85659, 0.14341],
    [0, 0.85659, 0.14341],
  ],
};

function simuler(srgb, type) {
  const c = srgb.map(versLineaire);
  return CVD[type]
    .map((ligne) => ligne[0] * c[0] + ligne[1] * c[1] + ligne[2] * c[2])
    .map((v) => Math.min(1, Math.max(0, versGamma(v))));
}

// --------------------------------------------------------------------------
// Lecture des tokens
// --------------------------------------------------------------------------

/** Les `--token: valeur;` d'un fragment de CSS. */
function tokens(fragment) {
  const table = {};
  for (const m of fragment.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    table[m[1]] = m[2].trim();
  }
  return table;
}

/**
 * Découpe le fichier en ses trois déclarations de tokens. Le thème sombre y est
 * écrit deux fois — media query (réglage OS) et scope `[data-theme]` (bascule
 * dans l'app) — et les deux doivent rester identiques, ce qu'on vérifie.
 */
function lireThemes(css) {
  const debutClair = css.indexOf(':root {');
  const debutMedia = css.indexOf('@media (prefers-color-scheme: dark)');
  const debutScope = css.indexOf(":root[data-theme='dark'] {");
  if (debutClair < 0 || debutMedia < 0 || debutScope < 0) {
    throw new Error('global.css ne contient plus les trois blocs de tokens attendus.');
  }
  const finScope = css.indexOf('/* =', debutScope);
  const clair = tokens(css.slice(debutClair, debutMedia));
  const sombreScope = tokens(css.slice(debutScope, finScope));
  return {
    clair,
    sombreMedia: tokens(css.slice(debutMedia, debutScope)),
    sombreScope,
    // Le bloc sombre ne redéclare que ce qui change : il hérite du clair.
    sombre: { ...clair, ...sombreScope },
  };
}

// --------------------------------------------------------------------------
// Rapport
// --------------------------------------------------------------------------

const erreurs = [];
const avertissements = [];

function verifier({ bloquant = true, ok, message }) {
  if (ok) return;
  (bloquant ? erreurs : avertissements).push(message);
}

/** Récupère une couleur et refuse d'inventer un résultat si le token a disparu. */
function couleur(theme, nomTheme, token) {
  const brute = theme[token];
  if (brute === undefined) {
    erreurs.push(`[${nomTheme}] token absent : ${token}`);
    return null;
  }
  // `rgba()`, `color-mix()`, etc. : hors de portée d'un contrôle statique.
  return versSrgb(brute);
}

// --------------------------------------------------------------------------
// Règles
// --------------------------------------------------------------------------

const SURFACES = ['--plane', '--surface-1', '--surface-2', '--surface-inset'];

/** Texte posé sur les surfaces de l'application, et seuil applicable. */
const TEXTES = [
  ['--text-primary', AA_TEXTE],
  ['--text-secondary', AA_TEXTE],
  ['--text-muted', AA_TEXTE_SECONDAIRE],
  ['--status-good-ink', AA_TEXTE],
  ['--status-warning-ink', AA_TEXTE],
  ['--status-serious-ink', AA_TEXTE],
  ['--status-critical-ink', AA_TEXTE],
  ['--accent', AA_TEXTE], // les liens sont colorés en `--accent`
];

function regleTexteSurFond(theme, nom) {
  for (const [token, seuil] of TEXTES) {
    const encre = couleur(theme, nom, token);
    if (!encre) continue;
    for (const surface of SURFACES) {
      const fond = couleur(theme, nom, surface);
      if (!fond) continue;
      const ratio = contraste(encre, fond);
      verifier({
        ok: ratio >= seuil,
        message: `[${nom}] ${token} sur ${surface} : ${ratio.toFixed(2)}:1 (minimum ${seuil}:1)`,
      });
    }
  }
}

/**
 * Paires encre/fond explicites : chaque `--*-ink-N` n'existe que pour être posé
 * sur son `--*-N`, c'est un contrat que la palette se donne à elle-même.
 */
function reglePairesEncreFond(theme, nom) {
  const paires = [
    ['--accent-ink', '--accent'],
    ['--accent-ink', '--accent-deep'],
  ];
  for (let i = 1; i <= 5; i++) paires.push([`--rpe-ink-${i}`, `--rpe-${i}`]);

  for (const [encreToken, fondToken] of paires) {
    const encre = couleur(theme, nom, encreToken);
    const fond = couleur(theme, nom, fondToken);
    if (!encre || !fond) continue;
    const ratio = contraste(encre, fond);
    verifier({
      ok: ratio >= AA_TEXTE,
      message: `[${nom}] ${encreToken} sur ${fondToken} : ${ratio.toFixed(2)}:1 (minimum ${AA_TEXTE}:1)`,
    });
  }
}

/**
 * Rampe ordinale RPE : cinq paliers d'une même intensité. Trois propriétés la
 * rendent lisible comme un ordre et non comme cinq couleurs arbitraires — une
 * seule teinte, une clarté monotone, et des écarts assez larges pour que deux
 * paliers voisins ne se confondent pas.
 */
function regleRampeOrdinale(theme, nom) {
  const rampe = [];
  for (let i = 1; i <= 5; i++) {
    const c = couleur(theme, nom, `--rpe-${i}`);
    if (!c) return;
    rampe.push(c);
  }

  const teintes = rampe.map(teinte);
  const dispersion = Math.max(...teintes) - Math.min(...teintes);
  verifier({
    ok: dispersion <= TEINTE_ORDINALE_MAX,
    message: `[${nom}] rampe RPE : ${dispersion.toFixed(1)} degres de dispersion de teinte (maximum ${TEINTE_ORDINALE_MAX})`,
  });

  const clartes = rampe.map((c) => oklab(c)[0]);
  const sens = Math.sign(clartes[1] - clartes[0]);
  for (let i = 1; i < clartes.length; i++) {
    const pas = clartes[i] - clartes[i - 1];
    verifier({
      ok: Math.sign(pas) === sens,
      message: `[${nom}] rampe RPE : la clarté n'est pas monotone entre --rpe-${i} et --rpe-${i + 1}`,
    });
    verifier({
      ok: Math.abs(pas) >= ECART_ORDINAL_MIN,
      message: `[${nom}] rampe RPE : écart de clarté de ${Math.abs(pas).toFixed(3)} entre --rpe-${i} et --rpe-${i + 1} (minimum ${ECART_ORDINAL_MIN})`,
    });
  }
}

/** Les deux déclarations du thème sombre doivent rester jumelles. */
function regleThemesSombresJumeaux(themes) {
  const noms = new Set([...Object.keys(themes.sombreMedia), ...Object.keys(themes.sombreScope)]);
  for (const token of noms) {
    const media = themes.sombreMedia[token];
    const scope = themes.sombreScope[token];
    verifier({
      ok: media === scope,
      message: `[sombre] ${token} diffère entre la media query (${media ?? 'absent'}) et le scope [data-theme] (${scope ?? 'absent'})`,
    });
  }
}

/** Marques de graphique : traits et barres, jugés au seuil des objets graphiques. */
function regleSeriesDataViz(theme, nom) {
  for (let i = 1; i <= 5; i++) {
    const serie = couleur(theme, nom, `--series-${i}`);
    if (!serie) continue;
    for (const surface of ['--plane', '--surface-1']) {
      const fond = couleur(theme, nom, surface);
      if (!fond) continue;
      const ratio = contraste(serie, fond);
      verifier({
        bloquant: false,
        ok: ratio >= AA_GRAPHIQUE,
        message: `[${nom}] --series-${i} sur ${surface} : ${ratio.toFixed(2)}:1 (recommandé ${AA_GRAPHIQUE}:1)`,
      });
    }
  }
}

/** Les séries doivent rester distinctes sous les trois dichromatismes. */
function regleCvd(theme, nom) {
  const series = [];
  for (let i = 1; i <= 5; i++) {
    const c = couleur(theme, nom, `--series-${i}`);
    if (!c) return;
    series.push(c);
  }

  for (const type of Object.keys(CVD)) {
    const vues = series.map((c) => simuler(c, type));
    for (let i = 0; i < vues.length; i++) {
      for (let j = i + 1; j < vues.length; j++) {
        const d = distanceOklab(vues[i], vues[j]);
        verifier({
          bloquant: false,
          ok: d >= DISTANCE_CVD_MIN,
          message: `[${nom}] ${type} : --series-${i + 1} et --series-${j + 1} se confondent (ΔOKLab ${d.toFixed(3)}, minimum ${DISTANCE_CVD_MIN})`,
        });
      }
    }
  }
}

// --------------------------------------------------------------------------
// Exécution
// --------------------------------------------------------------------------

const ordinalSeulement = process.argv.includes('--ordinal');
const themes = lireThemes(await readFile(CSS, 'utf8'));

for (const [nom, theme] of [
  ['clair', themes.clair],
  ['sombre', themes.sombre],
]) {
  regleRampeOrdinale(theme, nom);
  if (ordinalSeulement) continue;
  regleTexteSurFond(theme, nom);
  reglePairesEncreFond(theme, nom);
  regleSeriesDataViz(theme, nom);
  regleCvd(theme, nom);
}
if (!ordinalSeulement) regleThemesSombresJumeaux(themes);

const portee = ordinalSeulement ? 'rampe ordinale RPE' : 'palette complète';
console.log(`Palette — ${portee} (src/styles/global.css)\n`);

for (const message of avertissements) console.log(`  avertissement  ${message}`);
for (const message of erreurs) console.log(`  ÉCHEC          ${message}`);

if (erreurs.length === 0 && avertissements.length === 0) {
  console.log('  ok             toutes les règles sont respectées.');
} else {
  console.log(`\n${erreurs.length} échec(s), ${avertissements.length} avertissement(s).`);
}

process.exit(erreurs.length === 0 ? 0 : 1);
