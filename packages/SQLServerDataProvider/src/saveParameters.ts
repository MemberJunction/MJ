/**
 * Typed parameters for SQL Server saves and deletes.
 *
 * A save reaches SQL Server as one statement whose values travel as typed parameters, so its text
 * is the same for every record of an entity (for a given set of fields) and SQL Server reuses one
 * plan instead of compiling every save. The statement keeps the DECLARE / SET / EXEC shape the
 * literal batch has always had; only `SET @Name = <value>` becomes `SET @Name$ = @p$0`.
 *
 * Every parameter also carries the literal the batch used to contain for its value.
 * {@link RenderSaveSQL} puts those literals back and restores the per-record variable suffix, which
 * gives the text that is logged, captured into migrations, shown in errors and handed to
 * transaction groups: the statement that ran, with its values written in.
 */
import sql from 'mssql';
import { EntityFieldInfo, EntityFieldTSType } from '@memberjunction/core';

/** A value the driver binds for one parameter. */
export type SQLServerSaveValue = string | number | boolean | bigint | Date | Buffer | null;

/** One typed input of a save or delete statement. */
export class SQLServerSaveParameter {
  constructor(
    /** Name without the `@`, as the statement references it. */
    public readonly Name: string,
    /** Driver type, from the column's own SQL type. */
    public readonly Type: sql.ISqlType,
    public readonly Value: SQLServerSaveValue,
    /** The literal the batch wrote for this value; {@link RenderSaveSQL} puts it back. */
    public readonly Literal: string,
  ) {}
}

/**
 * Variable suffix in the statement that runs. Constant, so the text repeats across records. `$` is
 * valid inside a T-SQL variable name and never appears in a field's CodeName, so the renderer can
 * find every variable without matching anything else.
 */
export const EXECUTED_VARIABLE_SUFFIX = '$';

/** `@p$<n>` (a parameter) or `@<name>$` (a variable), each not followed by more identifier characters. */
const STATEMENT_TOKEN = /@p\$(\d+)(?![\w$#@])|(@\w+)\$(?![\w$#@])/g;

/**
 * The literal form of a statement built with {@link SaveParameterCollector}: each `@p$<n>` is
 * replaced by that parameter's literal and each variable gets `variableSuffix` back.
 */
export function RenderSaveSQL(executedSQL: string, parameters: readonly SQLServerSaveParameter[], variableSuffix: string): string {
  return executedSQL.replace(STATEMENT_TOKEN, (_match: string, index: string | undefined, variable: string | undefined) =>
    index !== undefined ? parameters[Number(index)].Literal : `${variable}${variableSuffix}`,
  );
}

/** True when `parameters` holds a save statement's typed parameters. */
export function IsSaveParameterList(parameters: unknown): parameters is SQLServerSaveParameter[] {
  return Array.isArray(parameters) && parameters.length > 0 && parameters.every((p) => p instanceof SQLServerSaveParameter);
}

/** Collects one statement's parameters and hands back the `@p$<n>` reference for each. */
export class SaveParameterCollector {
  private readonly parameters: SQLServerSaveParameter[];

  constructor(seed: readonly SQLServerSaveParameter[] = []) {
    this.parameters = [...seed];
  }

  public get Parameters(): readonly SQLServerSaveParameter[] {
    return this.parameters;
  }

  /**
   * Adds the parameter for a value of `field` whose literal is `literal` (what the literal batch
   * writes for it), and returns the reference to write into the statement in its place.
   */
  public AddField(field: EntityFieldInfo, literal: string): string {
    if (IsKeptAsInlineLiteral(field)) {
      return literal;
    }
    const { Type, Value } = SaveParameterFromLiteral(field, literal);
    const name = `p$${this.parameters.length}`;
    this.parameters.push(new SQLServerSaveParameter(name, Type, Value, literal));
    return `@${name}`;
  }
}

/**
 * The typed parameter equivalent to `literal`, a value of `field` as the literal batch writes it.
 * The value is read back from the literal, so it goes through exactly the conversions the literal
 * always did (booleans to 1/0, dates to ISO-8601, objects to JSON, base64 to bytes) and the bound
 * value and the logged literal cannot disagree.
 */
export function SaveParameterFromLiteral(field: EntityFieldInfo, literal: string): { Type: sql.ISqlType; Value: SQLServerSaveValue } {
  refuseInlineLiteralType(field);
  const name = field.Type.trim().toLowerCase();
  if (field.IsBinaryFieldType) {
    return { Type: SaveParameterType(field), Value: Buffer.from(literal.slice(2), 'hex') };
  }
  if (TEXT_DATE_TYPES.has(name)) {
    return { Type: SaveParameterType(field), Value: QuotedLiteralText(literal) };
  }
  if (EXACT_NUMERIC_TYPES.has(name)) {
    // An exponent makes the literal a float (`1e-07`), so that one is sent as a float.
    return /e/i.test(literal) ? { Type: sql.Float(), Value: Number(literal) } : { Type: SaveParameterType(field), Value: literal };
  }
  if (SENT_AS_LITERAL_TEXT.has(name)) {
    const value = literal.startsWith("'") || literal.startsWith("N'") ? QuotedLiteralText(literal) : literal;
    return { Type: SaveParameterType(field), Value: value };
  }
  switch (field.TSType) {
    case EntityFieldTSType.Boolean:
      return { Type: SaveParameterType(field), Value: literal === '1' };
    case EntityFieldTSType.Number:
      return { Type: SaveParameterType(field), Value: name === 'bigint' ? bigintFromLiteral(literal) : finiteNumberFromLiteral(field, literal) };
    case EntityFieldTSType.Date:
      return { Type: SaveParameterType(field), Value: new Date(QuotedLiteralText(literal)) };
    default:
      return { Type: SaveParameterType(field), Value: QuotedLiteralText(literal) };
  }
}

/**
 * A number literal as a number. `Number('')` and `Number(' ')` are 0, and `NaN` binds as NULL, so a
 * literal that is not a finite number would store a value nobody wrote; the literal batch failed on
 * it, and so does this.
 */
function finiteNumberFromLiteral(field: EntityFieldInfo, literal: string): number {
  const value = Number(literal);
  if (literal.trim() === '' || !Number.isFinite(value)) {
    throw new Error(`Field "${field.Name}" has value ${JSON.stringify(literal)}, which is not a number`);
  }
  return value;
}

/** A bigint literal as a BigInt; a fraction is truncated toward zero, as SQL Server converts it. */
function bigintFromLiteral(literal: string): bigint {
  return /^-?\d+$/.test(literal) ? BigInt(literal) : BigInt(Math.trunc(Number(literal)));
}

/** The text a `'…'` or `N'…'` literal stores: the quotes removed and each `''` read as one quote. */
export function QuotedLiteralText(literal: string): string {
  const open = literal.startsWith('N') ? 2 : 1;
  return literal.slice(open, -1).replace(/''/g, "'");
}

type DriverTypeFactory = (length?: number) => sql.ISqlType;

let driverTypesByNameCache: Map<string, DriverTypeFactory> | undefined;

/**
 * The driver's types keyed by lower-cased SQL Server type name (`nvarchar` → `NVarChar`, …). Built
 * on first use, not at import: loading this module must not depend on the driver's type table.
 */
function driverTypesByName(): Map<string, DriverTypeFactory> {
  driverTypesByNameCache ??= new Map<string, DriverTypeFactory>(
    Object.entries(sql.TYPES).map(([name, factory]: [string, DriverTypeFactory]) => [name.toLowerCase(), factory]),
  );
  return driverTypesByNameCache;
}

/**
 * Exact numeric types. The driver encodes these through a JavaScript double (`parseFloat`, then
 * `value * 10^scale`), so `1.005` into `decimal(18,2)` would arrive as `1.00` where the literal
 * stores `1.01`. They are sent as the literal's own text instead, and the statement's typed
 * `SET @x DECIMAL(p,s) = @p$n` makes the same exact conversion the literal always got.
 */
const EXACT_NUMERIC_TYPES = new Set(['decimal', 'numeric', 'money', 'smallmoney']);

/**
 * Date types sent as their ISO-8601 literal text (`varchar(34)`) so the typed `SET @x = @p$n`
 * performs the conversion on SQL Server, exactly as the literal batch did. None is bound as a JS
 * `Date`, because tedious mishandles each:
 * - `datetimeoffset`: tedious encodes `sql.DateTimeOffset()` with `-date.getTimezoneOffset()`,
 *   which stamps the Node host's local offset instead of the `+00:00` written by `.toISOString()`.
 * - `smalldatetime`: tedious truncates seconds (`date.getUTCMinutes()`) instead of rounding >=30s
 *   to the next minute as SQL Server does, and throws a Node `RangeError` for pre-1900 dates.
 * - `date`, `time`, `datetime`, `datetime2`: tedious encodes them in UTC but range-checks them with
 *   the host's local `getFullYear()`, so on a server west of UTC `0001-01-01` fails as "Out of
 *   range", and east of UTC so do `9999-12-31` values — common "no end date" placeholders.
 */
const TEXT_DATE_TYPES = new Set(['date', 'time', 'datetime', 'datetime2', 'datetimeoffset', 'smalldatetime']);

/**
 * Types a save keeps as their inline literal instead of binding a parameter.
 * - `sql_variant`: the stored base type comes from whatever is assigned to it. MJ writes these values
 *   unquoted (`NeedsQuotes` is false), and the literal is what gives SQL Server the right base type
 *   (`0x1F` is varbinary, `1.10` is numeric(3,2), `3000000000` is numeric(10,0)). No parameter type
 *   reproduces that: `nvarchar(max)` is rejected (Msg 206), `float` loses precision past 15 digits,
 *   and `sql.Decimal` goes through a JS number. These saves don't share a plan, as before.
 */
const KEPT_AS_INLINE_LITERAL = new Set(['sql_variant']);

/** Whether a save writes `field`'s value as its inline literal rather than as a typed parameter. */
export function IsKeptAsInlineLiteral(field: EntityFieldInfo): boolean {
  return KEPT_AS_INLINE_LITERAL.has(field.Type.trim().toLowerCase());
}

/** A type kept as its inline literal has no parameter form; binding one would store the wrong base type. */
function refuseInlineLiteralType(field: EntityFieldInfo): void {
  if (IsKeptAsInlineLiteral(field)) {
    throw new Error(`Field "${field.Name}" has SQL type "${field.Type}", which a save writes as its inline literal, not as a parameter`);
  }
}

/**
 * Types the driver cannot send as a parameter (`xml` and the CLR types are "not implemented" in
 * tedious), or that it does not know. Their value is sent as `nvarchar(max)` text so Unicode is
 * preserved while the typed SET converts it as before.
 */
const SENT_AS_LITERAL_TEXT = new Set(['xml', 'hierarchyid', 'geography', 'geometry', 'json', 'vector']);

/** Server-generated types that a save never writes. */
const NEVER_WRITTEN = new Set(['timestamp', 'rowversion']);

/**
 * The driver type for a field's parameter: the SQL Server type of the same name, with the column's
 * length for the sized string and binary types.
 * @throws Error for a type that has no parameter form, so a new type fails loudly instead of binding
 *   wrongly.
 */
export function SaveParameterType(field: EntityFieldInfo): sql.ISqlType {
  refuseInlineLiteralType(field);
  const name = field.Type.trim().toLowerCase();
  const length = field.Length > 0 ? field.Length : sql.MAX;
  switch (name) {
    case 'varchar':
    case 'char':
      return driverTypesByName().get(name)(length);
    case 'nvarchar':
    case 'nchar':
      return driverTypesByName().get(name)(field.Length > 0 ? field.Length / 2 : sql.MAX);
    case 'binary':
    case 'varbinary':
      // The literal is a `0x…` varbinary; a binary(n) variable pads it the same way.
      return sql.VarBinary(length);
    case 'ntext':
      return sql.NVarChar(sql.MAX);
    case 'text':
      return sql.VarChar(sql.MAX);
    case 'image':
      return sql.VarBinary(sql.MAX);
    case 'sysname':
      return sql.NVarChar(128);
  }
  if (TEXT_DATE_TYPES.has(name)) {
    return sql.VarChar(34);
  }
  if (EXACT_NUMERIC_TYPES.has(name)) {
    return sql.VarChar(sql.MAX);
  }
  if (SENT_AS_LITERAL_TEXT.has(name)) {
    return sql.NVarChar(sql.MAX);
  }
  const factory = NEVER_WRITTEN.has(name) ? undefined : driverTypesByName().get(name);
  if (!factory) {
    throw new Error(`Field "${field.Name}" has SQL type "${field.Type}", which SQLServerDataProvider cannot send as a save parameter`);
  }
  return factory();
}
