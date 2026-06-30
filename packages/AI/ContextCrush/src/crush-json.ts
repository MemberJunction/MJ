/**
 * Structural JSON compression — independent TypeScript re-implementation of the
 * "SmartCrusher" concept from Headroom (https://github.com/chopratejas/headroom,
 * Apache-2.0). Written from the published algorithm description; not a copy of
 * Headroom source. See plans/agent-token-optimization.md §0 for attribution.
 *
 * Goals: deterministic (byte-stable), no AI call, semantically reversible via the
 * emitted legend. The byte-stability is load-bearing for PartitionStablePrefix —
 * re-crushing the same payload across turns must not perturb a cached prompt prefix.
 */

/** Any JSON-serializable value. Strongly typed in place of `any`/`unknown`. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Options controlling how {@link CrushJSON} compresses a payload. */
export interface CrushOptions {
  /**
   * Hard ceiling on the crushed text length. When exceeded, trailing rows of the
   * top-level table are dropped and recorded as `legend.truncatedRows` rather than
   * silently lost. Omit for no limit.
   */
  MaxChars?: number;
  /**
   * Drop `null` / `undefined` / `''` fields, recording dropped field names in the
   * legend. A table column empty across every row is dropped entirely. Default: true.
   */
  ElideEmpty?: boolean;
  /** Minimum string length eligible for interning. Default: 16. Set 0 to disable. */
  InternMinLength?: number;
  /** Minimum repeat count before a string is interned. Default: 3. */
  InternMinCount?: number;
  /** Minimum element count before an array-of-objects is tabularized. Default: 2. */
  TabularMinRows?: number;
  /**
   * Maximum structural depth to transform. Subtrees deeper than this are emitted verbatim
   * (and noted in the legend) instead of recursing — this guards against stack overflow on
   * deeply nested or accidentally cyclic-shaped data. Default: 64.
   */
  MaxDepth?: number;
}

/** The legend needed to interpret — and reverse the meaning of — a crushed payload. */
export interface CrushLegend {
  /** Interned-string dictionary: ref token → original value. */
  Intern?: Record<string, string>;
  /** Field names dropped because every value was empty. */
  Elided?: string[];
  /** Count of trailing table rows removed by the budget guard. */
  TruncatedRows?: number;
  /** Human/AI-readable notes describing the transforms applied. */
  Notes: string[];
}

/** Result of {@link CrushJSON}: the compact text plus the legend and size accounting. */
export interface CrushResult {
  /** The crushed, minified, deterministic text representation. */
  Text: string;
  /** Character count of the verbatim `JSON.stringify` of the input. */
  OriginalChars: number;
  /** Character count of {@link CrushResult.Text}. */
  CrushedChars: number;
  /** Legend required to interpret {@link CrushResult.Text}. */
  Legend: CrushLegend;
}

const DEFAULT_INTERN_MIN_LENGTH = 16;
const DEFAULT_INTERN_MIN_COUNT = 3;
const DEFAULT_TABULAR_MIN_ROWS = 2;
const DEFAULT_MAX_DEPTH = 64;
const TABLE_KEY = '$t';
const TABLE_COLS_KEY = 'c';
const TABLE_ROWS_KEY = 'r';
const INTERN_PREFIX = '§';

/** Internal, fully-resolved options (no optionals) used while crushing. */
interface ResolvedOptions {
  MaxChars: number | undefined;
  ElideEmpty: boolean;
  InternMinLength: number;
  InternMinCount: number;
  TabularMinRows: number;
  MaxDepth: number;
}

/** Mutable accumulator threaded through the recursive transform. */
interface CrushContext {
  options: ResolvedOptions;
  internByValue: Map<string, string>;
  elided: Set<string>;
  /** True once at least one array-of-objects was actually collapsed into a table. */
  producedTable: boolean;
  /** True if any non-finite number (NaN/Infinity) was normalized to null. */
  sawNonFinite: boolean;
  /** True if a subtree was left verbatim because it exceeded MaxDepth. */
  hitDepthLimit: boolean;
}

function resolveOptions(opts?: CrushOptions): ResolvedOptions {
  return {
    MaxChars: opts?.MaxChars,
    ElideEmpty: opts?.ElideEmpty !== false,
    InternMinLength: opts?.InternMinLength ?? DEFAULT_INTERN_MIN_LENGTH,
    InternMinCount: opts?.InternMinCount ?? DEFAULT_INTERN_MIN_COUNT,
    TabularMinRows: opts?.TabularMinRows ?? DEFAULT_TABULAR_MIN_ROWS,
    MaxDepth: opts?.MaxDepth ?? DEFAULT_MAX_DEPTH,
  };
}

function isPlainObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyValue(value: JsonValue): boolean {
  return value === null || value === '';
}

/** Recursively tally string-value frequencies so interning candidates can be chosen (depth-guarded). */
function collectStringCounts(node: JsonValue, counts: Map<string, number>, depth: number = 0): void {
  if (depth >= DEFAULT_MAX_DEPTH) {
    return;
  }
  if (typeof node === 'string') {
    counts.set(node, (counts.get(node) ?? 0) + 1);
  } else if (Array.isArray(node)) {
    for (const element of node) {
      collectStringCounts(element, counts, depth + 1);
    }
  } else if (isPlainObject(node)) {
    for (const key of Object.keys(node)) {
      collectStringCounts(node[key], counts, depth + 1);
    }
  }
}

/**
 * Choose which repeated long strings to intern and assign stable tokens. Tokens are
 * numbered by sorted value so the same input always yields the same dictionary. If any
 * existing datum already starts with the intern prefix, interning is disabled to keep
 * reconstruction unambiguous (never trade determinism for a marginal saving).
 */
function planInterning(node: JsonValue, options: ResolvedOptions): Map<string, string> {
  const byValue = new Map<string, string>();
  if (options.InternMinLength <= 0) {
    return byValue;
  }

  const counts = new Map<string, number>();
  collectStringCounts(node, counts);

  for (const existing of counts.keys()) {
    if (existing.startsWith(INTERN_PREFIX)) {
      return byValue; // collision risk — skip interning entirely
    }
  }

  const candidates = [...counts.entries()]
    .filter(([value, count]) => value.length >= options.InternMinLength && count >= options.InternMinCount)
    .map(([value]) => value)
    .sort();

  candidates.forEach((value, index) => byValue.set(value, `${INTERN_PREFIX}${index}`));
  return byValue;
}

/** Determine the deterministic, sorted union of keys across an array of row-objects. */
function unionColumns(rows: Array<{ [key: string]: JsonValue }>): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }
  return [...columns].sort();
}

/** Drop columns that are empty across every row (when eliding); record them in the legend. */
function retainNonEmptyColumns(
  columns: string[],
  rows: Array<{ [key: string]: JsonValue }>,
  ctx: CrushContext,
): string[] {
  if (!ctx.options.ElideEmpty) {
    return columns;
  }
  return columns.filter((column) => {
    const allEmpty = rows.every((row) => isEmptyValue(row[column] ?? null));
    if (allEmpty) {
      ctx.elided.add(column);
      return false;
    }
    return true;
  });
}

/** Collapse an array of objects into a compact `{$t:{c:[...],r:[[...]]}}` table. */
function tabularizeArray(rows: Array<{ [key: string]: JsonValue }>, ctx: CrushContext, depth: number): JsonValue {
  const columns = retainNonEmptyColumns(unionColumns(rows), rows, ctx);
  const tableRows: JsonValue[] = rows.map((row) =>
    columns.map((column) => transformValue(row[column] ?? null, ctx, depth + 1)),
  );
  ctx.producedTable = true;
  return { [TABLE_KEY]: { [TABLE_COLS_KEY]: columns, [TABLE_ROWS_KEY]: tableRows } };
}

function isArrayOfObjects(node: JsonValue[]): node is Array<{ [key: string]: JsonValue }> {
  return node.length > 0 && node.every((element) => isPlainObject(element));
}

/**
 * Recursively transform a node: intern strings, tabularize object-arrays, elide empties.
 * Depth-guarded — subtrees beyond MaxDepth are returned verbatim (and flagged) so pathological
 * nesting can never overflow the stack.
 */
function transformValue(node: JsonValue, ctx: CrushContext, depth: number): JsonValue {
  if (depth >= ctx.options.MaxDepth) {
    ctx.hitDepthLimit = true;
    return node;
  }
  if (typeof node === 'number') {
    if (!Number.isFinite(node)) {
      ctx.sawNonFinite = true;
      return null; // NaN/Infinity aren't valid JSON; normalize to null (flagged in the legend)
    }
    return node;
  }
  if (typeof node === 'string') {
    return ctx.internByValue.get(node) ?? node;
  }
  if (Array.isArray(node)) {
    if (isArrayOfObjects(node) && node.length >= ctx.options.TabularMinRows) {
      return tabularizeArray(node, ctx, depth);
    }
    return node.map((element) => transformValue(element, ctx, depth + 1));
  }
  if (isPlainObject(node)) {
    return transformObject(node, ctx, depth);
  }
  return node;
}

/** Transform a plain object, dropping empty fields when eliding. */
function transformObject(node: { [key: string]: JsonValue }, ctx: CrushContext, depth: number): JsonValue {
  const result: { [key: string]: JsonValue } = {};
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (ctx.options.ElideEmpty && isEmptyValue(value)) {
      ctx.elided.add(key);
      continue;
    }
    result[key] = transformValue(value, ctx, depth + 1);
  }
  return result;
}

/** Recursively reorder object keys alphabetically for byte-stable serialization (depth-guarded). */
function sortKeysDeep(node: JsonValue, depth: number = 0): JsonValue {
  if (depth >= DEFAULT_MAX_DEPTH) {
    return node; // matches transformValue's guard — deep subtrees were already left verbatim
  }
  if (Array.isArray(node)) {
    return node.map((element) => sortKeysDeep(element, depth + 1));
  }
  if (isPlainObject(node)) {
    const sorted: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(node).sort()) {
      sorted[key] = sortKeysDeep(node[key], depth + 1);
    }
    return sorted;
  }
  return node;
}

function stableStringify(node: JsonValue): string {
  return JSON.stringify(sortKeysDeep(node));
}

/**
 * Enforce the character budget by trimming trailing rows of the single top-level table.
 * Returns the possibly-trimmed node and the count of removed rows. Only the top-level
 * table is trimmed — the dominant action-result shape; nested tables are left intact.
 */
function applyBudget(node: JsonValue, options: ResolvedOptions): { node: JsonValue; truncatedRows: number } {
  if (options.MaxChars === undefined || stableStringify(node).length <= options.MaxChars) {
    return { node, truncatedRows: 0 };
  }
  if (!isPlainObject(node) || !isPlainObject(node[TABLE_KEY])) {
    return { node, truncatedRows: 0 };
  }
  const table = node[TABLE_KEY];
  const rows = table[TABLE_ROWS_KEY];
  if (!Array.isArray(rows)) {
    return { node, truncatedRows: 0 };
  }

  let kept = rows.length;
  while (kept > 0) {
    const candidate: JsonValue = {
      [TABLE_KEY]: { ...table, [TABLE_ROWS_KEY]: rows.slice(0, kept) },
    };
    if (stableStringify(candidate).length <= options.MaxChars) {
      return { node: candidate, truncatedRows: rows.length - kept };
    }
    kept--;
  }
  return { node: { [TABLE_KEY]: { ...table, [TABLE_ROWS_KEY]: [] } }, truncatedRows: rows.length };
}

function buildNotes(ctx: CrushContext, truncatedRows: number): string[] {
  const notes: string[] = [];
  if (ctx.producedTable) {
    notes.push(`'${TABLE_KEY}' marks a table: '${TABLE_ROWS_KEY}' rows map positionally to the '${TABLE_COLS_KEY}' columns.`);
  }
  if (ctx.internByValue.size > 0) {
    notes.push(`Tokens like '${INTERN_PREFIX}0' are interned strings — substitute via the Intern legend.`);
  }
  if (ctx.elided.size > 0) {
    notes.push('Elided fields had empty values across the payload and were omitted.');
  }
  if (ctx.sawNonFinite) {
    notes.push('Non-finite numbers (NaN/Infinity) were normalized to null.');
  }
  if (ctx.hitDepthLimit) {
    notes.push('Deeply nested subtrees beyond the depth limit were left uncompressed.');
  }
  if (truncatedRows > 0) {
    notes.push(`${truncatedRows} trailing row(s) were truncated to fit the budget.`);
  }
  return notes;
}

/**
 * Structurally compress a JSON-serializable value for cheaper inclusion in a model
 * prompt. Pure and deterministic: the same logical input always yields byte-identical
 * `Text`. The returned {@link CrushResult.Legend} carries everything needed to read the
 * output, so no information is dropped without a corresponding legend marker.
 */
export function CrushJSON(value: JsonValue, opts?: CrushOptions): CrushResult {
  const options = resolveOptions(opts);
  const originalChars = JSON.stringify(value).length;

  const ctx: CrushContext = {
    options,
    internByValue: planInterning(value, options),
    elided: new Set<string>(),
    producedTable: false,
    sawNonFinite: false,
    hitDepthLimit: false,
  };

  const transformed = transformValue(value, ctx, 0);
  const { node, truncatedRows } = applyBudget(transformed, options);
  const text = stableStringify(node);

  const legend: CrushLegend = { Notes: buildNotes(ctx, truncatedRows) };

  if (ctx.internByValue.size > 0) {
    const intern: Record<string, string> = {};
    for (const [originalValue, token] of ctx.internByValue) {
      intern[token] = originalValue;
    }
    legend.Intern = intern;
  }
  if (ctx.elided.size > 0) {
    legend.Elided = [...ctx.elided].sort();
  }
  if (truncatedRows > 0) {
    legend.TruncatedRows = truncatedRows;
  }

  return { Text: text, OriginalChars: originalChars, CrushedChars: text.length, Legend: legend };
}

/**
 * Render a compact, model-readable legend describing a {@link CrushResult} so the
 * recipient can interpret the crushed text. Returns an empty string when the payload
 * was emitted verbatim (no transforms, nothing to explain).
 */
export function DescribeCrush(result: CrushResult): string {
  const legend = result.Legend;
  const lines: string[] = [...legend.Notes];

  if (legend.Intern) {
    const entries = Object.keys(legend.Intern)
      .sort()
      .map((token) => `${token}=${JSON.stringify(legend.Intern![token])}`);
    lines.push(`Legend: ${entries.join(', ')}`);
  }
  if (legend.Elided && legend.Elided.length > 0) {
    lines.push(`Elided fields: ${legend.Elided.join(', ')}`);
  }

  if (lines.length === 0) {
    return '';
  }
  return `[context-crush] ${lines.join(' ')}`;
}
