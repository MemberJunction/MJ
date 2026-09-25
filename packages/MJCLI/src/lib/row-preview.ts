/**
 * Renders a short, human-scannable preview of one database row so an
 * operator running `mj migrate repair` can recognise what they are about to
 * delete before confirming — not a bare GUID they just pasted from Task 2's
 * guidance, which they'd otherwise be confirming with nothing to recognise.
 *
 * Deliberately conservative — an identification aid, not a dump: skips null
 * values, binary payloads, the large-object SQL types (TEXT, NTEXT, IMAGE,
 * XML, VARBINARY, BINARY, UDT, TVP, GEOGRAPHY, GEOMETRY, VARIANT), and any
 * column whose name reads as a credential, and caps both how many columns are
 * shown and how long each value is.
 */

const MAX_COLUMNS = 6;
const MAX_VALUE_LENGTH = 60;

// SQL types that hold large or binary content — not useful for identifying a
// row, and unbounded, so they are skipped as a category regardless of the
// actual value's length.
const SKIPPED_SQL_TYPES = new Set([
  'Text',
  'NText',
  'Xml',
  'Image',
  'Binary',
  'VarBinary',
  'UDT',
  'TVP',
  'Geography',
  'Geometry',
  'Variant',
]);

// Columns whose VALUES are credentials. `__mj` carries [APIKey], [OwnerToken]
// and [LockToken] among others, and this preview is printed to stdout — into a
// CI workflow log, in the push-before-migrate lane. Nothing here identifies a
// row to a human anyway, so there is no cost to skipping it.
const SENSITIVE_COLUMN_NAME = /password|secret|token|apikey|privatekey/i;

/**
 * The minimal shape this needs out of a driver's column-metadata entry. Real
 * mssql column metadata (`IRecordSet.columns[name]`) satisfies this
 * structurally — its `type` is the raw SQL type constructor (e.g. `sql.Text`,
 * `sql.NVarChar`), which is a function named after the type it represents
 * because the driver defines each as an ES2015 shorthand method — so no
 * adaptation is needed at the call site.
 */
export interface RowPreviewColumn {
  type: unknown;
}

function SqlTypeName(type: unknown): string {
  if (typeof type === 'function') return type.name;
  if (typeof type === 'object' && type !== null && 'type' in type) {
    const inner = type.type;
    if (typeof inner === 'function') return inner.name;
  }
  return '';
}

function IsScalar(value: unknown): value is string | number | boolean | Date {
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date
  );
}

function Truncate(text: string): string {
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

/**
 * Formats up to `MAX_COLUMNS` identifying values from one row, e.g.:
 *   Name: Anthropic Vertex Key
 *   Status: Active
 * Returns an empty array when the row has nothing safe to show — callers
 * should still fall back to the raw ID and table in that case.
 */
export function FormatRowPreview(
  row: Record<string, unknown>,
  columns: Record<string, RowPreviewColumn>,
): string[] {
  const lines: string[] = [];
  for (const name of Object.keys(columns)) {
    if (lines.length >= MAX_COLUMNS) break;

    const value = row[name];
    if (value === null || value === undefined) continue;
    if (!IsScalar(value)) continue; // Buffers, arrays, and other non-scalars
    if (SKIPPED_SQL_TYPES.has(SqlTypeName(columns[name].type))) continue;
    if (SENSITIVE_COLUMN_NAME.test(name)) continue;

    const text = value instanceof Date ? value.toISOString() : String(value);
    lines.push(`${name}: ${Truncate(text)}`);
  }
  return lines;
}
