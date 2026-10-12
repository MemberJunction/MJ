import type { PanelConfig } from '@memberjunction/ng-dashboard-viewer';

/** The part types a Config dashboard ships with. */
export type DashboardPartTypeName = 'View' | 'Query' | 'Artifact' | 'WebURL';

/** Every {@link DashboardPartTypeName}, in the order tool descriptions list them. */
export const DASHBOARD_PART_TYPE_NAMES: readonly DashboardPartTypeName[] = ['View', 'Query', 'Artifact', 'WebURL'];

/** The rule for one config key's value. */
interface ValueRule {
  /** Checks a value that is set. Returns what is wrong with it, or null. */
  check: (value: unknown) => string | null;
  /** The accepted values or format, for tool descriptions. */
  hint?: string;
  /** True when a text value comes back trimmed, as the config panels trim ids, names and URLs. */
  trim?: boolean;
}

/** The keys one part type's config may hold. */
interface PartConfigRule {
  /** At least one of these keys must be set. */
  requireOneOf: readonly string[];
  /** Every allowed key with the rule for its value, in the order the config panel writes them. */
  keys: Readonly<Record<string, ValueRule>>;
}

const TEXT: ValueRule = { check: (value) => (typeof value === 'string' ? null : 'must be a string') };
const ID_OR_NAME: ValueRule = {
  check: (value) => (typeof value === 'string' && value.trim() !== '' ? null : 'must be a non-blank string'),
  trim: true,
};
const FLAG: ValueRule = { check: (value) => (typeof value === 'boolean' ? null : 'must be true or false') };
const WHOLE_NUMBER: ValueRule = {
  check: (value) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? null : 'must be a whole number above 0'),
};
const HTTP_URL: ValueRule = {
  check: (value) => (typeof value === 'string' && isHttpUrl(value) ? null : 'must be a full http:// or https:// URL'),
  hint: 'http:// or https://',
  trim: true,
};

/** A value that must be one of `choices`. */
function oneOf(...choices: readonly (string | number)[]): ValueRule {
  return {
    check: (value) => ((typeof value === 'string' || typeof value === 'number') && choices.includes(value) ? null : `must be one of ${choices.join(', ')}`),
    hint: choices.join('|'),
  };
}

/**
 * The keys each part type's config panel writes (`buildConfig` in the dashboard-viewer config panels).
 * Fixed choices are the panel's field types, and the auto refresh intervals its select offers.
 */
const RULES: Readonly<Record<DashboardPartTypeName, PartConfigRule>> = {
  View: {
    requireOneOf: ['viewId', 'entityName'],
    keys: {
      viewId: ID_OR_NAME,
      entityName: ID_OR_NAME,
      extraFilter: TEXT,
      displayMode: oneOf('grid', 'cards', 'timeline', 'map'),
      mapRenderMode: oneOf('point', 'choropleth', 'heatmap'),
      allowModeSwitch: FLAG,
      enableSelection: FLAG,
      selectionMode: oneOf('none', 'single', 'multiple'),
    },
  },
  Query: {
    requireOneOf: ['queryId', 'queryName'],
    keys: {
      queryId: ID_OR_NAME,
      queryName: ID_OR_NAME,
      showParameterControls: FLAG,
      parameterLayout: oneOf('header', 'sidebar', 'dialog'),
      autoRefreshSeconds: oneOf(0, 30, 60, 300, 600),
      showExecutionMetadata: FLAG,
    },
  },
  Artifact: {
    requireOneOf: ['artifactId'],
    keys: { artifactId: ID_OR_NAME, versionNumber: WHOLE_NUMBER, showHeader: FLAG, showTabs: FLAG, showVersionSelector: FLAG, showMetadata: FLAG },
  },
  WebURL: {
    requireOneOf: ['url'],
    keys: { url: HTTP_URL, sandboxMode: oneOf('standard', 'strict', 'permissive'), allowFullscreen: FLAG, refreshOnResize: FLAG },
  },
};

/** The outcome of {@link ValidatePartConfig}: the checked config with `type` set, or a message for the agent. */
export type PartConfigValidation =
  | { ok: true; config: PanelConfig } // case-violation-ok-legacy-back-compat: matches the { ok, … } discriminated-union shape the spec fixes for validators
  | { ok: false; error: string }; // case-violation-ok-legacy-back-compat: matches the { ok, … } discriminated-union shape the spec fixes for validators

/**
 * Checks a config for a part type: an object, at least one of the required keys, no unknown keys, and values
 * of the type and choices the config panel writes. Unset values (undefined or null) are not checked.
 * A `type` key in the input is replaced by `partType`, and ids, names and URLs come back trimmed, as the
 * config panels write them. The input is not changed.
 */
export function ValidatePartConfig(partType: DashboardPartTypeName, raw: unknown): PartConfigValidation {
  if (!DASHBOARD_PART_TYPE_NAMES.includes(partType)) {
    return { ok: false, error: `Unknown part type "${partType}". Use one of ${DASHBOARD_PART_TYPE_NAMES.join(', ')}.` };
  }
  if (!isRecord(raw)) return { ok: false, error: `${partType} config must be an object.` };
  const rule = RULES[partType];
  const config: Record<string, unknown> = { ...raw };
  delete config['type'];
  const error = findUnknownKeys(partType, rule, config) ?? findMissingKey(partType, rule, config) ?? findBadValue(partType, rule, config);
  return error ? { ok: false, error } : { ok: true, config: { type: partType, ...trimText(rule, config) } };
}

/** The current config with the patch's keys laid over it. `type` stays the current part type. Neither input changes. */
export function MergePartConfig(current: PanelConfig, patch: Record<string, unknown>): PanelConfig {
  return { ...current, ...patch, type: current.type };
}

/**
 * One sentence per part type naming its required and optional keys, with the accepted values or format
 * where they are fixed, for tool descriptions. The text has no closing period, so a caller can embed it.
 */
export function DescribePartConfigs(): string {
  return DASHBOARD_PART_TYPE_NAMES.map((name) => describeRule(name, RULES[name])).join('. ');
}

/** True for an object that is not null and not an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** False for undefined, null and blank text, the values a config panel treats as an empty field. */
function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');
}

/** True for text that parses as an http or https URL, as the WebURL config panel checks it. */
function isHttpUrl(text: string): boolean {
  try {
    const protocol = new URL(text).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** An error that names the keys the rule does not allow and lists the allowed ones, or null. */
function findUnknownKeys(partType: DashboardPartTypeName, rule: PartConfigRule, config: Record<string, unknown>): string | null {
  const allowed = Object.keys(rule.keys);
  const unknownKeys = Object.keys(config).filter((key) => !allowed.includes(key));
  return unknownKeys.length ? `${partType} config has unknown keys: ${unknownKeys.join(', ')}. Allowed keys: ${allowed.join(', ')}.` : null;
}

/** An error when none of the required keys is set, or null. */
function findMissingKey(partType: DashboardPartTypeName, rule: PartConfigRule, config: Record<string, unknown>): string | null {
  return rule.requireOneOf.some((key) => isSet(config[key])) ? null : `${partType} config needs ${rule.requireOneOf.join(' or ')}.`;
}

/** An error for the first set value that its key's rule rejects, or null. */
function findBadValue(partType: DashboardPartTypeName, rule: PartConfigRule, config: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined || value === null) continue;
    const problem = rule.keys[key]?.check(value);
    if (problem) return `${partType} config: ${key} ${problem}.`;
  }
  return null;
}

/** A copy of a checked config with the text values of trimmed keys (ids, names and URLs) trimmed. */
function trimText(rule: PartConfigRule, config: Record<string, unknown>): Record<string, unknown> {
  const trimmed: Record<string, unknown> = { ...config };
  for (const [key, value] of Object.entries(config)) {
    if (rule.keys[key]?.trim && typeof value === 'string') trimmed[key] = value.trim();
  }
  return trimmed;
}

/** "<name>: needs <required keys>; optional <other keys>", with each key's hint in parentheses. */
function describeRule(name: DashboardPartTypeName, rule: PartConfigRule): string {
  const required = rule.requireOneOf.map((key) => describeKey(rule, key)).join(' or ');
  const optional = Object.keys(rule.keys).filter((key) => !rule.requireOneOf.includes(key));
  return `${name}: needs ${required}; optional ${optional.map((key) => describeKey(rule, key)).join(', ')}`;
}

/** The key name, followed by its hint in parentheses when it has one. */
function describeKey(rule: PartConfigRule, key: string): string {
  const hint = rule.keys[key]?.hint;
  return hint ? `${key} (${hint})` : key;
}
