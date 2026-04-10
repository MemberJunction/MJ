/**
 * Centralized SQL type resolution for the conversion pipeline.
 *
 * Delegates to @memberjunction/sql-dialect's TypeMap for standard mappings,
 * then applies MJ-specific overrides (e.g., DATETIME -> TIMESTAMPTZ instead of
 * TIMESTAMP, SQL_VARIANT -> TEXT, HIERARCHYID -> TEXT).
 *
 * All type mapping in the converter should go through this module so the
 * knowledge lives in one place and is easy to extend for new dialect pairs.
 */
import { PostgreSQLDialect } from '@memberjunction/sql-dialect';
import type { DataTypeMap } from '@memberjunction/sql-dialect';

/**
 * MJ-specific overrides applied *after* the dialect's TypeMap.
 *
 * The dialect maps DATETIME -> TIMESTAMP, but MJ stores everything with timezone
 * info, so the converter maps DATETIME/DATETIME2/SMALLDATETIME -> TIMESTAMPTZ.
 * The dialect also doesn't know about SQL_VARIANT or HIERARCHYID.
 */
const MJ_OVERRIDES: Map<string, string> = new Map([
  ['DATETIME', 'TIMESTAMPTZ'],
  ['DATETIME2', 'TIMESTAMPTZ'],
  ['SMALLDATETIME', 'TIMESTAMPTZ'],
  ['NTEXT', 'TEXT'],
  ['SQL_VARIANT', 'TEXT'],
  ['HIERARCHYID', 'TEXT'],
]);

/** Cached dialect type maps keyed by target dialect */
const dialectTypeMaps: Map<string, DataTypeMap> = new Map();

/**
 * Get the DataTypeMap for a target dialect.
 * Currently only 'postgres' is supported; additional dialects can be added here.
 */
function getTypeMap(targetDialect: string): DataTypeMap | undefined {
  const key = targetDialect.toLowerCase();
  let typeMap = dialectTypeMaps.get(key);
  if (!typeMap) {
    if (key === 'postgres' || key === 'postgresql') {
      typeMap = new PostgreSQLDialect().TypeMap;
      dialectTypeMaps.set(key, typeMap);
    }
  }
  return typeMap;
}

/**
 * Parse a SQL type string into its components.
 *
 * Examples:
 *   "NVARCHAR(255)"      -> { baseName: "NVARCHAR", length: 255 }
 *   "NVARCHAR(MAX)"      -> { baseName: "NVARCHAR", length: -1 }
 *   "DECIMAL(18,2)"      -> { baseName: "DECIMAL", precision: 18, scale: 2 }
 *   "UNIQUEIDENTIFIER"   -> { baseName: "UNIQUEIDENTIFIER" }
 *   "DATETIME2(7)"       -> { baseName: "DATETIME2", precision: 7 }
 *   "FLOAT(53)"          -> { baseName: "FLOAT", precision: 53 }
 */
export interface ParsedType {
  BaseName: string;
  Length?: number;
  Precision?: number;
  Scale?: number;
}

export function parseTypeString(typeStr: string): ParsedType {
  const trimmed = typeStr.trim();

  // Match TYPE(args)
  const m = trimmed.match(/^(\w+)\s*\(\s*(.+?)\s*\)$/i);
  if (!m) {
    // Plain type name, no parentheses
    return { BaseName: trimmed.toUpperCase() };
  }

  const baseName = m[1].toUpperCase();
  const args = m[2].toUpperCase();

  // Handle MAX keyword
  if (args === 'MAX') {
    return { BaseName: baseName, Length: -1 };
  }

  // Handle precision,scale (e.g., DECIMAL(18,2))
  const psMatch = args.match(/^(\d+)\s*,\s*(\d+)$/);
  if (psMatch) {
    return {
      BaseName: baseName,
      Precision: parseInt(psMatch[1], 10),
      Scale: parseInt(psMatch[2], 10),
    };
  }

  // Single numeric argument — could be length or precision depending on type
  const singleNum = parseInt(args, 10);
  if (!isNaN(singleNum)) {
    // String types use "length", numeric/date types use "precision"
    const stringTypes = new Set(['NVARCHAR', 'VARCHAR', 'NCHAR', 'CHAR', 'VARBINARY', 'BINARY']);
    if (stringTypes.has(baseName)) {
      return { BaseName: baseName, Length: singleNum };
    }
    return { BaseName: baseName, Precision: singleNum };
  }

  // Couldn't parse args; return base name
  return { BaseName: baseName };
}

/**
 * Resolve a T-SQL type to its target dialect equivalent.
 *
 * @param typeStr    Full type string (e.g., "NVARCHAR(255)", "UNIQUEIDENTIFIER", "DECIMAL(18,2)")
 * @param targetDialect  Target dialect (default: 'postgres')
 * @returns  The mapped type string for the target dialect
 */
export function resolveType(typeStr: string, targetDialect: string = 'postgres'): string {
  const parsed = parseTypeString(typeStr);

  // Check MJ overrides first (takes precedence)
  const override = MJ_OVERRIDES.get(parsed.BaseName);
  if (override) {
    return override;
  }

  // Delegate to the dialect's TypeMap
  const typeMap = getTypeMap(targetDialect);
  if (typeMap) {
    return typeMap.MapTypeToString(
      parsed.BaseName,
      parsed.Length,
      parsed.Precision,
      parsed.Scale,
    );
  }

  // No dialect available — return as-is
  return typeStr;
}

/**
 * Resolve a type for inline CAST/CONVERT usage.
 *
 * Same as resolveType but handles the additional patterns found in CAST expressions:
 * - Types with precision in parentheses that should be stripped (e.g., DATETIME2(7) -> TIMESTAMPTZ)
 * - NVARCHAR without length -> TEXT
 */
export function resolveInlineType(typeStr: string, targetDialect: string = 'postgres'): string {
  return resolveType(typeStr, targetDialect);
}
