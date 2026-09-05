/**
 * @module components/signal-binding
 *
 * Splitting a signal's MEANING from its BINDING.
 *
 * A materialised input stores both in one blob today:
 *
 * ```json
 * { "aggregate": "count", "source": "Activities", "foreignKey": "MemberID",
 *   "dateField": "ActivityDate", "window": { "Kind": "Rolling", "LengthDays": 90 } }
 * ```
 *
 * `aggregate` and `window` are what the signal *means* — "how often, in the 90 days before the
 * decision" — and they are true of any population with dated events. `source`, `foreignKey`,
 * `dateField` and `field` are only where it happened to be attached when it was born.
 *
 * Keeping them fused is what limits reuse to model-building: a measure proven on members cannot be
 * pointed at donors without editing the model that owns it. Separating them turns the stored
 * bindings into DEFAULTS that a caller may substitute, so the same proven measure computes over
 * registrants, volunteers or lapsed donors while the meaning stays fixed.
 *
 * Pure — no provider, no I/O — so the resolution rules are testable on their own. Validating an
 * override against real metadata is a separate, provider-dependent step (see `signal-compute`).
 */
import type { AsOfWindowSpec } from '@memberjunction/predictive-studio-core';
import type { DatedSourceSpec, DatedFeatureSpec } from '../feature-assembly';
import { asOfDriverKey } from './component-materializer';

/** Driver key of the plain-column input leaf. */
const COLUMN_DRIVER = 'select';
/** Every as-of aggregate leaf's driver is `asof_<kind>`. */
const AS_OF_PREFIX = 'asof_';

/**
 * What a caller may substitute when computing a signal against a different population.
 *
 * Every field is optional: an override supplies only what changes, and anything omitted falls back
 * to the binding the signal was born with. A caller pointing an activity count at donations needs
 * to name the source entity and its keys, and nothing else.
 */
export interface SignalBindingOverride {
  /** Entity holding the dated rows (as-of signals) or the column (plain-column signals). */
  SourceEntity?: string;
  /** Column on the dated rows referencing the target record's primary key. */
  ForeignKeyField?: string;
  /** Date column used to order and to apply the as-of cut. */
  DateField?: string;
  /** Value column for aggregates that need one (sum, avg, min, max, distinct count). */
  ValueField?: string;
  /** Column name for a plain-column signal. */
  Column?: string;
  /**
   * Replace the signal's time window. Omitted keeps the window it proved itself with, which is
   * usually what you want — the window is part of the meaning, not the binding.
   */
  Window?: AsOfWindowSpec;
}

/** A signal resolved to something the feature-assembly executor can run. */
export type ResolvedSignal =
  | { Kind: 'column'; OutputColumn: string; Column: string }
  | { Kind: 'as-of'; OutputColumn: string; DatedSource: DatedSourceSpec };

/** Why a signal could not be resolved. Every case names what is missing, not just that it failed. */
export interface SignalResolutionError {
  Error: string;
}

/** The stored spec of a materialised signal, as written by the component materialiser. */
export interface StoredSignalSpec {
  aggregate?: string;
  source?: string;
  foreignKey?: string;
  dateField?: string;
  field?: string;
  window?: AsOfWindowSpec;
}

/** Aggregates that are meaningless without a value column to aggregate over. */
const VALUE_AGGREGATES = new Set(['sum', 'avg', 'min', 'max', 'distinct_count']);

/** Read the stored spec off a component row's JSON, tolerating absence and malformation. */
export function parseSignalSpec(raw: string | null | undefined): StoredSignalSpec {
  if (!raw || raw.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as StoredSignalSpec;
  } catch {
    return {};
  }
}

/**
 * Resolve a signal against an optional binding override.
 *
 * @param driverClass the signal's `Input` leaf driver — `select`, or `asof_<kind>`
 * @param spec        the signal's stored spec (its default binding + its meaning)
 * @param outputColumn the column name the computed values should land in
 * @param override    what the caller wants to substitute; omitted fields keep the default
 */
export function resolveSignal(
  driverClass: string | null | undefined,
  spec: StoredSignalSpec,
  outputColumn: string,
  override?: SignalBindingOverride,
): ResolvedSignal | SignalResolutionError {
  const driver = (driverClass ?? '').trim();
  if (driver.length === 0) {
    return { Error: 'The signal has no DriverClass, so there is no way to know how to compute it.' };
  }

  if (driver === COLUMN_DRIVER) {
    const column = override?.Column ?? outputColumn;
    if (!column) {
      return { Error: 'A column signal needs a column name; none was stored and none was supplied.' };
    }
    return { Kind: 'column', OutputColumn: outputColumn, Column: column };
  }

  if (!driver.startsWith(AS_OF_PREFIX)) {
    // Embedding, LLM-derived, vision, action and forecast signals each carry their own execution
    // path and are not rebindable by substituting an entity and two column names. Refusing is the
    // honest answer — pretending would compute something and label it with this signal's meaning.
    return { Error: `Signals of kind '${driver}' cannot be rebound by entity and column; only stored columns and as-of aggregates can.` };
  }

  const aggregate = spec.aggregate;
  if (!aggregate) {
    return { Error: 'The signal is an as-of aggregate but its stored spec names no aggregate kind.' };
  }
  // Guard against a spec whose driver and aggregate disagree — that would compute one thing under
  // another's name, which is exactly the failure a reuse library must not have.
  if (asOfDriverKey(aggregate) !== driver) {
    return { Error: `The signal's driver '${driver}' does not match its stored aggregate '${aggregate}'.` };
  }

  const source = override?.SourceEntity ?? spec.source;
  const foreignKey = override?.ForeignKeyField ?? spec.foreignKey;
  const dateField = override?.DateField ?? spec.dateField;
  const missing = [
    !source && 'a source entity',
    !foreignKey && 'a foreign key field',
    !dateField && 'a date field',
  ].filter(Boolean);
  if (missing.length > 0) {
    return { Error: `Cannot compute this signal: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} neither stored on the signal nor supplied.` };
  }

  const valueField = override?.ValueField ?? spec.field;
  if (VALUE_AGGREGATES.has(aggregate) && !valueField) {
    return { Error: `A '${aggregate}' needs a value field to aggregate over; none was stored and none was supplied.` };
  }

  const feature: DatedFeatureSpec = {
    OutputColumn: outputColumn,
    Aggregate: aggregate as DatedFeatureSpec['Aggregate'],
    // The window travels with the MEANING: a "90-day activity count" rebound to donations is still
    // a 90-day count, and silently widening it would change what the signal claims to measure.
    Window: override?.Window ?? spec.window,
  };
  if (valueField) feature.Field = valueField;

  return {
    Kind: 'as-of',
    OutputColumn: outputColumn,
    DatedSource: {
      EntityName: source as string,
      ForeignKeyField: foreignKey as string,
      DateField: dateField as string,
      Features: [feature],
    },
  };
}

/**
 * The signal's own name, with the model that produced it stripped off.
 *
 * Materialised signals are named `<Model> \u203a <Measure>` so the tree reads sensibly, but a caller
 * asking for "days since last activity" does not want the model's name attached — and the computed
 * column is named for the measure, not for where it was born. One definition, because the catalogue
 * and the computer must agree on what a signal is called or a caller cannot find its own column.
 */
export function signalLeafName(qualifiedName: string): string {
  const sep = qualifiedName.lastIndexOf(NAME_SEPARATOR);
  return (sep >= 0 ? qualifiedName.slice(sep + NAME_SEPARATOR.length) : qualifiedName).trim();
}

/** Separator the materialiser puts between a model's name and its part's name. */
const NAME_SEPARATOR = ' \u203a ';

/** Narrow a {@link resolveSignal} result. */
export function isResolutionError(r: ResolvedSignal | SignalResolutionError): r is SignalResolutionError {
  return (r as SignalResolutionError).Error !== undefined;
}

/**
 * Whether a signal is rebindable at all — true for stored columns and as-of aggregates.
 *
 * Used to decide what a reuse search should offer as callable, so a caller is never handed
 * something it cannot point anywhere.
 */
export function isRebindable(driverClass: string | null | undefined): boolean {
  const driver = (driverClass ?? '').trim();
  return driver === COLUMN_DRIVER || driver.startsWith(AS_OF_PREFIX);
}
