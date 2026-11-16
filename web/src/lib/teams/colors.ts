/**
 * Team identity for the broadcast look: a short code, primary and secondary
 * colours, and the text and chart colours derived from them. Presentational
 * only; nothing here is data. The colours are the sides' familiar kit and
 * flag colours, not logos or trademarks.
 *
 * Every colour drawn as text or as a chart mark is derived, not hand-picked:
 *   - `on` is white or ink, whichever contrasts more with `primary` (and with
 *     `deep`, the other end of the hero gradient); colors.test.ts checks it
 *     is at least 4.5:1 for every team.
 *   - `lineDark` and `lineLight` are `primary` lightened or darkened until it
 *     is at least 3:1 against the card surface in the dark and light themes,
 *     so it can draw a chart line, a bar or a meter segment.
 */

export type TeamIdentity = {
  /** The team name as given. */
  name: string;
  /** Two- or three-letter code for score bugs ("IND", "WI"). */
  code: string;
  /** True for the teams with their own colours; others get the neutral palette. */
  known: boolean;
  primary: string;
  secondary: string;
  /** The far end of the hero gradient: primary pushed away from `on`, so text contrast only grows. */
  deep: string;
  /** Text on `primary` and on `deep`. */
  on: string;
  /** Chart and meter colour on the dark and light card surfaces (at least 3:1). */
  lineDark: string;
  lineLight: string;
  /** ISO 3166 code of the flag the side plays under (flag-icons naming), or null for a colour badge. */
  flag: string | null;
};

type TeamDef = { code: string; primary: string; secondary: string };

/** Full members and the associates seen most often in Cricsheet's internationals. */
const TEAMS: Record<string, TeamDef> = {
  India: { code: "IND", primary: "#1d4fa3", secondary: "#ff9933" },
  Australia: { code: "AUS", primary: "#ffc72c", secondary: "#00843d" },
  England: { code: "ENG", primary: "#0b2d6b", secondary: "#d2122e" },
  Pakistan: { code: "PAK", primary: "#01672f", secondary: "#e8f5e9" },
  "South Africa": { code: "SA", primary: "#006b3f", secondary: "#ffb81c" },
  "New Zealand": { code: "NZ", primary: "#111111", secondary: "#c0c7ce" },
  "Sri Lanka": { code: "SL", primary: "#12357a", secondary: "#ffb81c" },
  Bangladesh: { code: "BAN", primary: "#006a4e", secondary: "#f42a41" },
  "West Indies": { code: "WI", primary: "#7a0019", secondary: "#f2b705" },
  Afghanistan: { code: "AFG", primary: "#0057a8", secondary: "#d32011" },
  Ireland: { code: "IRE", primary: "#0b7a45", secondary: "#c9f0dc" },
  Zimbabwe: { code: "ZIM", primary: "#cf142b", secondary: "#ffd200" },
  Netherlands: { code: "NED", primary: "#f36c21", secondary: "#21468b" },
  Scotland: { code: "SCO", primary: "#1f2a6b", secondary: "#a48bd4" },
  Nepal: { code: "NEP", primary: "#003893", secondary: "#dc143c" },
  "United Arab Emirates": { code: "UAE", primary: "#00732f", secondary: "#ef3340" },
  "United States of America": { code: "USA", primary: "#0a3161", secondary: "#b31942" },
  Namibia: { code: "NAM", primary: "#003580", secondary: "#d21034" },
  Oman: { code: "OMA", primary: "#c8102e", secondary: "#39a845" },
  Canada: { code: "CAN", primary: "#d80621", secondary: "#ffffff" },
  "Hong Kong": { code: "HK", primary: "#de2910", secondary: "#ffffff" },
  "Papua New Guinea": { code: "PNG", primary: "#ce1126", secondary: "#fcd116" },
  Kenya: { code: "KEN", primary: "#006600", secondary: "#bb0000" },
  Uganda: { code: "UGA", primary: "#fcdc04", secondary: "#d90000" },
};

/**
 * The flag each side plays under. England, Scotland and Wales use their own
 * flags (flag-icons' gb-eng, gb-sct, gb-wls). Sides without a national flag
 * (West Indies, composite XIs) are not listed and get a colour badge. Ireland
 * is not listed either: the side represents the whole island, so the Irish
 * tricolour would be the wrong flag.
 */
export const FLAG_CODES: Record<string, string> = {
  Afghanistan: "af",
  Argentina: "ar",
  Australia: "au",
  Austria: "at",
  Bahamas: "bs",
  Bahrain: "bh",
  Bangladesh: "bd",
  Belgium: "be",
  Belize: "bz",
  Bermuda: "bm",
  Bhutan: "bt",
  Botswana: "bw",
  Brazil: "br",
  Bulgaria: "bg",
  Cambodia: "kh",
  Cameroon: "cm",
  Canada: "ca",
  "Cayman Islands": "ky",
  Chile: "cl",
  China: "cn",
  "Cook Islands": "ck",
  "Costa Rica": "cr",
  Croatia: "hr",
  Cyprus: "cy",
  "Czech Republic": "cz",
  Czechia: "cz",
  Denmark: "dk",
  England: "gb-eng",
  Estonia: "ee",
  Eswatini: "sz",
  Swaziland: "sz",
  "Falkland Islands": "fk",
  Fiji: "fj",
  Finland: "fi",
  France: "fr",
  Gambia: "gm",
  Germany: "de",
  Ghana: "gh",
  Gibraltar: "gi",
  Greece: "gr",
  Guernsey: "gg",
  "Hong Kong": "hk",
  Hungary: "hu",
  India: "in",
  Indonesia: "id",
  Iran: "ir",
  "Isle of Man": "im",
  Israel: "il",
  Italy: "it",
  "Ivory Coast": "ci",
  Jamaica: "jm",
  Japan: "jp",
  Jersey: "je",
  Kenya: "ke",
  Kuwait: "kw",
  Lesotho: "ls",
  Luxembourg: "lu",
  Malawi: "mw",
  Malaysia: "my",
  Maldives: "mv",
  Mali: "ml",
  Malta: "mt",
  Mexico: "mx",
  Mongolia: "mn",
  Mozambique: "mz",
  Myanmar: "mm",
  Namibia: "na",
  Nepal: "np",
  Netherlands: "nl",
  "New Zealand": "nz",
  Nigeria: "ng",
  Norway: "no",
  Oman: "om",
  Pakistan: "pk",
  Panama: "pa",
  "Papua New Guinea": "pg",
  Peru: "pe",
  Philippines: "ph",
  Portugal: "pt",
  Qatar: "qa",
  Romania: "ro",
  Rwanda: "rw",
  Samoa: "ws",
  "Saudi Arabia": "sa",
  Scotland: "gb-sct",
  Serbia: "rs",
  Seychelles: "sc",
  "Sierra Leone": "sl",
  Singapore: "sg",
  Slovenia: "si",
  "South Africa": "za",
  "South Korea": "kr",
  Spain: "es",
  "Sri Lanka": "lk",
  "St Helena": "sh-hl",
  Sweden: "se",
  Switzerland: "ch",
  Tanzania: "tz",
  Thailand: "th",
  "Trinidad and Tobago": "tt",
  Turkey: "tr",
  "Turks and Caicos Islands": "tc",
  Uganda: "ug",
  "United Arab Emirates": "ae",
  "United States of America": "us",
  Vanuatu: "vu",
  Wales: "gb-wls",
  Zambia: "zm",
  Zimbabwe: "zw",
};

/** The neutral palette for sides without their own colours. */
const NEUTRAL = { primary: "#26344f", secondary: "#8ea0bd" };

/** Card surfaces the chart colours are checked against (app/globals.css --surface). */
export const SURFACE = { dark: "#0d1422", light: "#ffffff" } as const;
const WHITE = "#ffffff";
const INK = "#0a1020";

// ------------------------------------------------------------------ colour math

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}

function hex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance. */
export function luminance(color: string): number {
  const [r, g, b] = rgb(color).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** `a` mixed towards `b` by `t` (0-1), in sRGB. */
export function mix(a: string, b: string, t: number): string {
  const [p, q] = [rgb(a), rgb(b)];
  return hex([0, 1, 2].map((i) => p[i] + (q[i] - p[i]) * t) as RGB);
}

/** Lighten (towards white) or darken (towards black) until `color` reaches `min` contrast with `against`. */
export function ensureContrast(color: string, against: string, min: number): string {
  if (contrast(color, against) >= min) return color;
  const target = luminance(against) < 0.5 ? WHITE : "#000000";
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(color, target, t);
    if (contrast(c, against) >= min) return c;
  }
  return target;
}

/** OKLab, for judging whether two colours look alike. */
function oklab(color: string): [number, number, number] {
  const [r, g, b] = rgb(color).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** Perceptual distance in OKLab (about 0.1 is a clearly different colour). */
export function distance(a: string, b: string): number {
  const [p, q] = [oklab(a), oklab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

// ------------------------------------------------------------------ identity

/** "India Women" and "india" both find India. */
function canonical(name: string): string {
  const n = name.trim().replace(/\s+women$/i, "");
  const hit = Object.keys(FLAG_CODES).concat(Object.keys(TEAMS)).find((k) => k.toLowerCase() === n.toLowerCase());
  return hit ?? n;
}

/** "Hong Kong" -> "HK", "Germany" -> "GER", "ICC World XI" -> "IWX". */
export function teamCode(name: string): string {
  const n = canonical(name);
  if (TEAMS[n]) return TEAMS[n].code;
  const words = n.split(/[\s-]+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|and|the)$/i.test(w));
  if (words.length > 1) return words.slice(0, 3).map((w) => w[0].toUpperCase()).join("");
  return n.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "?";
}

function textOn(...backgrounds: string[]): string {
  const worst = (c: string) => Math.min(...backgrounds.map((b) => contrast(c, b)));
  return worst(WHITE) >= worst(INK) ? WHITE : INK;
}

const cache = new Map<string, TeamIdentity>();

export function teamIdentity(name: string | null | undefined): TeamIdentity {
  const raw = (name ?? "").trim();
  const hit = cache.get(raw);
  if (hit) return hit;
  const n = canonical(raw);
  const def = TEAMS[n];
  const { primary, secondary } = def ?? NEUTRAL;
  const on = textOn(primary);
  // Push the gradient's far end away from the text colour, so contrast only grows across it.
  const deep = mix(primary, on === WHITE ? "#000000" : WHITE, on === WHITE ? 0.35 : 0.3);
  const id: TeamIdentity = {
    name: raw,
    code: raw ? teamCode(raw) : "?",
    known: Boolean(def),
    primary,
    secondary,
    deep,
    on: textOn(primary, deep),
    lineDark: ensureContrast(primary, SURFACE.dark, 3),
    lineLight: ensureContrast(primary, SURFACE.light, 3),
    flag: FLAG_CODES[n] ?? null,
  };
  cache.set(raw, id);
  return id;
}

/** Okabe-Ito orange, the fallback when two sides' colours look alike. */
const FALLBACK = { lineDark: "#f0a24b", lineLight: "#b35900" };

/**
 * Two sides drawn against each other (a replay, a head to head). When their
 * chart colours are too close to tell apart (India and Sri Lanka are both
 * blue; three sides are green), the second side switches to its secondary
 * colour, and failing that to an Okabe-Ito orange.
 */
export function teamPair(a: string, b: string): [TeamIdentity, TeamIdentity] {
  const A = teamIdentity(a);
  const B = teamIdentity(b);
  const apart = (x: Pick<TeamIdentity, "lineDark" | "lineLight">) => distance(x.lineDark, A.lineDark) >= 0.12 && distance(x.lineLight, A.lineLight) >= 0.12;
  if (apart(B)) return [A, B];
  const alt = { lineDark: ensureContrast(B.secondary, SURFACE.dark, 3), lineLight: ensureContrast(B.secondary, SURFACE.light, 3) };
  return [A, { ...B, ...(apart(alt) ? alt : FALLBACK) }];
}

/** CSS custom properties for a side, for inline styles: --{slot}, --{slot}-deep, --{slot}-on, --{slot}-line. */
export function teamVars(t: TeamIdentity, slot = "team"): Record<string, string> {
  return {
    [`--${slot}`]: t.primary,
    [`--${slot}-2`]: t.secondary,
    [`--${slot}-deep`]: t.deep,
    [`--${slot}-on`]: t.on,
    [`--${slot}-line`]: `light-dark(${t.lineLight}, ${t.lineDark})`,
  };
}
