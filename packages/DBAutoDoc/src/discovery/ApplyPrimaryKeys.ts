import type { DatabaseDocumentation, TableDefinition } from '../types/state.js';
import type { PKCandidate } from '../types/discovery.js';

/**
 * Applies discovered primary keys to the state: for each table, only the BEST surviving candidate
 * (not rejected, at or above the minimum confidence) sets `isPrimaryKey` on its columns (#6004).
 *
 * Flagging every qualifying candidate made a table's key the union of two candidates, and
 * because pruning only changes a candidate's status, a pruned candidate's columns stayed flagged.
 * So this first clears every flag discovery set earlier (`primaryKeySource === 'discovery'`),
 * then applies the best candidate again. Keys read from the schema are never touched, and a table
 * that already has a schema-declared key gets no discovered one.
 *
 * Ties on confidence go to the candidate listed first: `PKDetector` returns candidates already
 * ranked, and that order is kept in the phase.
 *
 * @param minimumConfidence - minimum candidate confidence on the 0-100 scale
 * @returns the number of tables a discovered key was applied to
 */
export function ApplyBestPrimaryKeysToState(
  state: DatabaseDocumentation,
  candidates: readonly PKCandidate[],
  minimumConfidence: number,
): number {
  const best = new Map<string, PKCandidate>();
  for (const pk of candidates) {
    if (pk.status === 'rejected' || pk.confidence < minimumConfidence) continue;
    const key = `${pk.schemaName}.${pk.tableName}`;
    const current = best.get(key);
    if (!current || pk.confidence > current.confidence) {
      best.set(key, pk);
    }
  }

  let applied = 0;
  for (const schema of state.schemas) {
    for (const table of schema.tables) {
      clearDiscoveredPrimaryKey(table);
      if (table.columns.some(c => c.isPrimaryKey)) continue; // schema-declared key stays as is
      const pk = best.get(`${schema.name}.${table.name}`);
      if (!pk) continue;
      let flagged = false;
      for (const columnName of pk.columnNames) {
        const column = table.columns.find(c => c.name === columnName);
        if (column) {
          column.isPrimaryKey = true;
          column.primaryKeySource = 'discovery';
          flagged = true;
        }
      }
      if (flagged) applied++;
    }
  }
  return applied;
}

function clearDiscoveredPrimaryKey(table: TableDefinition): void {
  for (const column of table.columns) {
    if (column.primaryKeySource === 'discovery') {
      column.isPrimaryKey = false;
      delete column.primaryKeySource;
    }
  }
}
