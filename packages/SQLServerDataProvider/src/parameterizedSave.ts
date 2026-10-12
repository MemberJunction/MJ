/**
 * Parameterized save/delete statements for SQL Server.
 *
 * A save used to reach SQL Server as an ad-hoc batch with every field value pasted in as a
 * literal, so no two saves shared batch text and SQL Server compiled each one. The pieces here
 * let the provider send the same statement with the values as `nvarchar(max)` parameters, so the
 * text is constant per entity + operation (+ the set of fields in the call) and the plan is reused.
 *
 * Equivalence with the literal form is kept by construction: each parameter carries the exact
 * text the literal would have contained, and the statement assigns it to a variable of the same
 * type the literal path assigns to (or, for Record Changes, to a `VARCHAR(MAX)` / `NVARCHAR(MAX)`
 * local that mirrors the literal's own type). SQL Server therefore performs the same conversion
 * from the same text. Any value whose literal is NOT plain quoted text (a binary hex literal, a
 * number in exponent form, a fraction bound for an integer column) marks the save unsafe and the
 * provider falls back to the literal batch.
 */
import { EntityFieldInfo, EntityFieldTSType } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';

/** One `nvarchar(max)` input of a {@link SQLServerParameterizedStatement}. */
export interface SQLServerStatementParameter {
  /** Parameter name without the `@`. */
  Name: string;
  /** The text the equivalent literal would contain, or null for SQL NULL. */
  Value: string | null;
}

/**
 * A statement whose values travel as parameters, paired with the literal statement it replaces.
 *
 * Handed to `ExecuteSQL` as the single element of the `parameters` array alongside the LITERAL
 * SQL text. Everything that reads the query text (SQL logging sessions, error messages, the
 * TransactionGroup path) keeps seeing runnable literal SQL; only the mssql request is built from
 * {@link SQL} + {@link Parameters}, and only when the query it was handed is {@link LiteralSQL}.
 */
export class SQLServerParameterizedStatement {
  constructor(
    /** Statement text with `@mjpN` parameter references; constant for a given entity + operation + field set. */
    public readonly SQL: string,
    public readonly Parameters: ReadonlyArray<SQLServerStatementParameter>,
    /** The literal statement this replaces — what is logged and what runs if this is ever handed a different query. */
    public readonly LiteralSQL: string,
  ) {}

  /** Keeps error messages (which JSON-stringify the parameters) from repeating the literal SQL. */
  // case-violation-ok-legacy-back-compat: JSON.stringify protocol method, must be named toJSON
  public toJSON(): { SQL: string; Parameters: ReadonlyArray<SQLServerStatementParameter> } {
    return { SQL: this.SQL, Parameters: this.Parameters };
  }
}

/**
 * Returns the parameterized statement to run for `query`, or null to run `query` as-is.
 * Only a single-element parameter array holding a statement built for exactly this query text
 * qualifies; anything else keeps the existing parameter handling.
 */
export function ResolveParameterizedStatement(query: string, parameters: unknown): SQLServerParameterizedStatement | null {
  if (!Array.isArray(parameters) || parameters.length !== 1) return null;
  const candidate: unknown = parameters[0];
  if (!(candidate instanceof SQLServerParameterizedStatement)) return null;
  return candidate.LiteralSQL === query ? candidate : null;
}

/** True when `parameters` carries a parameterized statement (whether or not it matches the query). */
export function IsParameterizedStatementArray(parameters: unknown): boolean {
  return Array.isArray(parameters) && parameters.length === 1 && parameters[0] instanceof SQLServerParameterizedStatement;
}

const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;
const INTEGER_SQL_TYPES = new Set(['int', 'bigint', 'smallint', 'tinyint']);

/**
 * Collects the parameters of one statement and hands back `@mjpN` references in order.
 * Marks itself {@link Unsafe} when a value cannot be sent as text with the literal's semantics.
 */
export class SaveParameterCollector {
  private readonly params: SQLServerStatementParameter[];
  private unsafeReason: string | null = null;

  constructor(seed: ReadonlyArray<SQLServerStatementParameter> = []) {
    this.params = [...seed];
  }

  /** Why parameterizing was abandoned, or null when every value bound cleanly. */
  public get Unsafe(): string | null {
    return this.unsafeReason;
  }

  public get Parameters(): ReadonlyArray<SQLServerStatementParameter> {
    return this.params;
  }

  public get Count(): number {
    return this.params.length;
  }

  /** A copy that can be extended without changing this collector (one per wrapped statement). */
  public Clone(): SaveParameterCollector {
    const copy = new SaveParameterCollector(this.params);
    copy.unsafeReason = this.unsafeReason;
    return copy;
  }

  /** Binds raw text (or NULL) and returns its `@mjpN` reference. */
  public Add(value: string | null): string {
    const name = `mjp${this.params.length}`;
    this.params.push({ Name: name, Value: value });
    return `@${name}`;
  }

  /**
   * Binds a quoted-literal payload that the payload builder already escaped for embedding
   * (every `'` doubled), restoring the text the SQL parser would have produced from the literal.
   */
  public AddEscaped(escaped: string | null): string {
    return this.Add(escaped === null ? null : escaped.replace(/''/g, "'"));
  }

  /** Binds text the literal path runs through `EscapeSQLString`, with the same stripping applied. */
  public AddSQLStringEscaped(raw: string): string {
    return this.AddEscaped(EscapeSQLString(raw));
  }

  /**
   * Binds a field value and returns its reference — or marks the collector unsafe and returns
   * `NULL` (the statement is then discarded in favour of the literal one).
   */
  public AddField(field: EntityFieldInfo, value: unknown): string {
    const text = SaveParameterText(field, value);
    if (text === undefined) {
      this.unsafeReason = this.unsafeReason ?? `field ${field.Name} (${field.Type}) has a value with no plain-text literal form`;
      return 'NULL';
    }
    return this.Add(text);
  }

  /** Marks the statement unsafe for a reason found outside value binding (e.g. the parameter limit). */
  public MarkUnsafe(reason: string): void {
    this.unsafeReason = this.unsafeReason ?? reason;
  }
}

/**
 * The text the literal save path (`SQLServerDataProvider.generateSetStatementValue`) would place
 * inside its literal for this value: `null` for NULL, `undefined` when the literal is not a plain
 * quoted/numeric text that converts identically from `nvarchar` (the caller then falls back).
 */
export function SaveParameterText(field: EntityFieldInfo, value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (field.IsBinaryFieldType) return undefined; // hex literal, not text
  switch (field.TSType) {
    case EntityFieldTSType.Boolean:
      return booleanText(value);
    case EntityFieldTSType.String:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    case EntityFieldTSType.Date:
      return dateText(value);
    case EntityFieldTSType.Number:
      return numberText(field, value);
    default:
      // Other types are quoted only when the field needs quotes; an unquoted literal of unknown
      // type has no guaranteed-identical text form.
      return field.NeedsQuotes ? String(value) : undefined;
  }
}

function booleanText(value: unknown): string {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'true') return '1';
  if (typeof value === 'string' && value.trim().toLowerCase() === 'false') return '0';
  return value ? '1' : '0';
}

function dateText(value: unknown): string {
  const date = typeof value === 'number' || typeof value === 'string' ? new Date(value) : (value as Date);
  return date.toISOString();
}

/**
 * A numeric literal and an `nvarchar` holding the same digits convert identically to decimal,
 * numeric, money and float columns. They do NOT when the literal is in exponent form (a float
 * literal; `nvarchar` → decimal fails) or is a fraction bound for an integer column (the literal
 * truncates; `nvarchar` → int fails) — those stay on the literal path.
 */
function numberText(field: EntityFieldInfo, value: unknown): string | undefined {
  const text = String(value);
  if (!PLAIN_DECIMAL.test(text)) return undefined;
  if (text.includes('.') && INTEGER_SQL_TYPES.has(field.Type.trim().toLowerCase())) return undefined;
  return text;
}
