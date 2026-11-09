/**
 * Primary-key flags from discovery candidates (#6004).
 *
 * A table may carry several candidates (a composite from one heuristic, a single column from
 * another). Flagging the columns of every candidate at or above the confidence floor produced a
 * key that was the union of them, and a candidate rejected by pruning kept its columns flagged
 * because pruning only changed its status. This applies ONE candidate per table: the best
 * non-rejected one at or above the floor (highest confidence; ties keep the earlier candidate),
 * clearing the flags of the table's other candidates' columns first so a re-apply after pruning
 * unflags what was rejected. Columns no candidate names are never touched, so a key declared in
 * the catalog is left alone.
 */

import { PKCandidate } from '../types/discovery.js';
import { DatabaseDocumentation } from '../types/state.js';

export interface ApplyPrimaryKeysResult {
  /** Tables that received a key. */
  TablesFlagged: number;
  /** Columns unflagged because they belonged only to a losing or rejected candidate. */
  ColumnsCleared: number;
}

/** @param minimumConfidence on the candidates' 0–100 scale. */
export function ApplyBestPrimaryKeys(state: DatabaseDocumentation, candidates: PKCandidate[], minimumConfidence: number): ApplyPrimaryKeysResult {
  const byTable = new Map<string, PKCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.schemaName}.${candidate.tableName}`;
    byTable.set(key, [...(byTable.get(key) ?? []), candidate]);
  }
  let tablesFlagged = 0;
  let columnsCleared = 0;
  for (const group of byTable.values()) {
    const eligible = group.filter((c) => c.status !== 'rejected' && c.confidence >= minimumConfidence);
    if (eligible.length === 0) continue;
    const schema = state.schemas.find((s) => s.name === group[0].schemaName);
    const table = schema?.tables.find((t) => t.name === group[0].tableName);
    if (!table) continue;
    const best = eligible.reduce((top, c) => (c.confidence > top.confidence ? c : top), eligible[0]);
    const winning = new Set(best.columnNames);
    const named = new Set(group.flatMap((c) => c.columnNames));
    for (const column of table.columns) {
      if (named.has(column.name) && !winning.has(column.name) && column.isPrimaryKey) {
        column.isPrimaryKey = false;
        columnsCleared++;
      }
      if (winning.has(column.name)) column.isPrimaryKey = true;
    }
    tablesFlagged++;
  }
  return { TablesFlagged: tablesFlagged, ColumnsCleared: columnsCleared };
}
