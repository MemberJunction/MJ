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
  const name = field.Type.trim().toLowerCase();
  if (field.IsBinaryFieldType) {
    return { Type: SaveParameterType(field), Value: Buffer.from(literal.slice(2), 'hex') };
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
      return { Type: SaveParameterType(field), Value: name === 'bigint' ? bigintFromLiteral(literal) : Number(literal) };
    case EntityFieldTSType.Date:
      return { Type: SaveParameterType(field), Value: new Date(QuotedLiteralText(literal)) };
    default:
      return { Type: SaveParameterType(field), Value: QuotedLiteralText(literal) };
  }
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
 * Types the driver cannot send as a parameter (`xml` and the CLR types are "not implemented" in
 * tedious; `sql_variant` is named `Variant` there), or that it does not know. Their value is sent
 * as `nvarchar(max)` text so Unicode is preserved while the typed SET converts it as before.
 */
const SENT_AS_LITERAL_TEXT = new Set(['xml', 'sql_variant', 'hierarchyid', 'geography', 'geometry', 'json', 'vector']);

/** Server-generated types that a save never writes. */
const NEVER_WRITTEN = new Set(['timestamp', 'rowversion']);

/**
 * The driver type for a field's parameter: the SQL Server type of the same name, with the column's
 * length for the sized string and binary types.
 * @throws Error for a type that has no parameter form, so a new type fails loudly instead of binding
 *   wrongly.
 */
export function SaveParameterType(field: EntityFieldInfo): sql.ISqlType {
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
    case 'sysname':
      return sql.NVarChar(128);
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

