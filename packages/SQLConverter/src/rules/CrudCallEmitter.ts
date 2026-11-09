/**
 * Emits the PL/pgSQL call for a T-SQL `EXEC` of an MJ CRUD procedure.
 *
 * On PostgreSQL a CRUD function has one of two shapes: typed named parameters, or a
 * single `p_data JSONB` argument for wide entities. BIT parameters, including CodeGen's
 * `<Col>_Clear` flags, are BOOLEAN. The call emitted here works against either shape
 * and passes `0`/`1` literals to boolean parameters as `FALSE`/`TRUE`.
 *
 * Used by ExecBlockRule (top-level EXECs) and ProcedureToFunctionRule (EXECs inside
 * a procedure body, such as CodeGen's cascade updates).
 */
import type { ConversionContext } from './types.js';

/** One named argument of a CRUD call. */
export interface CrudCallArg {
  /** PostgreSQL parameter name, `p_<Param>`. */
  ParamName: string;
  /** Value expression, already in PostgreSQL syntax. */
  ValueExpr: string;
}

/** Options for {@link CrudCallPerformLines}. */
export interface CrudCallOptions {
  /** Above this argument count no typed-arg function can exist, so only the JSON-arg call is emitted. */
  ParamLimit: number;
  /** Operator between a parameter name and its value in the typed-arg call. */
  NamedArgOperator: ':=' | '=>';
}

/**
 * Boolean columns of the table behind a CRUD procedure (`__mj."spUpdateX"` → table `X`),
 * from the column types the conversion context knows. Empty when the table is unknown.
 */
export function BoolColumnsForProc(
  procRef: string,
  tableColumns: Map<string, Map<string, string>>,
): Set<string> {
  const m = procRef.match(/"?sp(?:Create|Update|Delete)([A-Za-z0-9_]+)"?\s*$/i);
  if (!m) return new Set();
  const cols = tableColumns.get(m[1].toLowerCase());
  if (!cols) return new Set();
  const out = new Set<string>();
  for (const [name, type] of cols) {
    if (type.toUpperCase() === 'BOOLEAN') out.add(name);
  }
  return out;
}

/**
 * Returns `TRUE`/`FALSE` for a `1`/`0` literal passed to a boolean parameter: a `<Col>_Clear`
 * flag or a known boolean column. Any other value is returned unchanged.
 */
export function CoerceBooleanArg(paramName: string, valueExpr: string, boolCols: Set<string>): string {
  const v = valueExpr.trim();
  if (v !== '0' && v !== '1') return valueExpr;
  const colName = paramName.replace(/^p_/, '');
  const isClearFlag = /_Clear$/i.test(colName);
  const isBoolColumn = boolCols.has(colName.toLowerCase());
  if (!isClearFlag && !isBoolColumn) return valueExpr;
  return v === '1' ? 'TRUE' : 'FALSE';
}

/**
 * Builds the `p_data` argument for a JSON-arg CRUD call: `jsonb_build_object('Col', value, ...)`
 * keyed by parameter name without the `p_` prefix. `_Clear` flags are omitted, because a present
 * key with a JSON null already clears the column. PostgreSQL caps a call at 100 arguments, so the
 * pairs are split into chunks of 50 joined with `||`.
 */
export function BuildJsonArg(args: CrudCallArg[], boolCols: Set<string>): string {
  const pairs = args
    .filter(a => !/_Clear$/i.test(a.ParamName.replace(/^p_/, '')))
    .map(a => `'${a.ParamName.replace(/^p_/, '')}', ${CoerceBooleanArg(a.ParamName, a.ValueExpr, boolCols)}`);

  const CHUNK = 50;
  const chunks: string[] = [];
  for (let i = 0; i < pairs.length; i += CHUNK) {
    chunks.push(`jsonb_build_object(\n    ${pairs.slice(i, i + CHUNK).join(',\n    ')}\n  )`);
  }
  return chunks.join(' ||\n  ');
}

/**
 * The text for `n.nspname = '...'` for a schema reference as written in the emitted SQL.
 * PostgreSQL folds an unquoted schema to lower case; a quoted schema keeps its case.
 */
export function SchemaCatalogueName(schemaRef: string): string {
  const quoted = schemaRef.match(/^"(.*)"$/);
  const name = quoted ? quoted[1].replace(/""/g, '"') : schemaRef.toLowerCase();
  return name.replace(/'/g, "''");
}

/**
 * The PERFORM statement(s) for one CRUD call, each line prefixed with `indent`.
 *
 * Above `ParamLimit` arguments only the JSON-arg shape can exist, so that call is emitted alone.
 * Otherwise the argument count does not settle the shape (an EXEC can omit defaulted parameters),
 * so the call checks `pg_proc` when it runs and takes the matching branch. PL/pgSQL plans a
 * statement on first execution, so the branch that is not taken never has to resolve.
 *
 * The catalogue check is on one line so that later line-based rewrites of a procedure body
 * do not treat it as a T-SQL `IF` followed by a `SELECT`.
 */
export function CrudCallPerformLines(
  procRef: string,
  args: CrudCallArg[],
  context: ConversionContext,
  indent: string,
  options: CrudCallOptions,
): string[] {
  const boolCols = BoolColumnsForProc(procRef, context.TableColumns);
  const jsonCall = `PERFORM ${procRef}(p_data := ${BuildJsonArg(args, boolCols)});`;
  if (args.length > options.ParamLimit) {
    return [`${indent}${jsonCall}`];
  }

  const typedArgs = args
    .map(a => `${a.ParamName} ${options.NamedArgOperator} ${CoerceBooleanArg(a.ParamName, a.ValueExpr, boolCols)}`)
    .join(', ');
  const procName = procRef.replace(/^.*\./, '').replace(/"/g, '');
  const schemaName = SchemaCatalogueName(procRef.includes('.') ? procRef.replace(/\.[^.]*$/, '') : context.Schema);
  return [
    `${indent}IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace ` +
      `WHERE n.nspname = '${schemaName}' AND p.proname = '${procName}' ` +
      `AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype) THEN`,
    `${indent}  ${jsonCall}`,
    `${indent}ELSE`,
    `${indent}  PERFORM ${procRef}(${typedArgs});`,
    `${indent}END IF;`,
  ];
}
