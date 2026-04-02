/**
 * Pure helper functions for creating DataSnapshots from artifact content.
 *
 * These are extracted from Angular viewer components so the logic can be
 * unit-tested without Angular TestBed. Each viewer plugin delegates to
 * the corresponding function here.
 */
import { DataSnapshot, DataTable, NormalizeToTables } from '@memberjunction/core';

/**
 * Shape of a DataArtifactSpec that the data viewer works with.
 * Only the fields relevant to snapshot creation are required.
 */
interface DataArtifactSpecLike {
  title?: string;
  columns?: { field: string; headerName?: string; sqlBaseType?: string }[];
  rows?: Record<string, unknown>[];
}

/**
 * Create a DataSnapshot from JSON artifact content.
 * Parses the JSON, counts top-level keys, and stores the parsed value in custom.
 */
export function createJsonSnapshot(content: string | null, title: string | null): DataSnapshot | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const snap = new DataSnapshot();
    snap.title = title ?? undefined;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      snap.interpretation = `JSON artifact with ${Object.keys(parsed).length} top-level keys.`;
    }
    snap.custom = parsed as Record<string, unknown>;
    return snap;
  } catch {
    return null;
  }
}

/**
 * Create a DataSnapshot from code artifact content.
 * Counts lines and stores content plus lineCount in custom.
 */
export function createCodeSnapshot(content: string | null, title: string | null): DataSnapshot | null {
  if (!content) return null;
  const lineCount = content.split('\n').length;
  const snap = new DataSnapshot();
  snap.title = title ?? undefined;
  snap.interpretation = `Code artifact, ${lineCount} lines.`;
  snap.custom = { content, lineCount };
  return snap;
}

/**
 * Create a DataSnapshot from markdown artifact content.
 * Stores the raw content in custom.
 */
export function createMarkdownSnapshot(content: string | null, title: string | null): DataSnapshot | null {
  if (!content) return null;
  const snap = new DataSnapshot();
  snap.title = title ?? undefined;
  snap.custom = { content };
  return snap;
}

/**
 * Create a DataSnapshot from a DataArtifactSpec (data viewer).
 * Uses NormalizeToTables to convert the spec into a tabular snapshot.
 */
/**
 * Build a combined SQL string from multiple tables, each with a header comment.
 * Returns null if no tables have SQL.
 */
export function buildMultiTableSql(tables: DataTable[]): string | null {
  const sqlTables = tables.filter(t => t.metadata?.sql);
  if (sqlTables.length === 0) return null;
  return sqlTables
    .map(t => `-- ═══ ${t.name} ═══\n${t.metadata!.sql!}`)
    .join('\n\n');
}

export function createDataSnapshot(spec: DataArtifactSpecLike | null): DataSnapshot | null {
  if (!spec) return null;
  const tableName = spec.title || 'Results';
  const tables = NormalizeToTables(spec as Record<string, unknown>, tableName);
  return DataSnapshot.FromTables(tables, spec.title);
}
