import { describe, it, expect } from 'vitest';
import { CheckPKProposal } from '../core/PKProposalGate';
import type { ColumnDefinition } from '../types/state';

function col(name: string, totalRows: number, distinctCount: number, nullCount = 0): ColumnDefinition {
  return {
    name, dataType: 'int', isNullable: nullCount > 0, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [],
    statistics: {
      totalRows, distinctCount, uniquenessRatio: totalRows > 0 ? distinctCount / totalRows : 0,
      nullCount, nullPercentage: totalRows > 0 ? (nullCount / totalRows) * 100 : 0, sampleValues: []
    }
  };
}

// ProductCostHistory: 395 rows; ProductID repeats (293 distinct), StartDate repeats (3 distinct); the pair is the key.
const PRODUCT_COST_HISTORY = { columns: [col('ProductID', 395, 293), col('StartDate', 395, 3), col('Notes', 395, 10, 5)] };

describe('CheckPKProposal', () => {
  it('accepts a composite key whose columns are not unique alone when the combination is unique', async () => {
    const checked: string[][] = [];
    const verdict = await CheckPKProposal(PRODUCT_COST_HISTORY, ['ProductID', 'StartDate'], async (cols) => { checked.push(cols); return true; });
    expect(verdict).toEqual({ Eligible: true, Columns: ['ProductID', 'StartDate'] });
    expect(checked).toEqual([['ProductID', 'StartDate']]);
  });

  it('rejects a composite key whose combination is not unique', async () => {
    const verdict = await CheckPKProposal(PRODUCT_COST_HISTORY, ['ProductID', 'StartDate'], async () => false);
    expect(verdict.Eligible).toBe(false);
    expect(verdict.Reason).toContain('combination is not unique');
  });

  it('rejects a composite key when uniqueness cannot be checked, or the check throws', async () => {
    expect((await CheckPKProposal(PRODUCT_COST_HISTORY, ['ProductID', 'StartDate'])).Reason).toContain("can't be checked");
    const thrown = await CheckPKProposal(PRODUCT_COST_HISTORY, ['ProductID', 'StartDate'], async () => { throw new Error('timeout'); });
    expect(thrown).toEqual({ Eligible: false, Reason: '(ProductID, StartDate) — uniqueness check failed: timeout' });
  });

  it('rejects a composite key with a nullable column without checking the database', async () => {
    let called = false;
    const verdict = await CheckPKProposal(PRODUCT_COST_HISTORY, ['ProductID', 'Notes'], async () => { called = true; return true; });
    expect(verdict.Reason).toContain('has 5 nulls');
    expect(called).toBe(false);
  });

  it('still requires a single-column key to be 100% unique on its own', async () => {
    expect((await CheckPKProposal(PRODUCT_COST_HISTORY, ['ProductID'])).Reason).toContain('uniqueness 74.2%');
    expect(await CheckPKProposal({ columns: [col('ID', 10, 10)] }, ['id'])).toEqual({ Eligible: true, Columns: ['ID'] });
  });

  it('rejects unknown columns, case-insensitively matching known ones', async () => {
    expect((await CheckPKProposal(PRODUCT_COST_HISTORY, ['Nope'])).Reason).toContain('not found');
    expect((await CheckPKProposal(PRODUCT_COST_HISTORY, ['productid', 'startdate'], async () => true)).Eligible).toBe(true);
  });

  it('passes the schema\'s column names to the database check, never the LLM\'s spelling', async () => {
    const checked: string[][] = [];
    await CheckPKProposal(PRODUCT_COST_HISTORY, ['PRODUCTID', 'startdate'], async (cols) => { checked.push(cols); return true; });
    expect(checked).toEqual([['ProductID', 'StartDate']]);
  });
});
