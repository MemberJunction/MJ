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
  { SourceType: 'json', SqlServerType: 'NVARCHAR(MAX)', PostgresType: 'JSONB', MJFieldType: 'nvarchar' },
  { SourceType: 'float', SqlServerType: 'FLOAT', PostgresType: 'DOUBLE PRECISION', MJFieldType: 'float' },
  { SourceType: 'time', SqlServerType: 'TIME', PostgresType: 'TIME', MJFieldType: 'time' },
];

/**
 * MJ sized-string field types ('nvarchar', 'varchar', …) map back onto the generic 'string' sizing
 * path. A column that was discovered, persisted as its MJ field TYPE, then re-read for DDL arrives
 * here as 'nvarchar' rather than the original source 'string'; without this it would miss the string
 * sizing path and the column's Length would be SILENTLY DROPPED (the bounded-types bug). 'text' is
 * deliberately NOT included — a genuine text field stays unbounded by design.
 */
function normalizeSizedStringType(t: string): string {
  return t === 'nvarchar' || t === 'varchar' || t === 'nchar' || t === 'char' ? 'string' : t;
}

/**
 * Maps generic source field types to platform-specific SQL types via the dialect abstraction.
 */
export class TypeMapper {
  /**
   * Convert a source field's type to the appropriate SQL type for the given platform.
   */
  MapSourceType(sourceType: string, platform: DatabasePlatform, field: SourceFieldInfo): string {
    const normalized = normalizeSizedStringType(sourceType.toLowerCase().trim());
    const dialect = GetDialect(platform);
    const entry = TYPE_MAP.find((t) => t.SourceType === normalized);

    // Unknown source type → the dialect's own text fallback (NVARCHAR(MAX) / TEXT), never a guess.
    if (!entry) {
      return dialect.ResolveAbstractType({ type: 'text' });
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
      // A primary-key string column must fit the dialect's INDEX KEY size limit — cap it there. The
      // dialect reports its OWN ceiling (SQL Server 450 chars; PostgreSQL effectively none), so there is
      // no platform branch here. A too-wide PK would otherwise fail unique-constraint / index creation.
      if (field.IsPrimaryKey) maxLength = Math.min(maxLength, dialect.MaxKeyStringLength);
      return dialect.ResolveAbstractType({ type: 'string', maxLength });
    }
    if (abstractType === 'decimal') {
      const { precision, scale } = this.boundedDecimalPrecision(field);
      return dialect.ResolveAbstractType({ type: 'decimal', precision, scale });
    }
    return dialect.ResolveAbstractType({ type: abstractType });
  }

  /**
   * Get the MJ EntityField.Type value for a source type (informational only).
   */
  GetMJFieldType(sourceType: string): string {
    const normalized = sourceType.toLowerCase().trim();
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
