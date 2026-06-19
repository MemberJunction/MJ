/**
 * Best-effort mapping from an external data source's native column type (as reported by a
 * driver's IntrospectSchema — e.g. 'character varying(255)', 'NUMBER(38,0)', 'timestamptz',
 * 'ObjectId') to an MJ / SQL-Server `EntityField` type plus length/precision/scale.
 *
 * External entities have no physical MJ table, so the `EntityField.Type` we generate for them
 * comes from introspection (CodeGen writes it verbatim). This mapping is intentionally permissive
 * and family-agnostic: it recognizes the common type vocabularies of PostgreSQL, Snowflake, and
 * MongoDB and falls back to `nvarchar(MAX)` for anything unknown — which a developer (or the LLM
 * field-decoration pass) can refine afterward. It is NOT a guarantee of perfect fidelity.
 *
 * `Length === -1` represents MAX (the SQL-Server/INFORMATION_SCHEMA convention MJ already uses).
 */
export interface MappedFieldType {
  Type: string;
  Length: number | null;
  Precision: number | null;
  Scale: number | null;
}

const STRING_TYPES = new Set([
  'varchar', 'character varying', 'char', 'character', 'bpchar', 'text', 'nvarchar', 'nchar', 'ntext',
  'string', 'varchar2', 'nvarchar2', 'char varying', 'clob', 'nclob', 'citext', 'enum', 'set', 'json',
  'jsonb', 'xml', 'variant', 'object', 'array',
]);
const INT_TYPES = new Set(['int', 'integer', 'int4', 'int2', 'smallint', 'tinyint', 'serial', 'smallserial', 'mediumint', 'year']);
const BIGINT_TYPES = new Set(['bigint', 'int8', 'bigserial', 'long']);
const DECIMAL_TYPES = new Set(['decimal', 'numeric', 'number', 'money', 'smallmoney', 'dec']);
const FLOAT_TYPES = new Set(['float', 'float4', 'float8', 'real', 'double', 'double precision', 'binary_float', 'binary_double']);
const BOOL_TYPES = new Set(['bool', 'boolean', 'bit']);
const DATE_TYPES = new Set(['date']);
const TIME_TYPES = new Set(['time', 'time without time zone', 'time with time zone', 'timetz']);
const DATETIME_TYPES = new Set([
  'timestamp', 'timestamptz', 'timestamp without time zone', 'timestamp with time zone', 'datetime', 'datetime2',
  'datetimeoffset', 'smalldatetime', 'timestamp_ntz', 'timestamp_tz', 'timestamp_ltz',
]);
const BINARY_TYPES = new Set(['bytea', 'binary', 'varbinary', 'blob', 'image', 'bytes', 'raw', 'longblob']);
const UUID_TYPES = new Set(['uuid', 'uniqueidentifier']);

/** Map a verbatim native type string to an MJ EntityField type descriptor. */
export function mapExternalNativeTypeToMJ(nativeType: string): MappedFieldType {
  const raw = (nativeType ?? '').trim();
  // Separate the base type from any "(...)" arguments: "varchar(255)" -> base "varchar", args [255].
  const match = raw.match(/^([A-Za-z0-9_ ]+?)\s*(?:\(([^)]*)\))?\s*$/);
  const base = (match?.[1] ?? raw).trim().toLowerCase();
  const args = (match?.[2] ?? '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  const arg1 = args.length > 0 ? args[0] : null;
  const arg2 = args.length > 1 ? args[1] : null;

  const plain = (type: string): MappedFieldType => ({ Type: type, Length: null, Precision: null, Scale: null });
  const string = (len: number | null): MappedFieldType => ({ Type: 'nvarchar', Length: len ?? -1, Precision: null, Scale: null });

  if (UUID_TYPES.has(base)) return plain('uniqueidentifier');
  if (base === 'objectid') return string(24); // MongoDB ObjectId -> 24-char hex string
  if (STRING_TYPES.has(base)) return string(arg1);
  if (BOOL_TYPES.has(base)) return plain('bit');
  if (INT_TYPES.has(base)) return plain('int');
  if (BIGINT_TYPES.has(base)) return plain('bigint');
  if (DECIMAL_TYPES.has(base)) {
    // NUMBER/NUMERIC carry (precision, scale); default to (18,0) when unspecified to preserve precision.
    return { Type: 'decimal', Length: null, Precision: arg1 ?? 18, Scale: arg2 ?? 0 };
  }
  if (FLOAT_TYPES.has(base)) return plain('float');
  if (DATE_TYPES.has(base)) return plain('date');
  if (TIME_TYPES.has(base)) return plain('time');
  if (DATETIME_TYPES.has(base)) return plain('datetimeoffset');
  if (BINARY_TYPES.has(base)) return { Type: 'varbinary', Length: arg1 ?? -1, Precision: null, Scale: null };

  // Unknown / complex (geometry, vectors, nested documents, arrays, ...) — store as text, refine later.
  return string(-1);
}
