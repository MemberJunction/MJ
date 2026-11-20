import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { CreateFakeProvider, renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { MJMLScoringRunEntity } from '@memberjunction/core-entities';
import { PSScoringRunsComponent } from './ps-scoring-runs.component';
import { GatedReads, SettleReads } from './ps-gated-reads.dom-fixture';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/** The run members the list reads. */
type RunDouble = Pick<
  MJMLScoringRunEntity,
  'ID' | 'Status' | 'Path' | 'DryRun' | 'Total' | 'Written' | 'Failed' | 'Skipped' | 'RefusalObject' | 'FirstErrorsObject' | 'AsOfDate' | 'StartedAt'
>;

const Run = (over: Partial<RunDouble>): RunDouble => ({
  ID: 'SR-' + Math.random().toString(16).slice(2),
  Status: 'completed',
  Path: 'score-record-set',
  DryRun: false,
  Total: 10,
  Written: 10,
  Failed: 0,
  Skipped: 0,
  RefusalObject: null,
  FirstErrorsObject: null,
  AsOfDate: new Date('2026-11-01T00:00:00Z'),
  StartedAt: new Date('2026-11-01T08:00:00Z'),
  ...over,
});
const SchemaMismatch = (missing: string[]): NonNullable<RunDouble['RefusalObject']> => ({
  kind: 'feature-schema-mismatch', expectedHash: 'aaa', actualHash: 'bbb', missingColumns: missing, extraColumns: [], typeMismatches: [],
});

async function RenderRuns(opts: { runs: RunDouble[] }) {
  const provider = CreateFakeProvider({ runViewResults: (p) => (p.EntityName === 'MJ: ML Scoring Runs' ? opts.runs : []) });
  const f = renderComponentFixture(PSScoringRunsComponent, { inputs: { Provider: provider } });
  // inputs are set untyped (setInput), so the model double is passed as is
  f.componentRef.setInput('Model', { ID: 'M-1', ArtifactSha256: 'f'.repeat(64) });
  await f.componentInstance.Reload();
  f.detectChanges();
  return f;
}
const Text = (f: Awaited<ReturnType<typeof RenderRuns>>, testId: string): string => query(f, `[data-testid="${testId}"]`)?.textContent || '';

describe('PSScoringRunsComponent (DOM)', () => {
  it("scoring runs show a refused run's refusal and 0 written", async () => {
    const f = await RenderRuns({ runs: [Run({ Status: 'refused', RefusalObject: SchemaMismatch(['DistanceZ']), Written: 0 })] });
    expect(Text(f, 'ps-scoring-run-refusal')).toContain('DistanceZ');
    expect(Text(f, 'ps-scoring-run-counts')).toContain('0 written');
  });

  it("lists a failed run's first errors with their records", async () => {
    const f = await RenderRuns({ runs: [Run({ Status: 'failed', Failed: 2, FirstErrorsObject: [{ recordId: 'R1', message: 'no value' }, { recordId: 'R2', message: 'bad type' }] })] });
    expect(queryAll(f, '[data-testid="ps-scoring-run-error"]').map((e) => e.textContent)).toEqual(['Record R1: no value', 'Record R2: bad type']);
  });

  it('says so when the model has not scored anything', async () => {
    expect(query(await RenderRuns({ runs: [] }), '[data-testid="ps-scoring-runs-empty"]')).not.toBeNull();
  });
});

describe('a model change while its rows load (M7-3)', () => {
  it('shows the current model\'s scoring runs when an earlier model\'s read finishes last', async () => {
    const reads = new GatedReads((modelId, p) => (p.EntityName === 'MJ: ML Scoring Runs' ? (modelId === 'M-A' ? [Run({}), Run({}), Run({})] : [Run({})]) : []));
    const f = renderComponentFixture(PSScoringRunsComponent, { inputs: { Provider: reads.Provider() } });
    f.componentRef.setInput('Model', { ID: 'M-A' });
    f.detectChanges();
    f.componentRef.setInput('Model', { ID: 'M-B' });
    f.detectChanges();
    await SettleReads();
    reads.Release('M-B');
    await SettleReads();
    reads.Release('M-A');
    await SettleReads();
    f.detectChanges();
    expect(queryAll(f, '[data-testid="ps-scoring-run"]').length).toBe(1);
  });
});
