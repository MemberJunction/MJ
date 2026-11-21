/**
 * Primary-key flags from discovery candidates.
 *
 * A table may carry several candidates (a composite from one heuristic, a single column from
 * another, a key the LLM proposed). Flagging the columns of every candidate at or above the
 * confidence floor produced a key that was the union of them, and a candidate rejected by pruning
 * kept its columns flagged because pruning only changed its status. This applies ONE candidate per
 * table and clears the flags of the table's other candidates' columns, so a re-apply after pruning
 * or after an LLM decision unflags what lost. When no candidate survives, every candidate column is
 * unflagged.
 *
 * A table whose key was declared in the catalog gets no discovered key and loses none of its flags,
 * so a candidate (in practice an LLM proposal) is never flagged on top of the declared key. Flags
 * set here carry `primaryKeySource: 'discovery'`; see {@link HasDeclaredPrimaryKey}.
 */

import { PKCandidate } from '../types/discovery.js';
import { ColumnDefinition, DatabaseDocumentation, TableDefinition } from '../types/state.js';

export interface ApplyPrimaryKeysResult {
  /** Tables that received a key. */
  TablesFlagged: number;
  /** Columns unflagged because they belonged only to a losing or rejected candidate. */
  ColumnsCleared: number;
}

/**
 * Applies the best surviving candidate of each table. A candidate survives when it is not rejected
 * and is either confirmed or at or above the floor. The best one is confirmed before unconfirmed,
 * then highest confidence; ties keep the earlier candidate.
 *
 * @param minimumConfidence on the candidates' 0–100 scale.
 */
export function ApplyBestPrimaryKeys(state: DatabaseDocumentation, candidates: PKCandidate[], minimumConfidence: number): ApplyPrimaryKeysResult {
  const result: ApplyPrimaryKeysResult = { TablesFlagged: 0, ColumnsCleared: 0 };
  for (const group of groupByTable(candidates).values()) {
    const table = state.schemas.find((s) => s.name === group[0].schemaName)?.tables.find((t) => t.name === group[0].tableName);
    if (!table || HasDeclaredPrimaryKey(table, group)) continue;
    const best = pickBest(group.filter((c) => survives(c, minimumConfidence)));
    result.ColumnsCleared += applyTableKey(table, best, group);
    if (best) result.TablesFlagged++;
  }
  return result;
}

/**
 * True when the table has a key declared in the catalog. A flagged column counts as declared unless
 * discovery set it: it carries `primaryKeySource: 'discovery'`, or (for state files written before
 * the marker existed) one of the table's candidates names it.
 */
export function HasDeclaredPrimaryKey(table: TableDefinition, tableCandidates: PKCandidate[]): boolean {
  const named = new Set(tableCandidates.flatMap((c) => c.columnNames));
  return table.columns.some((c) => c.isPrimaryKey && c.primaryKeySource !== 'discovery' && !named.has(c.name));
}

/** Flags the winning candidate's columns and unflags the other candidates'; returns how many were unflagged. */
function applyTableKey(table: TableDefinition, best: PKCandidate | undefined, group: PKCandidate[]): number {
  const winning = new Set(best?.columnNames ?? []);
  const named = new Set(group.flatMap((c) => c.columnNames));
  let cleared = 0;
  for (const column of table.columns) {
    if (winning.has(column.name)) {
      markDiscovered(column, true);
    } else if (named.has(column.name) && column.isPrimaryKey) {
      markDiscovered(column, false);
      cleared++;
    }
  }
  return cleared;
}

function markDiscovered(column: ColumnDefinition, isKey: boolean): void {
  column.isPrimaryKey = isKey;
  if (isKey) column.primaryKeySource = 'discovery';
  else delete column.primaryKeySource;
}

function groupByTable(candidates: PKCandidate[]): Map<string, PKCandidate[]> {
  const byTable = new Map<string, PKCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.schemaName}.${candidate.tableName}`;
    byTable.set(key, [...(byTable.get(key) ?? []), candidate]);
  }
  return byTable;
}

function survives(candidate: PKCandidate, minimumConfidence: number): boolean {
  if (candidate.status === 'rejected') return false;
  return candidate.status === 'confirmed' || candidate.confidence >= minimumConfidence;
}

function pickBest(eligible: PKCandidate[]): PKCandidate | undefined {
  const rank = (c: PKCandidate): [number, number] => [c.status === 'confirmed' ? 1 : 0, c.confidence];
  return eligible.reduce<PKCandidate | undefined>((top, c) => {
    if (!top) return c;
    const [cConfirmed, cConfidence] = rank(c);
    const [tConfirmed, tConfidence] = rank(top);
    return cConfirmed > tConfirmed || (cConfirmed === tConfirmed && cConfidence > tConfidence) ? c : top;
  }, undefined);
}
