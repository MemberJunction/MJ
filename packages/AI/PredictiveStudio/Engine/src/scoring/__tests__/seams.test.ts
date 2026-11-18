import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, RunViewResult, UserInfo } from '@memberjunction/core';
import { RunViewPipelineUnitLookup } from '../seams';

type PipelineUnitRow = { ID: string; PredictionUnitID: string | null };

/** A provider whose RunView returns one canned result (one deliberate test-double cast at the seam). */
function providerReturning(result: Pick<RunViewResult<PipelineUnitRow>, 'Success' | 'Results' | 'ErrorMessage'>): IMetadataProvider {
  return { RunView: async () => result } as unknown as IMetadataProvider;
}
const user = { ID: 'u' } as UserInfo;

describe('RunViewPipelineUnitLookup.PredictionUnitIDOf', () => {
  it('throws a failed read with its error message', async () => {
    const provider = providerReturning({ Success: false, Results: [], ErrorMessage: 'permission denied' });
    await expect(new RunViewPipelineUnitLookup().PredictionUnitIDOf('pipe-1', user, provider)).rejects.toThrow(/pipe-1.*permission denied/);
  });

  it('throws when the pipeline row is not found or not readable (zero rows is not "no unit")', async () => {
    const provider = providerReturning({ Success: true, Results: [], ErrorMessage: '' });
    await expect(new RunViewPipelineUnitLookup().PredictionUnitIDOf('pipe-1', user, provider)).rejects.toThrow(/pipe-1.*not found or not readable/);
  });

  it("returns the row's PredictionUnitID, and null when the column is null", async () => {
    const lookup = new RunViewPipelineUnitLookup();
    expect(await lookup.PredictionUnitIDOf('pipe-1', user, providerReturning({ Success: true, Results: [{ ID: 'pipe-1', PredictionUnitID: 'U-1' }], ErrorMessage: '' }))).toBe('U-1');
    expect(await lookup.PredictionUnitIDOf('pipe-1', user, providerReturning({ Success: true, Results: [{ ID: 'pipe-1', PredictionUnitID: null }], ErrorMessage: '' }))).toBeNull();
  });
});
