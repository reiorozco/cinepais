/**
 * Deterministic typographic poster generator.
 *
 * Reads the film table exported from `../prisma/seed` and writes one SVG per
 * film to `web/public/posters/<film.id>.svg`. Run it with the project's `tsx`:
 *
 *     npx tsx web/scripts/generate-posters.ts
 *
 * `POSTERS_OUT_DIR` redirects the output elsewhere; it exists for the
 * double-run determinism check and for the byte-identity test, and changes the
 * destination only — never a single byte of the files themselves.
 *
 * Two hard constraints shape everything below.
 *
 * 1. DETERMINISM. Two runs must produce byte-identical files, so there is no
 *    `Date`, no `Math.random`, no locale-sensitive formatting (`toUpperCase`
 *    and `Number::toString` are both locale-independent by spec; their
 *    `toLocale*` siblings are not and are never used) and no iteration over
 *    object keys. Every per-film variation is derived from `hashCode(film.id)`,
 *    the same pure hash the seed already uses.
 *
 * 2. FONTS DO NOT CROSS THE DOCUMENT BOUNDARY. An SVG referenced from `<img>`
 *    or `next/image` renders in an isolated document: the page's CSS and web
 *    fonts do not apply inside it, so only fonts installed on the viewer's
 *    machine resolve. Hence (a) a system stack rather than a web-font name, and
 *    (b) `textLength` + `lengthAdjust="spacingAndGlyphs"` on every text run, so
 *    a line occupies the same width whichever font actually substitutes. The
 *    tables below are Helvetica's own advance widths, which is why the fitted
 *    size needs no distortion at all on the fonts the stack actually names.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { FILMS, hashCode, type FilmSeed } from "../prisma/seed";

// ---------------------------------------------------------------------------
// Canvas — 2:3, matching the `aspect-[2/3]` wrappers every consumer already uses
// ---------------------------------------------------------------------------
const W = 600;
const H = 900;
const MARGIN = 64;
const CONTENT = W - MARGIN * 2;

/** Helvetica cap height, as a fraction of the em. Used to top-align the rule. */
const CAP = 0.717;
/** Title tracking. <1 tightens; applied through `textLength`, not `letter-spacing`. */
const TITLE_TRACK = 0.985;
/** Metadata tracking. >1 opens the micro-type up so it reads as a label. */
const META_TRACK = 1.18;

const TITLE_MIN = 44;
const TITLE_MAX = 100;
/** Below this fitted size a one-line title stops being legible at grid size. */
const ONE_LINE_MIN = 72;

const FONT_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// Vertical anchors. The lower block is bottom-anchored so the title always
// sits the same distance off the base plate whatever size it ends up at.
const META_BASELINE = 838;
const TITLE_BASELINE = 782;
const RULE_GAP = 46;
const MARK_CX = 300;
const MARK_CY = 316;

// ---------------------------------------------------------------------------
// Helvetica advance widths, 1000 units/em, for the glyphs these titles use.
// Titles are set uppercase (a cinema-poster convention that also buys real
// legibility at the ~180px grid size these are seen at most often).
// ---------------------------------------------------------------------------
const BOLD_W: Record<string, number> = {
  " ": 278, "·": 278, "-": 333, "'": 238, ".": 278, ",": 278, ":": 333,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
  J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  Á: 722, É: 667, Í: 278, Ó: 778, Ú: 722, Ñ: 722, Ü: 722,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556,
  "7": 556, "8": 556, "9": 556,
};

const REGULAR_W: Record<string, number> = {
  " ": 278, "·": 278, "-": 333, "'": 191, ".": 278, ",": 278, ":": 278,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
  J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  Á: 667, É: 667, Í: 278, Ó: 778, Ú: 722, Ñ: 722, Ü: 722,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556,
  "7": 556, "8": 556, "9": 556,
};

/** Width of `text` in em units. Unknown glyphs fall back to a mid advance. */
function emWidth(text: string, table: Record<string, number>): number {
  let total = 0;
  for (const ch of text) total += table[ch] ?? 600;
  return total / 1000;
}

// ---------------------------------------------------------------------------
// Palette — keyed on the FIRST genre. This record is the whole colour system:
// every fill and stroke in the SVG traces back to one of its five slots.
// ---------------------------------------------------------------------------
type Palette = {
  /** Top of the field gradient. */
  top: string;
  /** Midpoint, so the field is a curve rather than a straight ramp. */
  mid: string;
  /** Base of the field, and the plate the title is read against. */
  base: string;
  /** The one saturated colour: mark, glow, rule. */
  accent: string;
  /** Title. */
  ink: string;
  /** Metadata micro-type. */
  muted: string;
};

/**
 * The seven first-genres the seed actually ships, plus a fallback.
 *
 * FALLBACK is unreachable from live data on purpose — it exists so a film added
 * later with an unlisted genre gets a real poster instead of a blank gradient
 * or a crash. It is exercised by the QA run, never by the catalogue.
 */
const FALLBACK: Palette = {
  top: "#26292D", mid: "#191B1E", base: "#0C0D0F",
  accent: "#9BA3AC", ink: "#F2F4F6", muted: "#98A0A8",
};

const PALETTES: Record<string, Palette> = {
  Terror: {
    top: "#1A0A0C", mid: "#100608", base: "#070405",
    accent: "#C0303A", ink: "#F5EDEE", muted: "#B2868B",
  },
  "Ciencia ficción": {
    top: "#0B1E33", mid: "#07121F", base: "#04080F",
    accent: "#3FC7E0", ink: "#EAF6FA", muted: "#8FB6C6",
  },
  Familiar: {
    top: "#3A2210", mid: "#22130A", base: "#140A05",
    accent: "#F0A65C", ink: "#FEF3E7", muted: "#C9A483",
  },
  Drama: {
    top: "#2A2320", mid: "#1A1614", base: "#0E0C0B",
    accent: "#C4A98C", ink: "#F4EFE9", muted: "#A99C8E",
  },
  Acción: {
    top: "#1C1F23", mid: "#121417", base: "#0A0B0D",
    accent: "#FFC53D", ink: "#F3F5F7", muted: "#9AA2AB",
  },
  Suspenso: {
    top: "#0D2220", mid: "#081413", base: "#040A0A",
    accent: "#4FB79C", ink: "#EAF5F2", muted: "#8FB3AB",
  },
  Aventura: {
    top: "#43230F", mid: "#28140A", base: "#170B06",
    accent: "#E8853A", ink: "#FDF0E4", muted: "#C69A76",
  },
};

/** Direct key access, never iteration — key order must not reach the output. */
function paletteFor(genres: readonly string[]): Palette {
  const primary = genres[0];
  if (primary === undefined) return FALLBACK;
  return PALETTES[primary] ?? FALLBACK;
}

// ---------------------------------------------------------------------------
// Title layout — SVG does not wrap, so the wrap is computed here
// ---------------------------------------------------------------------------
type TitleLayout = { lines: string[]; fontSize: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Fit the title to the content width, on one line when that stays legible and
 * on two balanced lines otherwise. Two is the ceiling: a third line would push
 * the block into the mark. The split minimises the difference between the two
 * lines' widths, which is what keeps a wrapped title reading as one object.
 */
function layoutTitle(title: string): TitleLayout {
  const upper = title.toUpperCase();
  const oneLineFit = CONTENT / (emWidth(upper, BOLD_W) * TITLE_TRACK);
  const words = upper.split(" ");
  if (oneLineFit >= ONE_LINE_MIN || words.length < 2) {
    return { lines: [upper], fontSize: clamp(oneLineFit, TITLE_MIN, TITLE_MAX) };
  }

  let split = 1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const head = emWidth(words.slice(0, i).join(" "), BOLD_W);
    const tail = emWidth(words.slice(i).join(" "), BOLD_W);
    const delta = Math.abs(head - tail);
    if (delta < bestDelta) {
      bestDelta = delta;
      split = i;
    }
  }

  const lines = [words.slice(0, split).join(" "), words.slice(split).join(" ")];
  const widest = Math.max(...lines.map((line) => emWidth(line, BOLD_W)));
  return { lines, fontSize: clamp(CONTENT / (widest * TITLE_TRACK), TITLE_MIN, TITLE_MAX) };
}

// ---------------------------------------------------------------------------
// SVG emission
// ---------------------------------------------------------------------------
/** Two decimals, then `Number::toString` — specified, and locale-independent. */
const fmt = (n: number): string => String(Math.round(n * 100) / 100);

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * One restrained geometric mark, chosen from `film.id`. All four variants share
 * a language — thin accent strokes over one low-opacity fill — so the set reads
 * as a family, and all four stay subordinate to the title.
 */
function markFor(hash: number, accent: string): string {
  const tilt = (hash % 21) - 10;
  const stroke = `fill="none" stroke="${accent}" stroke-width="2.5" opacity="0.62"`;
  const shapes = [
    // eclipse
    `<circle cx="300" cy="316" r="140" ${stroke}/>` +
      `<circle cx="342" cy="292" r="140" fill="${accent}" opacity="0.13"/>`,
    // orbit
    `<circle cx="300" cy="316" r="58" fill="${accent}" opacity="0.16"/>` +
      `<ellipse cx="300" cy="316" rx="176" ry="54" ${stroke}/>` +
      `<ellipse cx="300" cy="316" rx="176" ry="54" fill="none" stroke="${accent}"` +
      ` stroke-width="1.5" opacity="0.32" transform="rotate(58 300 316)"/>`,
    // prism
    `<polygon points="300,182 442,452 158,452" ${stroke}/>` +
      `<rect x="140" y="352" width="320" height="44" fill="${accent}" opacity="0.13"/>`,
    // aperture
    `<rect x="196" y="212" width="208" height="208" ${stroke} transform="rotate(45 300 316)"/>` +
      `<rect x="238" y="254" width="124" height="124" fill="${accent}" opacity="0.13"/>`,
  ];
  return (
    `  <g transform="rotate(${fmt(tilt)} ${MARK_CX} ${MARK_CY})">${shapes[hash % shapes.length]}</g>`
  );
}

function renderPoster(film: FilmSeed): string {
  const hash = hashCode(film.id) >>> 0;
  const p = paletteFor(film.genres);
  const { lines, fontSize } = layoutTitle(film.title);

  const leading = fontSize * 1.02;
  const firstBaseline = TITLE_BASELINE - leading * (lines.length - 1);
  const ruleY = firstBaseline - fontSize * CAP - RULE_GAP;

  const titleRuns = lines
    .map((line, i) => {
      const y = firstBaseline + leading * i;
      const len = emWidth(line, BOLD_W) * fontSize * TITLE_TRACK;
      return (
        `  <text x="${MARGIN}" y="${fmt(y)}" textLength="${fmt(len)}"` +
        ` lengthAdjust="spacingAndGlyphs" fill="${p.ink}" font-family="${FONT_STACK}"` +
        ` font-size="${fmt(fontSize)}" font-weight="700">${escapeXml(line)}</text>`
      );
    })
    .join("\n");

  const meta = `${film.genres[0] ?? "CINE"} · ${film.durationMin} MIN`.toUpperCase();
  const metaSize = 21;
  const metaLen = emWidth(meta, REGULAR_W) * metaSize * META_TRACK;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>${escapeXml(film.title)}</title>
  <defs>
    <linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.top}"/>
      <stop offset="0.55" stop-color="${p.mid}"/>
      <stop offset="1" stop-color="${p.base}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${p.accent}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="${p.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.4" r="0.75">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="0.6" stop-color="#000000" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.72"/>
    </radialGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="3" seed="${hash % 1000}" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#field)"/>
  <circle cx="${MARK_CX}" cy="${MARK_CY}" r="270" fill="url(#glow)"/>
${markFor(hash, p.accent)}
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.14"/>
  <rect x="${MARGIN}" y="${fmt(ruleY)}" width="56" height="4" fill="${p.accent}"/>
${titleRuns}
  <text x="${MARGIN}" y="${META_BASELINE}" textLength="${fmt(metaLen)}" lengthAdjust="spacingAndGlyphs" fill="${p.muted}" font-family="${FONT_STACK}" font-size="${metaSize}" font-weight="400">${escapeXml(meta)}</text>
</svg>
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  const outDir = process.env.POSTERS_OUT_DIR
    ? resolve(process.env.POSTERS_OUT_DIR)
    : resolve(__dirname, "../public/posters");
  mkdirSync(outDir, { recursive: true });

  console.log(`posters -> ${outDir}`);
  console.log("  film      lines  size   genre           title");
  for (const film of FILMS) {
    const svg = renderPoster(film);
    writeFileSync(join(outDir, `${film.id}.svg`), svg, "utf8");
    const { lines, fontSize } = layoutTitle(film.title);
    const known = film.genres[0] !== undefined && film.genres[0] in PALETTES;
    console.log(
      `  ${film.id}  ${String(lines.length).padStart(5)}  ${fmt(fontSize).padStart(5)}  ` +
        `${(film.genres[0] ?? "—").padEnd(15)} ${lines.join(" / ")}${known ? "" : "  [FALLBACK PALETTE]"}`
    );
  }
  console.log(`done: ${FILMS.length} posters`);
}

main();
