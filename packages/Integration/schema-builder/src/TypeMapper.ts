/**
 * TypeMapper — converts generic source types to platform-specific SQL types.
 *
 * The concrete per-dialect SQL type (SQL Server NVARCHAR/MAX vs PostgreSQL VARCHAR/TEXT, etc.) is
 * resolved by the canonical `@memberjunction/sql-dialect` abstraction — there is deliberately NO
 * `platform === 'sqlserver'` branching in this file. This mapper supplies only the integration's
 * dialect-AGNOSTIC sizing policy (string floor + generous headroom; decimal precision floor) and
 * delegates the actual type construction to `SQLDialect.ResolveAbstractType`.
 */
import type { DatabasePlatform, SourceFieldInfo, TypeMappingEntry } from './interfaces.js';
import { GetDialect } from '@memberjunction/sql-dialect';

const TYPE_MAP: TypeMappingEntry[] = [
  { SourceType: 'string', SqlServerType: 'NVARCHAR', PostgresType: 'VARCHAR', MJFieldType: 'nvarchar' },
  { SourceType: 'text', SqlServerType: 'NVARCHAR(MAX)', PostgresType: 'TEXT', MJFieldType: 'nvarchar' },
  { SourceType: 'integer', SqlServerType: 'INT', PostgresType: 'INTEGER', MJFieldType: 'int' },
  { SourceType: 'bigint', SqlServerType: 'BIGINT', PostgresType: 'BIGINT', MJFieldType: 'bigint' },
  { SourceType: 'decimal', SqlServerType: 'DECIMAL', PostgresType: 'NUMERIC', MJFieldType: 'decimal' },
  { SourceType: 'boolean', SqlServerType: 'BIT', PostgresType: 'BOOLEAN', MJFieldType: 'bit' },
  { SourceType: 'datetime', SqlServerType: 'DATETIMEOFFSET', PostgresType: 'TIMESTAMPTZ', MJFieldType: 'datetimeoffset' },
  { SourceType: 'date', SqlServerType: 'DATE', PostgresType: 'DATE', MJFieldType: 'date' },
  { SourceType: 'uuid', SqlServerType: 'UNIQUEIDENTIFIER', PostgresType: 'UUID', MJFieldType: 'uniqueidentifier' },
  { SourceType: 'json', SqlServerType: 'NVARCHAR(MAX)', PostgresType: 'TEXT', MJFieldType: 'nvarchar' },
  { SourceType: 'float', SqlServerType: 'FLOAT', PostgresType: 'DOUBLE PRECISION', MJFieldType: 'float' },
  { SourceType: 'time', SqlServerType: 'TIME', PostgresType: 'TIME', MJFieldType: 'time' },
];

/**
 * MJ catalog field types ('nvarchar', 'nvarchar(MAX)', 'int', 'bit', 'datetimeoffset',
 * 'uniqueidentifier', etc.) and connector aliases ('number', 'currency', 'double', 'bool',
 * 'timestamp', 'picklist', etc.) map back onto TYPE_MAP's canonical SourceType vocabulary.
 * Without this, persisted IntegrationObjectField.Type values ('bit', 'datetimeoffset', 'int')
 * miss TYPE_MAP and fall through to the unknown-type TEXT/NVARCHAR(MAX) fallback.
 */
function normalizeSourceType(raw: string): string {
  const t = (raw ?? '').toLowerCase().trim();
  if (t === 'nvarchar' || t === 'varchar' || t === 'nchar' || t === 'char' || t === 'enum' || t === 'enumeration' || t === 'picklist' || t === 'multipicklist') return 'string';
  if (t === 'nvarchar(max)' || t === 'varchar(max)' || t === 'ntext' || t === 'richtext') return 'text';
  if (t === 'int' || t === 'smallint' || t === 'tinyint') return 'integer';
  if (t === 'number' || t === 'numeric' || t === 'currency' || t === 'money' || t === 'smallmoney' || t === 'percent') return 'decimal';
  if (t === 'double' || t === 'real') return 'float';
  if (t === 'bit' || t === 'bool') return 'boolean';
  if (t === 'datetimeoffset' || t === 'datetime2' || t === 'smalldatetime' || t === 'timestamp' || t === 'timestamptz') return 'datetime';
  if (t === 'uniqueidentifier') return 'uuid';
  return t;
}

/**
 * Maps generic source field types to platform-specific SQL types via the dialect abstraction.
 */
export class TypeMapper {
  /**
   * Convert a source field's type to the appropriate SQL type for the given platform.
   */
  MapSourceType(sourceType: string, platform: DatabasePlatform, field: SourceFieldInfo): string {
    const normalized = normalizeSourceType(sourceType);
    const dialect = GetDialect(platform);
    const entry = TYPE_MAP.find((t) => t.SourceType === normalized);
    const isIndexedKey = Boolean(field.IsPrimaryKey || field.IsForeignKey || field.IsUniqueKey);

    // Unknown source type → the dialect's own text fallback (NVARCHAR(MAX) / TEXT), never a guess.
    if (!entry) {
      const fallback = dialect.ResolveAbstractType({ type: 'text' });
      return isIndexedKey ? dialect.CapIndexableType(fallback) : fallback;
    }

    // The integration supplies its dialect-AGNOSTIC sizing policy; the dialect builds the concrete
    // SQL type and only falls back to its OWN unbounded type when the value genuinely exceeds the
    // dialect's bounded ceiling. No `platform === ...` branching lives here.
    const abstractType = entry.SourceType;
    if (abstractType === 'string') {
      // Bounded-and-SMALL by policy — space is the priority. A plain `string` is NEVER NVARCHAR(MAX):
      // genuinely large content is a distinct modality the source MUST type explicitly as `text`/`json`
      // (those map to MAX in TYPE_MAP). SIZE IS PROVABLE-FIRST: when the extractor captured a declared
      // size from the docs/spec (`field.MaxLength`), that wins (declared+headroom). The 255 floor is only
      // the DEFAULT-of-last-resort for a field the source gives no size for — not a hardcoded policy, just
      // the fallback when nothing is retrievable. A value that does not fit its bounded column is NOT
      // truncated and does NOT widen the column — it is handled at sync time by SKIPPING that record with
      // a surfaced warning (see IntegrationEngine string-overflow handling). Small columns + skip-and-
      // surface beats a table of unbounded MAX columns for a rare oversized value.
      let maxLength = this.boundedStringLength(field);
      // An indexed key string column (Soft PK, Soft FK, or Organic Key) must fit the dialect's INDEX KEY
      // size limit — cap it there. The dialect reports its OWN ceiling (SQL Server 450 chars; PostgreSQL
      // effectively none), so there is no platform branch here. A too-wide key would otherwise fail
      // index creation.
      //
      // An UNBOUNDED width (-1) is the `text` modality in this vocabulary, and the dialect already
      // resolves that to its own unbounded type. Routing it through `string` instead would hit
      // resolveStringType's `> 0` test and silently yield NVARCHAR(255) — the NARROWEST column for a
      // field explicitly asked to be the widest. An indexed key can never be unbounded (MAX is not
      // indexable), so it is clamped to the key ceiling instead; note Math.min would return -1 here,
      // which is why this is a special case rather than a comparison. Where the key ceiling is
      // effectively none (PostgreSQL), the dialect renders that width as its own unbounded type.
      if (maxLength === -1) {
        if (!isIndexedKey) return dialect.ResolveAbstractType({ type: 'text' });
        maxLength = dialect.MaxKeyStringLength;
      }
      if (isIndexedKey) maxLength = Math.min(maxLength, dialect.MaxKeyStringLength);
      return dialect.ResolveAbstractType({ type: 'string', maxLength });
    }
    if (abstractType === 'text') {
      const resolved = dialect.ResolveAbstractType({ type: 'text' });
      return isIndexedKey ? dialect.CapIndexableType(resolved) : resolved;
    }
    if (abstractType === 'decimal') {
      const { precision, scale } = this.boundedDecimalPrecision(field);
      return dialect.ResolveAbstractType({ type: 'decimal', precision, scale });
    }
    // A json source column is the dialect's unbounded text type, never its native JSON type. Its MJ field
    // type is nvarchar (TYPE_MAP), so CodeGen's CRUD functions take and write text, and PostgreSQL rejects
    // text into a JSONB column: the column has to be the type the metadata reads it as.
    if (abstractType === 'json') return dialect.ResolveAbstractType({ type: 'text' });
    return dialect.ResolveAbstractType({ type: abstractType });
  }

  /**
   * Get the MJ EntityField.Type value for a source type (informational only).
   */
  GetMJFieldType(sourceType: string): string {
    const normalized = normalizeSourceType(sourceType);
    const entry = TYPE_MAP.find((t) => t.SourceType === normalized);
    return entry ? entry.MJFieldType : 'nvarchar';
  }

  /**
   * Get all supported type mappings.
   */
  GetAllMappings(): ReadonlyArray<TypeMappingEntry> {
    return TYPE_MAP;
  }

  /**
   * Integration string-sizing policy (dialect-AGNOSTIC). Returns the effective max length; the dialect
   * turns it into NVARCHAR(n)/VARCHAR(n) and only falls back to its OWN unbounded type when the value
   * genuinely exceeds the dialect's bounded ceiling — so discovered columns stay bounded "to the best
   * of our ability" without hardcoding any per-dialect ceiling here.
   *   - `declared` = the longest value discovery actually observed. A sample is a LOWER bound (a longer
   *     value may live in unsampled records), so add generous additive headroom + a floor. Never truncates.
   */
  private boundedStringLength(field: SourceFieldInfo): number {
    const MIN_LENGTH = 255; // floor — a tiny field still gets a sane column
    const HEADROOM = 300; // generous additive buffer for values longer than the sample happened to see
    // SQL Server's nvarchar(max) character count (2^30 - 1). A source that declares this width or more is
    // describing an unbounded column in numbers (netFORUM reports nvarchar(max) as 2147483646), not a width.
    const UNBOUNDED_DECLARED_LENGTH = 1073741823;
    // -1 is MAX/unbounded (the convention both dialects render as `(MAX)`), passed straight through
    // so the dialect resolves its own unbounded type. Without this it failed the `> 0` test and fell
    // to the 255 floor — i.e. asking for MAX produced the NARROWEST possible column.
    if (field.MaxLength === -1) return -1;
    // A declared unbounded width is handed on as -1 too, unpadded. Adding HEADROOM to 2147483646 produced
    // VARCHAR(2147483946), which no dialect can create (PostgreSQL caps VARCHAR(n) at 10485760), so the
    // CREATE TABLE failed outright. As -1 each dialect picks its own unbounded type: TEXT / NVARCHAR(MAX).
    if (field.MaxLength != null && field.MaxLength >= UNBOUNDED_DECLARED_LENGTH) return -1;
    const declared = field.MaxLength != null && field.MaxLength > 0 ? field.MaxLength : null;
    return declared == null ? MIN_LENGTH : Math.max(MIN_LENGTH, declared + HEADROOM);
  }

  /**
   * Integration decimal precision/scale policy (defensive against sources that under-report precision,
   * e.g. Salesforce formula fields). Floors precision at 28, caps at the hard max of 38.
   */
  private boundedDecimalPrecision(field: SourceFieldInfo): { precision: number; scale: number } {
    const MIN_PRECISION = 28;
    const MAX_PRECISION = 38;
    let precision = field.Precision ?? MIN_PRECISION;
    let scale = field.Scale ?? 2;
    if (scale < 0) scale = 0;
    if (precision < MIN_PRECISION) precision = MIN_PRECISION;
    if (precision > MAX_PRECISION) precision = MAX_PRECISION;
    if (scale > precision) scale = precision;
    return { precision, scale };
  }
}
