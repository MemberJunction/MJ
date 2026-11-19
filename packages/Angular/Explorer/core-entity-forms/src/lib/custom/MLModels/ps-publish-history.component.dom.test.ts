import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { CreateFakeProvider, renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { MJMLModelEntity, MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';
import { TransitionRefusalText } from '@memberjunction/predictive-studio-core';
import { PSPublishHistoryComponent } from './ps-publish-history.component';
import type { PSOpenRecordRequest } from './ps-model-detail-events';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/** The record members the history reads. */
type RecordDouble = Pick<
  MJMLModelPublishRecordEntity,
  'ID' | 'Kind' | 'Purpose' | 'ApproverKind' | 'User' | 'InitiatorObject' | 'RecordedAt' | 'GateDecisionObject' | 'EvidenceSha256' | 'RefusalObject' | 'Transient' | 'Reason' | 'Decision'
>;

const MODEL = { ID: 'M-1' };
const AUTO_TRAIN_RUN = { ID: 'B7A1C2D3-0000-4000-8000-0000000000F1' };

const Base = (over: Partial<RecordDouble>): RecordDouble => ({
  ID: 'R-' + Math.random().toString(16).slice(2),
  Kind: 'publish',
  Purpose: 'publish',
  ApproverKind: 'automated-gate',
  User: null,
  InitiatorObject: { kind: 'human', userId: 'U-1' },
  RecordedAt: new Date('2026-11-01T10:00:00Z'),
  GateDecisionObject: null,
  EvidenceSha256: null,
  RefusalObject: null,
  Transient: false,
  Reason: null,
  Decision: null,
  ...over,
});
const Publish = (over: Partial<RecordDouble>): RecordDouble => Base({ Kind: 'publish', ...over });
const Refusal = (over: Partial<RecordDouble>): RecordDouble => Base({ Kind: 'refusal', ...over });
const AutoTrain = (run: { ID: string }): RecordDouble['InitiatorObject'] => ({ kind: 'system', component: 'auto-train', processRunId: run.ID });
const GateNoSignal = (): NonNullable<RecordDouble['RefusalObject']> => ({ kind: 'gate-no-signal', reason: 'no candidate beat the flat guess' });

/** Renders the history over `records`, served by a fake provider for `MJ: ML Model Publish Records`. */
async function RenderHistory(opts: { records: RecordDouble[] }) {
  const provider = CreateFakeProvider({ runViewResults: (p) => (p.EntityName === 'MJ: ML Model Publish Records' ? opts.records : []) });
  const f = renderComponentFixture(PSPublishHistoryComponent, { inputs: { Provider: provider } });
  f.componentInstance.Model = MODEL as unknown as MJMLModelEntity;
  await f.componentInstance.Reload();
  f.detectChanges();
  return f;
}
const Rows = (f: Awaited<ReturnType<typeof RenderHistory>>, testId: string) => queryAll(f, `[data-testid="${testId}"]`);
const Link = (f: Awaited<ReturnType<typeof RenderHistory>>, testId: string, i: number): string => queryAll(f, `[data-testid="${testId}"]`)[i]?.getAttribute('data-record-id') || '';

describe('PSPublishHistoryComponent (DOM)', () => {
  it('publish history shows an automatic publish and a withheld one with their initiators', async () => {
    const f = await RenderHistory({ records: [Publish({ ApproverKind: 'automated-gate', InitiatorObject: AutoTrain(AUTO_TRAIN_RUN) }), Refusal({ RefusalObject: GateNoSignal(), Transient: false })] });
    expect(Rows(f, 'ps-publish-history-row').map((r) => r.textContent)).toEqual([expect.stringContaining('automated gate'), expect.stringContaining('withheld')]);
    expect(Link(f, 'ps-publish-initiator', 0)).toContain(AUTO_TRAIN_RUN.ID);
  });

  it("shows a refusal in plain words and whether it was transient", async () => {
    const f = await RenderHistory({ records: [Refusal({ RefusalObject: { kind: 'publish-in-progress' }, Transient: true })] });
    expect(query(f, '[data-testid="ps-publish-refusal"]')?.textContent).toContain(TransitionRefusalText.For({ kind: 'publish-in-progress' }));
    expect(query(f, '[data-testid="ps-publish-refusal"]')?.textContent).toContain('transient');
  });

  it('names the person who approved a publish', async () => {
    const f = await RenderHistory({ records: [Publish({ ApproverKind: 'user', User: 'Ada Lovelace' })] });
    expect(Rows(f, 'ps-publish-history-row')[0]?.textContent).toContain('Ada Lovelace');
  });

  it('a link click asks the host to open the initiator record, never routes', async () => {
    const f = await RenderHistory({ records: [Publish({ InitiatorObject: { kind: 'agent', agentRunId: 'AR-1' } })] });
    const asked: PSOpenRecordRequest[] = [];
    f.componentInstance.OpenRecord.subscribe((r) => asked.push(r));
    (query(f, '[data-testid="ps-publish-initiator"]') as HTMLButtonElement).click();
    expect(asked).toEqual([{ EntityName: 'MJ: AI Agent Runs', RecordID: 'AR-1' }]);
  });

  it('says so when nothing has been recorded', async () => {
    expect(query(await RenderHistory({ records: [] }), '[data-testid="ps-publish-history-empty"]')).not.toBeNull();
  });
});
