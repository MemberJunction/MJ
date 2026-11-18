/**
 * Deterministic eligibility for a primary key the LLM proposes during table analysis.
 */

import type { TableDefinition } from '../types/state.js';

/** Checks whether a column combination is unique in the database. */
export type CombinationUniquenessCheck = (columns: string[]) => Promise<boolean>;

/** Outcome of the gate: eligible, or the reason it is not. */
export interface PKProposalVerdict {
  Eligible: boolean;
  Reason?: string;
  /** When eligible: the proposed columns in the schema's own spelling. */
  Columns?: string[];
}

/**
 * Every column must exist, have statistics and contain no nulls. A single column must be 100% unique
 * on its own. A composite key only needs to be unique as a combination — its columns are usually not
 * unique individually (ProductID, StartDate) — so it is checked with `checkCombination`, which receives
 * the schema's column names rather than the LLM's spelling of them. Without one, a composite proposal is
 * rejected because its uniqueness cannot be verified.
 */
export async function CheckPKProposal(
  table: Pick<TableDefinition, 'columns'>,
  columns: string[],
  checkCombination?: CombinationUniquenessCheck
): Promise<PKProposalVerdict> {
  // The schema's own spelling of each column. Only these reach the database check, never the LLM's strings.
  const canonical: string[] = [];
  for (const colName of columns) {
    const column = table.columns.find((c) => c.name.toLowerCase() === colName.toLowerCase());
    if (!column) {
      return { Eligible: false, Reason: `column "${colName}" not found` };
    }
    canonical.push(column.name);
    const stats = column.statistics;
    if (!stats) {
      return { Eligible: false, Reason: `${colName} — no statistics available` };
    }
    if ((stats.nullCount || 0) > 0) {
      return { Eligible: false, Reason: `${colName} — has ${stats.nullCount} nulls` };
    }
    if (columns.length === 1) {
      // Safety: prefer pre-computed uniquenessRatio if available (totalRows can be 0 due to field naming bug)
      const uniqueness = stats.uniquenessRatio != null && stats.uniquenessRatio > 0
        ? stats.uniquenessRatio
        : (stats.totalRows > 0 ? stats.distinctCount / stats.totalRows : 0);
      if (uniqueness < 1.0) {
        return { Eligible: false, Reason: `${colName} — uniqueness ${(uniqueness * 100).toFixed(1)}% (must be 100%)` };
      }
    }
  }
  if (columns.length === 1) {
    return { Eligible: true, Columns: canonical };
  }
  if (!checkCombination) {
    return { Eligible: false, Reason: `(${columns.join(', ')}) — composite uniqueness can't be checked without a database connection` };
  }
  try {
    return (await checkCombination(canonical))
      ? { Eligible: true, Columns: canonical }
      : { Eligible: false, Reason: `(${columns.join(', ')}) — combination is not unique` };
  } catch (err) {
    return { Eligible: false, Reason: `(${columns.join(', ')}) — uniqueness check failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
