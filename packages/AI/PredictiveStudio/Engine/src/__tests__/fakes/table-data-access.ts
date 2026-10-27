/**
 * An in-memory `ICountingDataAccess` over plain tables, shared by the engine's unit tests.
 *
 * `ExtraFilter` is evaluated, not ignored, so a test sees the rows the database would return. It understands clauses
 * joined by ` AND `, each one of: `[Field] IS NOT NULL`, `[Field] = <number>`, `[Field] = '<text>'` and
 * `[Field] IN ('a','b',…)` (text compared case-insensitively, as SQL Server's default collation does). Any other
 * clause throws, so a filter the fake cannot evaluate fails the test loudly instead of returning every row.
 */
import { OrdinalCompare } from '@memberjunction/global';
import type { CountRowsResult, FetchRowsParams, FetchRowsResult, ICountingDataAccess, SourceRow } from '../../feature-assembly/data-access';

type RowPredicate = (row: SourceRow) => boolean;

export class TableDataAccess implements ICountingDataAccess {
  /** `tables` is read on every call, so a test may add or remove rows between reads. */
  constructor(private readonly tables: Record<string, SourceRow[]>) {}

  public async fetchRows(p: FetchRowsParams): Promise<FetchRowsResult> {
    const rows = this.matching(p.EntityName, p.ExtraFilter);
    if (p.OrderBy?.includes('DESC')) {
      const field = /\[(\w+)\]/.exec(p.OrderBy)?.[1] || '';
      rows.sort((x, y) => OrdinalCompare(String(y[field]), String(x[field])));   // ordinal, like the database
    }
    return { Success: true, Rows: rows.slice(0, p.MaxRows ?? rows.length), TotalRowCount: rows.length };
  }

  public async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }

  public async CountRows(p: { readonly EntityName: string; readonly ExtraFilter?: string }): Promise<CountRowsResult> {
    return { Success: true, Count: this.matching(p.EntityName, p.ExtraFilter).length };
  }

  private matching(entityName: string, filter: string | undefined): SourceRow[] {
    const predicates = filter ? filter.split(' AND ').map((clause) => TableDataAccess.parseClause(clause.trim())) : [];
    return (this.tables[entityName] || []).filter((row) => predicates.every((p) => p(row)));
  }

  private static parseClause(clause: string): RowPredicate {
    const notNull = /^\[(\w+)\] IS NOT NULL$/.exec(clause);
    if (notNull) return (row) => row[notNull[1]] !== null && row[notNull[1]] !== undefined;
    const numberEq = /^\[(\w+)\]\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(clause);
    if (numberEq) return (row) => row[numberEq[1]] !== null && row[numberEq[1]] !== undefined && Number(row[numberEq[1]]) === Number(numberEq[2]);
    const textEq = /^\[(\w+)\]\s*=\s*'((?:[^']|'')*)'$/.exec(clause);
    if (textEq) return (row) => TableDataAccess.textOf(row[textEq[1]]) === TableDataAccess.unquote(textEq[2]).toLowerCase();
    const inList = /^\[(\w+)\] IN \((.*)\)$/.exec(clause);
    if (inList) {
      const values = new Set([...inList[2].matchAll(/'((?:[^']|'')*)'/g)].map((m) => TableDataAccess.unquote(m[1]).toLowerCase()));
      return (row) => {
        const text = TableDataAccess.textOf(row[inList[1]]);
        return text !== null && values.has(text);
      };
    }
    throw new Error(`TableDataAccess cannot evaluate the filter clause "${clause}"`);
  }

  /** A cell as lower-cased text for case-insensitive matching; an absent cell never matches. */
  private static textOf(value: SourceRow[string]): string | null {
    return value === null || value === undefined ? null : String(value).toLowerCase();
  }

  private static unquote(literal: string): string {
    return literal.replace(/''/g, "'");
  }
}
