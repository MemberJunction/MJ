/**
 * @fileoverview The sign-in page design: the document Login Studio edits and the Explorer login screen
 * draws. Stored as JSON on `MJ: Themes` (`LoginScreenDraft` while edited, `LoginScreen` once published)
 * and served before sign-in by `GET /auth/login-screen`.
 *
 * {@link NormalizeLoginDesign} is the schema. The save check, {@link StoredLoginDesignProblems}, refuses
 * any JSON that normalizing would change plus whatever {@link LoginDesignProblems} reports (the list the
 * editor shows), so the editor and the server cannot disagree about what a valid design is.
 *
 * @module @memberjunction/theme-engine
 */

import { ContrastRatio } from './color.js';
import { Derive } from './derive.js';
import type { ThemeLogos } from './logo.js';
import { SanitizeThemeSeeds, type ThemeSeeds } from './seeds.js';

const LOGIN_DESIGN_VERSION = 1;
export const LOGIN_LAYOUTS = ['split', 'split-reverse', 'centered'] as const;
const LOGIN_ALIGNMENTS = ['start', 'center'] as const;
export const LOGIN_BACKGROUNDS = ['brand', 'color', 'gradient', 'image'] as const;
const LOGIN_TONES = ['light', 'dark'] as const;
const LOGIN_PANEL_WIDTHS = ['compact', 'wide'] as const;
const LOGIN_COLOR_KEYS = ['BannerText', 'BannerCardBg', 'BannerCardText', 'PanelBg', 'PanelText', 'CardBg', 'CardText', 'CardBorder'] as const;
export const LOGIN_RADII = ['none', 'sm', 'md', 'lg', 'xl'] as const;
export const LOGIN_BANNER_SHARES = ['narrow', 'balanced', 'wide'] as const;
export const LOGIN_REGIONS = ['Banner', 'PanelTop', 'PanelBottom'] as const;
export const LOGIN_BLOCK_TYPES = ['logo', 'headline', 'text', 'card', 'links', 'image', 'spacer'] as const;
/** Which of the theme's logo variants a logo block shows (the four `MJ: Themes` logo columns). */
export const LOGIN_LOGO_SOURCES = ['light', 'dark', 'wordmark', 'monochrome'] as const;
export const LOGIN_SIZES = ['sm', 'md', 'lg'] as const;
/** How much of its row a block takes; narrower blocks stand side by side. */
export const LOGIN_WIDTHS = ['full', 'half', 'third'] as const;
export const LOGIN_LIMITS = {
  BlocksPerRegion: 12, Heading: 60, Headline: 120, Text: 600, CardTitle: 80, CardText: 240,
  LinkLabel: 60, Links: 8, Alt: 160, URL: 2048, OverlayMax: 85,
} as const;
/** Far above any real design (about 6 KB); bounds the parse. */
const LOGIN_DESIGN_MAX_CHARS = 64_000;

export type LoginLayout = typeof LOGIN_LAYOUTS[number];
export type LoginAlignment = typeof LOGIN_ALIGNMENTS[number];
export type LoginBackgroundKind = typeof LOGIN_BACKGROUNDS[number];
export type LoginTone = typeof LOGIN_TONES[number];
export type LoginPanelWidth = typeof LOGIN_PANEL_WIDTHS[number];
export type LoginRegion = typeof LOGIN_REGIONS[number];
export type LoginBlockType = typeof LOGIN_BLOCK_TYPES[number];
export type LoginLogoSource = typeof LOGIN_LOGO_SOURCES[number];
export type LoginSize = typeof LOGIN_SIZES[number];
export type LoginWidth = typeof LOGIN_WIDTHS[number];
export type LoginColorKey = typeof LOGIN_COLOR_KEYS[number];
export type LoginRadius = typeof LOGIN_RADII[number];
export type LoginBannerShare = typeof LOGIN_BANNER_SHARES[number];

interface LoginBlockBase {
  ID: string;
  /** Share of its row. Once the panes stack (900px and below) every block takes its own row. */
  Width: LoginWidth;
  /** Leave the block out once the panes stack, where the login screen cuts its banner short. */
  HideWhenStacked: boolean;
}
export interface LoginLogoBlock extends LoginBlockBase { Type: 'logo'; Source: LoginLogoSource; Size: LoginSize }
export interface LoginHeadlineBlock extends LoginBlockBase { Type: 'headline'; Text: string; Size: LoginSize }
export interface LoginTextBlock extends LoginBlockBase { Type: 'text'; Text: string; Muted: boolean }
export interface LoginCardBlock extends LoginBlockBase {
  Type: 'card'; Icon: string | null; Title: string; Text: string | null; Href: string | null; NewTab: boolean;
}
export interface LoginLink { Label: string; Href: string }
export interface LoginLinksBlock extends LoginBlockBase { Type: 'links'; Links: LoginLink[] }
export interface LoginImageBlock extends LoginBlockBase { Type: 'image'; URL: string; Alt: string; Size: LoginSize }
export interface LoginSpacerBlock extends LoginBlockBase { Type: 'spacer'; Size: LoginSize }
export type LoginBlock =
  | LoginLogoBlock | LoginHeadlineBlock | LoginTextBlock | LoginCardBlock
  | LoginLinksBlock | LoginImageBlock | LoginSpacerBlock;

export interface LoginBackground {
  Kind: LoginBackgroundKind;
  /** The 'color' fill, or the gradient's first stop. */
  Color: string | null;
  /** The gradient's second stop. */
  Color2: string | null;
  ImageURL: string | null;
  /** Darkening over an image, 0 to {@link LOGIN_LIMITS}.OverlayMax percent. */
  Overlay: number;
}

export interface LoginDesign {
  Version: typeof LOGIN_DESIGN_VERSION;
  Layout: LoginLayout;
  Alignment: LoginAlignment;
  PanelWidth: LoginPanelWidth;
  /** The heading above the sign-in options; null for none. */
  Heading: string | null;
  Background: LoginBackground;
  /** Text on the story panel: 'light' text for a dark background, 'dark' for a light one. */
  Tone: LoginTone;
  /** Color overrides, #rrggbb, by token. Absent means the login screen's default for that token. */
  Colors: Partial<Record<LoginColorKey, string>>;
  /** Corner radius of the cards ('md' is the login screen's default). */
  CardRadius: LoginRadius;
  /** How much of a split page the story panel takes ('balanced' is the stock 1.05 : 1). */
  BannerShare: LoginBannerShare;
  Regions: Record<LoginRegion, LoginBlock[]>;
}

/**
 * The body of `GET /auth/login-screen`: the default Active theme's PUBLISHED design (never its draft),
 * its logo variants and its seeds, each reduced to what is safe on a page with no session.
 */
export interface PublicLoginScreen {
  ThemeName: string | null;
  Design: LoginDesign | null;
  Seeds: ThemeSeeds | null;
  Logos: ThemeLogos;
}

/** The `MJ: Themes` columns the sign-in page reads. */
export interface LoginThemeRow {
  Name: string;
  LoginScreen: string | null;
  Seeds: string | null;
  LightMarkURL: string | null;
  DarkMarkURL: string | null;
  WordmarkURL: string | null;
  MonochromeURL: string | null;
}

/** The block palette, in the order the editor offers it. */
export const LOGIN_BLOCK_META: Record<LoginBlockType, { Label: string; Icon: string; Hint: string }> = {
  logo: { Label: 'Logo', Icon: 'fa-solid fa-certificate', Hint: 'A logo from the default theme' },
  headline: { Label: 'Headline', Icon: 'fa-solid fa-heading', Hint: 'A large line of text' },
  text: { Label: 'Text', Icon: 'fa-solid fa-align-left', Hint: 'A paragraph' },
  card: { Label: 'Card', Icon: 'fa-regular fa-square', Hint: 'An icon, title and note, with an optional link' },
  links: { Label: 'Links', Icon: 'fa-solid fa-link', Hint: 'A row of links, e.g. help or privacy' },
  image: { Label: 'Image', Icon: 'fa-regular fa-image', Hint: 'A picture from a web address' },
  spacer: { Label: 'Spacer', Icon: 'fa-solid fa-arrows-up-down', Hint: 'Space between blocks' },
};

export const LOGIN_REGION_LABEL: Record<LoginRegion, string> = {
  Banner: 'Story panel',
  PanelTop: 'Above sign-in',
  PanelBottom: 'Below sign-in',
};

export const LOGIN_LOGO_SOURCE_LABEL: Record<LoginLogoSource, string> = {
  light: 'Mark for light surfaces',
  dark: 'Mark for dark surfaces',
  wordmark: 'Wordmark',
  monochrome: 'Monochrome',
};

/** The Font Awesome icons a card may carry, with what each means: a closed list, so a stored class is never arbitrary. */
export const LOGIN_CARD_ICONS: Readonly<Record<string, string>> = {
  'fa-solid fa-circle-info': 'Information', 'fa-solid fa-circle-question': 'Question', 'fa-solid fa-life-ring': 'Help',
  'fa-solid fa-shield-halved': 'Security', 'fa-solid fa-lock': 'Lock', 'fa-solid fa-envelope': 'Email',
  'fa-solid fa-phone': 'Phone', 'fa-solid fa-book-open': 'Guide', 'fa-solid fa-graduation-cap': 'Learning',
  'fa-solid fa-calendar-days': 'Calendar', 'fa-solid fa-star': 'Star', 'fa-solid fa-bolt': 'Quick start',
  'fa-solid fa-users': 'Community', 'fa-solid fa-building': 'Organization', 'fa-solid fa-globe': 'Website',
  'fa-solid fa-comments': 'Conversation', 'fa-solid fa-file-lines': 'Document', 'fa-solid fa-hand-holding-heart': 'Support',
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID_PATTERN = /^[a-z0-9-]{1,40}$/;

/** A design color: #rrggbb, the only form a design stores. */
export function IsLoginHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

/** Links: https or mailto only. Anything else (javascript:, data:, a relative path) is refused. */
export function IsSafeLoginHref(href: unknown): href is string {
  if (typeof href !== 'string' || !href || href.length > LOGIN_LIMITS.URL) return false;
  return /^https:\/\/[^\s"'<>()\\]+$/i.test(href) || /^mailto:[^\s"'<>()\\]+@[^\s"'<>()\\]+$/i.test(href);
}

/** Images: https, or one of the app's own /assets. Never a data: URI (size) or http (mixed content). */
export function IsSafeLoginImageURL(url: unknown): url is string {
  if (typeof url !== 'string' || !url || url.length > LOGIN_LIMITS.URL) return false;
  return /^https:\/\/[^\s"'<>()\\]+$/i.test(url) || /^\/assets\/(?!.*\.\.)[A-Za-z0-9/_.-]+$/.test(url);
}

/** The starter design: the stock login screen's own content, as blocks the editor can change. */
export function DefaultLoginDesign(): LoginDesign {
  return {
    Version: LOGIN_DESIGN_VERSION,
    Layout: 'split',
    Alignment: 'start',
    PanelWidth: 'compact',
    Heading: 'Log in',
    Background: { Kind: 'brand', Color: null, Color2: null, ImageURL: null, Overlay: 40 },
    Tone: 'light',
    Colors: {},
    CardRadius: 'md',
    BannerShare: 'balanced',
    Regions: {
      Banner: [
        // The variant for dark surfaces, which the stock banner is. Keys in the normalizer's order, so the
        // starter reads back byte for byte.
        { ID: newBlockID(), Width: 'full', HideWhenStacked: false, Type: 'logo', Source: 'dark', Size: 'md' },
        { ID: newBlockID(), Width: 'full', HideWhenStacked: true, Type: 'headline', Text: 'Welcome back', Size: 'lg' },
        { ID: newBlockID(), Width: 'full', HideWhenStacked: true, Type: 'text', Text: 'Sign in to continue.', Muted: true },
      ],
      PanelTop: [],
      PanelBottom: [],
    },
  };
}

function newBlockID(): string {
  // randomUUID needs a secure context, which an Explorer served over plain http is not.
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `b-${r}`;
}

export function NewLoginBlock(type: LoginBlockType): LoginBlock {
  const base = { ID: newBlockID(), Width: 'full' as const, HideWhenStacked: false };
  switch (type) {
    case 'logo': return { ...base, Type: type, Source: 'dark', Size: 'md' };
    case 'headline': return { ...base, Type: type, Text: 'Welcome', Size: 'lg' };
    case 'text': return { ...base, Type: type, Text: 'Add a sentence or two.', Muted: false };
    case 'card': return { ...base, Type: type, Icon: 'fa-solid fa-circle-info', Title: 'Need help signing in?', Text: null, Href: null, NewTab: true };
    case 'links': return { ...base, Type: type, Links: [{ Label: 'Privacy', Href: 'https://' }] };
    case 'image': return { ...base, Type: type, URL: '', Alt: '', Size: 'md' };
    case 'spacer': return { ...base, Type: type, Size: 'md' };
  }
}

/** Where a block sits in a design, or null. Block IDs are design-local keys (`b-...`), not UUIDs. */
export function LocateLoginBlock(d: LoginDesign, id: string): { Region: LoginRegion; Index: number } | null {
  for (const region of LOGIN_REGIONS) {
    const index = d.Regions[region].findIndex(({ ID: blockID }) => blockID === id);
    if (index >= 0) return { Region: region, Index: index };
  }
  return null;
}

/** A copy of a block with a fresh ID: what Duplicate inserts. */
export function CloneLoginBlock(b: LoginBlock): LoginBlock {
  return { ...(JSON.parse(JSON.stringify(b)) as LoginBlock), ID: newBlockID() };
}

// ── Reading a stored design ──────────────────────────────────────────────────────────────────

const own = (o: object, k: string): boolean => Object.hasOwn(o, k);
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v as T : fallback);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const strOrNull = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** A stored JSON string to a design, or null when there is none or it is unreadable. Never throws. */
export function ParseLoginDesign(raw: string | null | undefined): LoginDesign | null {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > LOGIN_DESIGN_MAX_CHARS) return null;
  try {
    return NormalizeLoginDesign(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Any value to a well-formed design, dropping what does not fit the contract; null if it is not one. */
export function NormalizeLoginDesign(v: unknown): LoginDesign | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  if (d['Version'] !== LOGIN_DESIGN_VERSION) return null;
  return {
    Version: LOGIN_DESIGN_VERSION,
    Layout: pick(d['Layout'], LOGIN_LAYOUTS, 'split'),
    Alignment: pick(d['Alignment'], LOGIN_ALIGNMENTS, 'start'),
    PanelWidth: pick(d['PanelWidth'], LOGIN_PANEL_WIDTHS, 'compact'),
    Heading: strOrNull(d['Heading'], LOGIN_LIMITS.Heading),
    Background: normalizeBackground(obj(d['Background'])),
    Tone: pick(d['Tone'], LOGIN_TONES, 'light'),
    Colors: normalizeColors(d['Colors']),
    CardRadius: pick(d['CardRadius'], LOGIN_RADII, 'md'),
    BannerShare: pick(d['BannerShare'], LOGIN_BANNER_SHARES, 'balanced'),
    Regions: normalizeRegions(obj(d['Regions'])),
  };
}

function normalizeBackground(bg: Record<string, unknown>): LoginBackground {
  const overlay = bg['Overlay'];
  return {
    Kind: pick(bg['Kind'], LOGIN_BACKGROUNDS, 'brand'),
    Color: IsLoginHexColor(bg['Color']) ? bg['Color'] : null,
    Color2: IsLoginHexColor(bg['Color2']) ? bg['Color2'] : null,
    ImageURL: IsSafeLoginImageURL(bg['ImageURL']) ? bg['ImageURL'] : null,
    Overlay: typeof overlay === 'number' && Number.isFinite(overlay)
      ? Math.max(0, Math.min(LOGIN_LIMITS.OverlayMax, Math.round(overlay)))
      : 40,
  };
}

function normalizeColors(v: unknown): Partial<Record<LoginColorKey, string>> {
  const out: Partial<Record<LoginColorKey, string>> = {};
  const c = obj(v);
  for (const k of LOGIN_COLOR_KEYS) {
    if (IsLoginHexColor(c[k])) out[k] = c[k];
  }
  return out;
}

function normalizeRegions(regionsIn: Record<string, unknown>): Record<LoginRegion, LoginBlock[]> {
  const regions = {} as Record<LoginRegion, LoginBlock[]>;
  for (const r of LOGIN_REGIONS) {
    const list = Array.isArray(regionsIn[r]) ? regionsIn[r] as unknown[] : [];
    regions[r] = list.map(normalizeBlock).filter((b): b is LoginBlock => b !== null).slice(0, LOGIN_LIMITS.BlocksPerRegion);
  }
  return regions;
}

function normalizeBlock(v: unknown): LoginBlock | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const b = v as Record<string, unknown>;
  const base = {
    ID: typeof b['ID'] === 'string' && ID_PATTERN.test(b['ID']) ? b['ID'] : newBlockID(),
    Width: pick(b['Width'], LOGIN_WIDTHS, 'full'),
    HideWhenStacked: b['HideWhenStacked'] === true,
  };
  const size = pick(b['Size'], LOGIN_SIZES, 'md');
  switch (b['Type']) {
    case 'logo': return { ...base, Type: 'logo', Source: pick(b['Source'], LOGIN_LOGO_SOURCES, 'light'), Size: size };
    case 'headline': return { ...base, Type: 'headline', Text: str(b['Text'], LOGIN_LIMITS.Headline), Size: size };
    case 'text': return { ...base, Type: 'text', Text: str(b['Text'], LOGIN_LIMITS.Text), Muted: b['Muted'] === true };
    case 'card': return {
      ...base, Type: 'card',
      Icon: typeof b['Icon'] === 'string' && own(LOGIN_CARD_ICONS, b['Icon']) ? b['Icon'] : null,
      Title: str(b['Title'], LOGIN_LIMITS.CardTitle),
      Text: strOrNull(b['Text'], LOGIN_LIMITS.CardText),
      Href: IsSafeLoginHref(b['Href']) ? b['Href'] : null,
      NewTab: b['NewTab'] !== false,
    };
    case 'links': {
      // Links keep their draft state ('' label, 'https://' href) so the editor can show what to fix;
      // the renderer draws only the safe ones, and LoginDesignProblems blocks saving the rest.
      const links = (Array.isArray(b['Links']) ? b['Links'] : []).map(obj)
        .map((l) => ({ Label: str(l['Label'], LOGIN_LIMITS.LinkLabel), Href: str(l['Href'], LOGIN_LIMITS.URL) }))
        .slice(0, LOGIN_LIMITS.Links);
      return { ...base, Type: 'links', Links: links };
    }
    case 'image':
      // As with links, the URL is kept as written rather than checked here, so an unsafe one is reported by
      // LoginBlockProblems ("needs an https:// address") instead of silently emptied. Nothing unsafe is drawn:
      // <mj-login-region> shows only a safe URL, and a design with a problem is never saved or served.
      return { ...base, Type: 'image', URL: str(b['URL'], LOGIN_LIMITS.URL), Alt: str(b['Alt'], LOGIN_LIMITS.Alt), Size: size };
    case 'spacer': return { ...base, Type: 'spacer', Size: size };
    default: return null;
  }
}

/**
 * Any value to what a page with no session may see: the design only when it is well-formed and has no
 * problem (else the stock page), seeds and logos made safe. The route and the browser both run it.
 */
export function SanitizePublicLoginScreen(v: unknown): PublicLoginScreen {
  const o = obj(v);
  const design = NormalizeLoginDesign(o['Design']);
  return {
    ThemeName: typeof o['ThemeName'] === 'string' ? o['ThemeName'] : null,
    Design: design && LoginDesignProblems(design).length === 0 ? design : null,
    Seeds: SanitizeThemeSeeds(o['Seeds']),
    Logos: PublicLoginLogos(o['Logos']),
  };
}

/** A theme row's public projection: its PUBLISHED design (never the draft), seeds and logos. */
export function PublicLoginScreenFromTheme(t: LoginThemeRow): PublicLoginScreen {
  let seeds: unknown = null;
  try {
    seeds = t.Seeds ? JSON.parse(t.Seeds) : null;
  } catch {
    // Unreadable seeds: the login screen keeps the stock colors.
  }
  return SanitizePublicLoginScreen({
    ThemeName: t.Name,
    Design: ParseLoginDesign(t.LoginScreen),
    Seeds: seeds,
    Logos: { lightMarkURL: t.LightMarkURL, darkMarkURL: t.DarkMarkURL, wordmarkURL: t.WordmarkURL, monochromeURL: t.MonochromeURL },
  });
}

// ── What may be saved ────────────────────────────────────────────────────────────────────────

/** The reasons a block may not be saved, in words for the editor. Empty when it is fine. */
export function LoginBlockProblems(b: LoginBlock): string[] {
  const out: string[] = [];
  const need = (s: string, what: string, max: number): void => {
    if (!s.trim()) out.push(`${what} is empty.`);
    else if (s.length > max) out.push(`${what} is longer than ${max} characters.`);
  };
  switch (b.Type) {
    case 'headline': need(b.Text, 'The headline', LOGIN_LIMITS.Headline); break;
    case 'text': need(b.Text, 'The text', LOGIN_LIMITS.Text); break;
    case 'card':
      need(b.Title, 'The card title', LOGIN_LIMITS.CardTitle);
      if (b.Text && b.Text.length > LOGIN_LIMITS.CardText) out.push(`The card note is longer than ${LOGIN_LIMITS.CardText} characters.`);
      if (b.Href && !IsSafeLoginHref(b.Href)) out.push('The card link must start with https:// (or be a mailto: address).');
      break;
    case 'links':
      if (b.Links.length === 0) out.push('Add at least one link.');
      b.Links.forEach((l, i) => {
        if (!l.Label.trim()) out.push(`Link ${i + 1} has no label.`);
        if (!IsSafeLoginHref(l.Href)) out.push(`Link ${i + 1} must start with https:// (or be a mailto: address).`);
      });
      break;
    case 'image':
      if (!IsSafeLoginImageURL(b.URL)) out.push('The image needs an https:// address.');
      need(b.Alt, 'The alt text (what a screen reader says)', LOGIN_LIMITS.Alt);
      break;
    default: break;
  }
  return out;
}

/** Every problem in a design, each prefixed with where it is. Empty when it may be saved. */
export function LoginDesignProblems(d: LoginDesign): string[] {
  const out: string[] = [];
  if (d.Heading && d.Heading.length > LOGIN_LIMITS.Heading) out.push(`The sign-in heading is longer than ${LOGIN_LIMITS.Heading} characters.`);
  const bg = d.Background;
  if ((bg.Kind === 'color' || bg.Kind === 'gradient') && !bg.Color) out.push('Pick a background color.');
  if (bg.Kind === 'gradient' && !bg.Color2) out.push('Pick the gradient\'s second color.');
  if (bg.Kind === 'image' && !bg.ImageURL) out.push('The background image needs an https:// address.');
  // Every stored background field is checked, not only the active kind's: the server refuses a bad value wherever it sits.
  if (bg.Color && !HEX.test(bg.Color)) out.push('The background color must be a #rrggbb color.');
  if (bg.Color2 && !HEX.test(bg.Color2)) out.push('The second background color must be a #rrggbb color.');
  if (bg.ImageURL && !IsSafeLoginImageURL(bg.ImageURL)) out.push('The background image needs an https:// address.');
  for (const [k, c] of Object.entries(d.Colors)) {
    if (!HEX.test(c ?? '')) out.push(`${LOGIN_COLOR_LABEL[k as LoginColorKey]} must be a #rrggbb color.`);
  }
  const ids = new Set<string>();
  for (const r of LOGIN_REGIONS) {
    for (const b of d.Regions[r]) {
      if (ids.has(b.ID)) out.push(`${LOGIN_REGION_LABEL[r]}: two blocks share the ID "${b.ID}".`);
      ids.add(b.ID);
      for (const p of LoginBlockProblems(b)) out.push(`${LOGIN_REGION_LABEL[r]} › ${LOGIN_BLOCK_META[b.Type].Label}: ${p}`);
    }
  }
  return out;
}

/**
 * The server's save check for a stored design column: every reason `raw` may not be stored, or [] when
 * it may (NULL or blank means "no design"). It refuses rather than repairs, because the published design
 * is drawn for people who cannot sign in to report it broken.
 */
export function StoredLoginDesignProblems(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined || raw.trim() === '') return [];
  if (raw.length > LOGIN_DESIGN_MAX_CHARS) return [`The design is larger than ${LOGIN_DESIGN_MAX_CHARS} characters.`];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return ['The design is not valid JSON.'];
  }
  const normalized = NormalizeLoginDesign(parsed);
  if (!normalized) return [`The design must be an object with Version ${LOGIN_DESIGN_VERSION}.`];
  const diff = firstDifference(parsed, normalized, '');
  if (diff !== null) return [`The design has a field or value the sign-in page cannot use, at "${diff || '(root)'}".`];
  return LoginDesignProblems(normalized);
}

/** The path of the first place two JSON values differ (key order ignored), or null when equal. */
function firstDifference(a: unknown, b: unknown, path: string): string | null {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return path;
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (d !== null) return d;
    }
    return null;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
      const at = path ? `${path}.${k}` : k;
      // A key one side lacks is a difference, even one like __proto__ that reads as inherited.
      if (own(ao, k) !== own(bo, k)) return at;
      const d = firstDifference(ao[k], bo[k], at);
      if (d !== null) return d;
    }
    return null;
  }
  return a === b ? null : path;
}

// ── How a design paints ──────────────────────────────────────────────────────────────────────

/** A css url('...') value with every character that could end it percent-encoded. */
function cssURL(raw: string): string {
  return `url('${raw.replace(/["'()\s;{}<>\\]/g, (c) => encodeURIComponent(c))}')`;
}

const RADIUS_TOKEN: Record<LoginRadius, string> = {
  none: '0', sm: 'var(--mj-radius-sm)', md: 'var(--mj-radius-md)', lg: 'var(--mj-radius-lg)', xl: 'var(--mj-radius-xl)',
};

/**
 * The `--mj-login-*` tokens a design sets, built only from validated parts. A token the login screen
 * derives from another on :root is restated beside it, because var() resolves where it is declared.
 */
export function LoginDesignTokens(d: LoginDesign | null): Record<string, string> {
  if (!d) return {};
  const t: Record<string, string> = { ...backgroundTokens(d.Background) };
  // Dark text on a light banner stays dark in both color modes, so it names the primitive.
  if (d.Tone === 'dark') Object.assign(t, bannerTextTokens('var(--mj-color-neutral-900)'));
  if (d.PanelWidth === 'wide') t['--mj-login-picker-max-width'] = '24rem';
  Object.assign(t, colorTokens(d.Colors));
  if (d.CardRadius !== 'md') t['--mj-login-card-radius'] = RADIUS_TOKEN[d.CardRadius];
  if (d.BannerShare === 'narrow') t['--mj-login-banner-flex'] = '0.75';
  if (d.BannerShare === 'wide') t['--mj-login-banner-flex'] = '1.5';
  return t;
}

function backgroundTokens(bg: LoginBackground): Record<string, string> {
  if (bg.Kind === 'color' && IsLoginHexColor(bg.Color)) {
    return { '--mj-login-banner-bg': bg.Color };
  }
  if (bg.Kind === 'gradient' && IsLoginHexColor(bg.Color) && IsLoginHexColor(bg.Color2)) {
    return { '--mj-login-banner-bg': `linear-gradient(160deg, ${bg.Color} 0%, ${bg.Color2} 100%)` };
  }
  if (bg.Kind === 'image' && IsSafeLoginImageURL(bg.ImageURL)) {
    const a = (Math.max(0, Math.min(LOGIN_LIMITS.OverlayMax, bg.Overlay)) / 100).toFixed(2);
    // Under the photo while it loads: the chosen color, else the stock banner's first gradient stop.
    const base = IsLoginHexColor(bg.Color) ? bg.Color : 'var(--mj-login-grad-start)';
    return { '--mj-login-banner-bg': `linear-gradient(rgba(0, 0, 0, ${a}), rgba(0, 0, 0, ${a})), ${cssURL(bg.ImageURL)} center / cover no-repeat, ${base}` };
  }
  return {};
}

/** The story panel's text color and the tokens the login screen derives from it. */
function bannerTextTokens(color: string): Record<string, string> {
  return {
    '--mj-login-banner-text': color,
    '--mj-login-banner-text-secondary': `color-mix(in srgb, ${color} 80%, transparent)`,
    '--mj-login-banner-card-bg': `color-mix(in srgb, ${color} 8%, transparent)`,
    '--mj-login-banner-card-border': `color-mix(in srgb, ${color} 20%, transparent)`,
    '--mj-login-banner-card-text': color,
  };
}

/** Colors, with derived tokens restated. A background set without its text color gets a readable one. */
function colorTokens(c: Partial<Record<LoginColorKey, string>>): Record<string, string> {
  const hex = (k: LoginColorKey): string | null => (IsLoginHexColor(c[k]) ? c[k] : null);
  const readable = (bg: string): string => (prefersDarkText(bg) ? 'var(--mj-color-neutral-900)' : 'var(--mj-color-neutral-0)');
  const bannerText = hex('BannerText');
  const t: Record<string, string> = bannerText ? bannerTextTokens(bannerText) : {};
  const bannerCardBg = hex('BannerCardBg');
  if (bannerCardBg) {
    t['--mj-login-banner-card-bg'] = bannerCardBg;
    t['--mj-login-banner-card-border'] = `color-mix(in srgb, ${bannerCardBg} 70%, ${bannerText ?? 'transparent'})`;
  }
  const bannerCardText = hex('BannerCardText') ?? (bannerCardBg ? readable(bannerCardBg) : null);
  if (bannerCardText) t['--mj-login-banner-card-text'] = bannerCardText;

  const panelBg = hex('PanelBg');
  if (panelBg) t['--mj-login-panel-bg'] = panelBg;
  const panelText = hex('PanelText') ?? (panelBg ? readable(panelBg) : null);
  if (panelText) {
    t['--mj-login-panel-text'] = panelText;
    t['--mj-login-panel-text-secondary'] = `color-mix(in srgb, ${panelText} 78%, transparent)`;
    t['--mj-login-panel-text-muted'] = `color-mix(in srgb, ${panelText} 60%, transparent)`;
  }

  const cardBg = hex('CardBg');
  if (cardBg) t['--mj-login-card-bg'] = cardBg;
  const cardText = hex('CardText') ?? (cardBg ? readable(cardBg) : null);
  if (cardText) {
    t['--mj-login-card-text'] = cardText;
    t['--mj-login-card-text-secondary'] = `color-mix(in srgb, ${cardText} 78%, transparent)`;
  }
  const cardBorder = hex('CardBorder');
  if (cardBorder) t['--mj-login-card-border'] = cardBorder;
  return t;
}

/** A theme's logo variants, keeping only URLs safe to draw on a page with no session. */
export function PublicLoginLogos(logos: unknown): ThemeLogos {
  const l = obj(logos);
  const out: ThemeLogos = {};
  for (const k of ['lightMarkURL', 'darkMarkURL', 'wordmarkURL', 'monochromeURL'] as const) {
    if (IsSafeLoginImageURL(l[k])) out[k] = l[k];
  }
  return out;
}

/**
 * A theme's brand for the login screen (or Login Studio's preview frame) without the app-wide theme
 * overlay: the derived color ramps, plus the semantic tokens the login screen reads, restated because
 * :root already resolved them against the page's own ramps. The stock mapping differs by color mode.
 */
export function LoginThemeTokens(seeds: ThemeSeeds | null, dark: boolean): Record<string, string> {
  if (!seeds) return {};
  let primitives: Record<string, string>;
  try {
    primitives = Derive(seeds).primitives;
  } catch {
    return {};
  }
  return {
    ...primitives,
    '--mj-brand-primary': dark ? 'var(--mj-color-brand-400)' : 'var(--mj-color-brand-500)',
    '--mj-brand-primary-hover': dark ? 'var(--mj-color-brand-300)' : 'var(--mj-color-brand-600)',
    '--mj-brand-primary-active': dark ? 'var(--mj-color-brand-200)' : 'var(--mj-color-brand-700)',
    '--mj-login-grad-start': dark ? 'var(--mj-color-neutral-950)' : 'var(--mj-color-brand-900)',
    '--mj-login-grad-mid': dark ? 'var(--mj-color-brand-900)' : 'var(--mj-color-brand-700)',
    '--mj-login-banner-bg': 'linear-gradient(160deg, var(--mj-login-grad-start) 0%, '
      + 'color-mix(in srgb, var(--mj-login-grad-start) 65%, var(--mj-login-grad-mid)) 60%, var(--mj-login-grad-mid) 140%)',
  };
}

/** The artwork a logo block shows: its chosen variant, else the light mark, else the wordmark. */
export function LoginLogoURL(source: LoginLogoSource, logos: ThemeLogos): string | null {
  const bySource: Record<LoginLogoSource, string | undefined> = {
    light: logos.lightMarkURL, dark: logos.darkMarkURL, wordmark: logos.wordmarkURL, monochrome: logos.monochromeURL,
  };
  const url = bySource[source] || logos.lightMarkURL || logos.wordmarkURL;
  return IsSafeLoginImageURL(url) ? url : null;
}

// ── Color helpers for the editor ────────────────────────────────────────────────────────────

export const LOGIN_COLOR_LABEL: Record<LoginColorKey, string> = {
  BannerText: 'Story panel text',
  BannerCardBg: 'Story panel card background',
  BannerCardText: 'Story panel card text',
  PanelBg: 'Sign-in column background',
  PanelText: 'Sign-in column text',
  CardBg: 'Sign-in card background',
  CardText: 'Sign-in card text',
  CardBorder: 'Sign-in card border',
};

const DARK_TEXT = '#1f2937';
/** Whether dark text reads better than white on this background. The one rule for "readable text". */
function prefersDarkText(bg: string): boolean {
  return ContrastRatio(DARK_TEXT, bg) >= ContrastRatio('#ffffff', bg);
}

/** Where a new custom color starts: a neutral to adjust, never black by accident. */
const STARTING_COLOR: Record<LoginColorKey, string> = {
  BannerText: '#ffffff', BannerCardBg: '#ffffff', BannerCardText: DARK_TEXT,
  PanelBg: '#ffffff', PanelText: DARK_TEXT, CardBg: '#f8fafc', CardText: DARK_TEXT, CardBorder: '#d1d5db',
};
/** The background each text color sits on, so text starts readable. */
const TEXT_ON: Partial<Record<LoginColorKey, LoginColorKey>> = { BannerCardText: 'BannerCardBg', PanelText: 'PanelBg', CardText: 'CardBg' };

/** The value a color starts at when switched on: text starts readable on its background. */
export function StartingLoginColor(d: LoginDesign, key: LoginColorKey): string {
  const bgKey = TEXT_ON[key];
  const bg = bgKey ? d.Colors[bgKey] : undefined;
  if (IsLoginHexColor(bg)) return prefersDarkText(bg) ? DARK_TEXT : '#ffffff';
  if (key === 'BannerText' && d.Tone === 'dark') return DARK_TEXT;
  return STARTING_COLOR[key];
}

/**
 * Text/background pairs below WCAG AA (4.5:1): warnings, never a refusal. Only pairs whose colors are
 * both set are judged; `only` limits it to pairs involving those colors.
 */
export function LoginContrastWarnings(d: LoginDesign, only?: readonly LoginColorKey[]): string[] {
  const c = d.Colors;
  const out: string[] = [];
  const check = (text: string | undefined, bg: string | null | undefined, where: string, keys: LoginColorKey[]): void => {
    if (only && !keys.some((k) => only.includes(k))) return;
    if (!IsLoginHexColor(text) || !IsLoginHexColor(bg)) return;
    const r = ContrastRatio(text, bg);
    if (r < 4.5) out.push(`${where}: contrast ${r.toFixed(1)}:1 is below 4.5:1, so some people will not be able to read it.`);
  };
  const bg = d.Background;
  if (bg.Kind === 'color') check(c.BannerText, bg.Color, 'Story panel text', ['BannerText']);
  if (bg.Kind === 'gradient') {
    check(c.BannerText, bg.Color, 'Story panel text (gradient start)', ['BannerText']);
    check(c.BannerText, bg.Color2, 'Story panel text (gradient end)', ['BannerText']);
  }
  check(c.BannerCardText, c.BannerCardBg, 'Story panel cards', ['BannerCardText', 'BannerCardBg']);
  check(c.PanelText, c.PanelBg, 'Sign-in column', ['PanelText', 'PanelBg']);
  check(c.CardText, c.CardBg, 'Sign-in cards', ['CardText', 'CardBg']);
  return out;
}
