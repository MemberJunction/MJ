import { ValidationErrorInfo, ValidationErrorType } from '@memberjunction/global';

/**
 * Per-section state a form's chrome can surface — the left-nav rail, an accordion
 * header, the collapsed rail spine — so a user editing a multi-section record can see
 * WHICH section holds unsaved edits or invalid input without opening each one.
 *
 * Counts are of **fields**, not messages: a section with one required field left blank
 * and one field failing two rules reports `ErrorCount: 2`.
 */
export interface FormSectionIndicators {
  /** Fields modified since the last save. Mirrors the amber dot on an edited field. */
  DirtyCount: number;
  /**
   * Fields that cannot be saved as they stand — a failing validation rule, or a
   * required field that is empty. Mirrors the red underline on the field itself.
   */
  ErrorCount: number;
  /** Fields carrying a warning-level validation result and no failure. */
  WarningCount: number;
}

export const EMPTY_SECTION_INDICATORS: Readonly<FormSectionIndicators> = Object.freeze({
  DirtyCount: 0,
  ErrorCount: 0,
  WarningCount: 0,
});

/** Add any number of indicator sets. Missing / non-finite counts read as 0. */
export function SumSectionIndicators(
  ...sets: ReadonlyArray<Partial<FormSectionIndicators> | null | undefined>
): FormSectionIndicators {
  let DirtyCount = 0;
  let ErrorCount = 0;
  let WarningCount = 0;
  for (const set of sets) {
    if (!set) continue;
    DirtyCount += CountOrZero(set.DirtyCount);
    ErrorCount += CountOrZero(set.ErrorCount);
    WarningCount += CountOrZero(set.WarningCount);
  }
  return { DirtyCount, ErrorCount, WarningCount };
}

/** True when nothing in the set would render. */
export function SectionIndicatorsAreEmpty(set: Partial<FormSectionIndicators> | null | undefined): boolean {
  if (!set) return true;
  return CountOrZero(set.DirtyCount) === 0 && CountOrZero(set.ErrorCount) === 0 && CountOrZero(set.WarningCount) === 0;
}

function CountOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * A `ValidationErrorInfo.Source` broken into the parts a section needs in order to
 * decide whether the failure belongs to it.
 *
 * MJ's own `BaseEntity.Validate()` emits a bare field name (`"Code"`). Callers that
 * validate a whole object graph emit a path instead — `"Modifications[2].ProvisionID"`
 * — and those failures belong to the section that hosts the collection, not to a
 * section that happens to render a field of the same trailing name.
 */
export interface ParsedValidationSource {
  /** The original, trimmed `Source` string. */
  Source: string;
  /**
   * Leading collection segment of a graph path (`Modifications[2].ProvisionID` →
   * `Modifications`). `undefined` for a plain field-name source.
   */
  Collection?: string;
  /** Positional index within {@link Collection} when the path carried one. */
  Index?: number;
  /**
   * Trailing field name — the last dotted segment with any `[i]` subscript removed.
   * Equals {@link Source} for a plain field-name source.
   */
  Field: string;
}

/** `Foo[3]` → `{ name: 'Foo', index: 3 }`; `Foo` → `{ name: 'Foo' }`. */
function SplitSubscript(segment: string): { name: string; index?: number } {
  const match = segment.match(/^(.*?)\[(\d+)\]$/);
  if (!match) return { name: segment };
  return { name: match[1], index: Number(match[2]) };
}

/**
 * Parse a `ValidationErrorInfo.Source` into {@link ParsedValidationSource}.
 *
 * A source with no dot and no subscript is a plain field name and parses to
 * `{ Field: source }` with no `Collection` — which is what keeps ordinary
 * single-record validation routing on the field name.
 */
export function ParseValidationSource(source: string | null | undefined): ParsedValidationSource {
  const raw = (source ?? '').trim();
  if (!raw) return { Source: '', Field: '' };

  const segments = raw.split('.');
  const first = SplitSubscript(segments[0]);
  const last = SplitSubscript(segments[segments.length - 1]);

  if (segments.length === 1 && first.index === undefined) {
    return { Source: raw, Field: first.name };
  }

  return {
    Source: raw,
    Collection: first.name || undefined,
    Index: first.index,
    Field: last.name || first.name,
  };
}

/** What a form section owns, for the purpose of attributing a validation failure to it. */
export interface SectionValidationScope {
  /** Field names the section renders — normally its `mj-form-field` children. */
  FieldNames?: readonly string[];
  /**
   * Graph-path collection names the section owns (`"Modifications"`), so positional
   * child failures land on the section that hosts that collection.
   */
  CollectionNames?: readonly string[];
}

function Normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Whether `parsed` belongs to a section with the given key + scope.
 *
 * Precedence, and it is deliberate:
 *  1. **plain field source** matches a declared field name;
 *  2. **graph source** whose leading collection matches a declared `CollectionNames` entry;
 *  3. **graph source** whose leading collection matches the section key itself (the
 *     zero-configuration case — a panel keyed `modifications` hosting `Modifications[i]`).
 *
 * A graph source is deliberately NOT matched on its trailing field name. Doing so is
 * what sends every child failure to whichever section renders a parent field of the
 * same name — usually the header section, the one place the user cannot fix it.
 */
export function SectionOwnsValidationSource(
  parsed: ParsedValidationSource,
  sectionKey: string,
  scope: SectionValidationScope,
): boolean {
  if (!parsed.Source) return false;

  if (parsed.Collection === undefined) {
    const field = Normalize(parsed.Field);
    return (scope.FieldNames ?? []).some((name) => Normalize(name) === field);
  }

  const collection = Normalize(parsed.Collection);
  if ((scope.CollectionNames ?? []).some((name) => Normalize(name) === collection)) return true;
  return Normalize(sectionKey) === collection;
}

/**
 * The graph-path errors (`Lines[2].Amount`) a section owns. Plain field-name errors are
 * excluded on purpose: those already surface through the field that renders them, and a
 * section counts that field once, through the field, rather than once per message.
 */
export function ClaimedCollectionErrors(
  errors: readonly ValidationErrorInfo[] | null | undefined,
  sectionKey: string,
  scope: SectionValidationScope,
): ValidationErrorInfo[] {
  if (!errors?.length) return [];
  return errors.filter((error) => {
    const parsed = ParseValidationSource(error.Source);
    return parsed.Collection !== undefined && SectionOwnsValidationSource(parsed, sectionKey, scope);
  });
}

/** Tally failures vs warnings over an already-selected set of errors. */
export function TallyValidationErrors(errors: readonly ValidationErrorInfo[]): Pick<FormSectionIndicators, 'ErrorCount' | 'WarningCount'> {
  let ErrorCount = 0;
  let WarningCount = 0;
  for (const error of errors) {
    if (error.Type === ValidationErrorType.Warning) WarningCount++;
    else ErrorCount++;
  }
  return { ErrorCount, WarningCount };
}

/** Tooltip / screen-reader text for an error badge. */
export function DescribeSectionErrors(count: number, where = 'this section'): string {
  if (count <= 0) return '';
  return count === 1 ? `1 field in ${where} needs attention` : `${count} fields in ${where} need attention`;
}

/** Tooltip / screen-reader text for a warning badge. */
export function DescribeSectionWarnings(count: number, where = 'this section'): string {
  if (count <= 0) return '';
  return count === 1 ? `1 field in ${where} has a warning` : `${count} fields in ${where} have warnings`;
}

/** Tooltip / screen-reader text for the unsaved-changes dot. */
export function DescribeSectionDirty(count: number, where = 'this section'): string {
  if (count <= 0) return '';
  return count === 1 ? `1 unsaved change in ${where}` : `${count} unsaved changes in ${where}`;
}
