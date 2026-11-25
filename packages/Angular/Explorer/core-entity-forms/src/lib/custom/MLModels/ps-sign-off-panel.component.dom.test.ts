import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { DatePipe } from '@angular/common';
import { CreateFakeProvider, renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import type { RemoteOpResult, RunViewParams, RunViewResult } from '@memberjunction/core';
import {
  PredictiveStudioGetModelEvidenceOperation,
  PredictiveStudioPromoteModelOperation,
  PredictiveStudioSignOffModelOperation,
  type MJMLModelEntity,
  type MJMLModelPublishRecordEntity,
  type PredictiveStudioEvidenceSnapshot,
  type PredictiveStudioGetModelEvidenceInput,
  type PredictiveStudioGetModelEvidenceOutput,
  type PredictiveStudioLeakageFlagKind,
  type PredictiveStudioPromoteModelInput,
  type PredictiveStudioPromoteModelOutput,
  type PredictiveStudioSignOffModelInput,
  type PredictiveStudioSignOffModelOutput,
} from '@memberjunction/core-entities';
import { EvaluationProtocolRules, TransitionRefusalText, type EvaluationProtocolColumns, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { PSSignOffPanelComponent } from './ps-sign-off-panel.component';

try {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

const USER_ID = '99999999-0000-4000-8000-000000000001';
const PROTOCOL_ID = '33333333-4444-4555-8666-777777777777';
const DAY0 = new Date('2026-11-01T09:00:00Z');

const UNIT: PredictionUnitSpec = {
  id: '11111111-2222-4333-8444-555555555555', lineageRootId: '11111111-2222-4333-8444-555555555555', version: 1, name: 'Renewal',
  rows: { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 365, gapDays: 0, outcome: { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } }, history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
  groupKey: null, temporal: null,
  decision: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'month' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: USER_ID },
};

/** A stored protocol row whose Promotion sets the sign-off fields. */
function ProtocolRow(promotion: { requiresHumanSignOff: boolean; signOffExpiryDays: number }): EvaluationProtocolColumns {
  const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({
    Unit: UNIT, Name: 'Renewal protocol',
    Holdout: { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null },
    Candidates: 3, Seed: 42,
  });
  return EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(
    { ...draft, promotion: { ...draft.promotion, ...promotion } },
    { ID: PROTOCOL_ID, LineageRootID: PROTOCOL_ID, Version: 1, AuthoredBy: { kind: 'human', userId: USER_ID } },
  );
}

/** One stored leakage flag per kind, with fixture values. */
function FlagOf(kind: PredictiveStudioLeakageFlagKind): PredictiveStudioEvidenceSnapshot['leakageFlags'][number] {
  switch (kind) {
    case 'single-feature-auc': return { kind, sourceColumn: 'MemberSinceDays', heldOutAuc: 0.97 };
    case 'time-shifted-label': return { kind, scoreWithShiftedLabel: 0.9 };
    case 'drop-column': return { kind, sourceColumn: 'AutoRenew', scoreDrop: 0.2 };
    case 'high-cardinality-id': return { kind, sourceColumn: 'MemberID', distinctRatio: 0.99 };
  }
}

function Evidence(flags: PredictiveStudioLeakageFlagKind[]): PredictiveStudioEvidenceSnapshot {
  return {
    holdoutPrimary: { metric: 'log-loss', value: 0.4123, interval: { level: 0.95, lower: 0.39, upper: 0.43 }, n: 812 },
    comparisons: { 'best-simple': { value: 0.021, ci: [0.008, 0.034], beats: true } },
    gate: { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgboost', shippedRole: 'model', note: null },
    leakageFlags: flags.map(FlagOf),
    dataWindow: { from: '2022-01-01', to: '2024-01-01' },
    snapshotHash: 'abcdef0123456789abcdef0123456789',
  };
}

/** The refusal-record members the panel reads to find when the sign-off wait opened. */
type RefusalRecordDouble = Pick<MJMLModelPublishRecordEntity, 'ID' | 'RecordedAt' | 'RefusalObject'>;

interface SignOffScenario {
  model: { ID: string; Status: MJMLModelEntity['Status']; EvaluationProtocolID: string | null };
  protocol?: { requiresHumanSignOff: boolean; signOffExpiryDays: number };
  withheldAt?: Date;
  flags?: PredictiveStudioLeakageFlagKind[];
  promoteResult?: RemoteOpResult<PredictiveStudioPromoteModelOutput>;
  /** The protocol read fails with this message. */
  failProtocolRead?: string;
}

const validated: SignOffScenario['model'] = { ID: 'M-VAL', Status: 'Validated', EvaluationProtocolID: PROTOCOL_ID };
const held: SignOffScenario['model'] = { ID: 'M-HELD', Status: 'Validated', EvaluationProtocolID: PROTOCOL_ID };
const flagged: SignOffScenario['model'] = { ID: 'M-FLAG', Status: 'Validated', EvaluationProtocolID: PROTOCOL_ID };

/** Records the panel's Published emissions. */
const published = { values: [] as MJMLModelEntity['Status'][], Emitted(): MJMLModelEntity['Status'][] { return this.values; } };
const promoteCalls: PredictiveStudioPromoteModelInput[] = [];
const signOffCalls: PredictiveStudioSignOffModelInput[] = [];

async function Settle(f: Awaited<ReturnType<typeof RenderSignOff>>): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  f.detectChanges();
}

async function RenderSignOff(s: SignOffScenario) {
  published.values = [];
  promoteCalls.length = 0;
  signOffCalls.length = 0;
  vi.spyOn(PredictiveStudioGetModelEvidenceOperation.prototype, 'Execute').mockImplementation(async (): Promise<RemoteOpResult<PredictiveStudioGetModelEvidenceOutput>> => ({
    Success: true, ResultCode: 'SUCCESS', Output: { evidence: Evidence(s.flags ?? []), evidenceSha256: 'e'.repeat(64) },
  }));
  vi.spyOn(PredictiveStudioPromoteModelOperation.prototype, 'Execute').mockImplementation(async (input: PredictiveStudioPromoteModelInput) => {
    promoteCalls.push(input);
    return s.promoteResult ?? { Success: true, ResultCode: 'SUCCESS', Output: { applied: true, status: 'Published' } };
  });
  vi.spyOn(PredictiveStudioSignOffModelOperation.prototype, 'Execute').mockImplementation(async (input: PredictiveStudioSignOffModelInput): Promise<RemoteOpResult<PredictiveStudioSignOffModelOutput>> => {
    signOffCalls.push(input);
    return { Success: true, ResultCode: 'SUCCESS', Output: { signOffRecordId: 'SO-1', evidenceSha256: 'e'.repeat(64) } };
  });
  const protocolRow = ProtocolRow(s.protocol ?? { requiresHumanSignOff: false, signOffExpiryDays: 30 });
  const refusals: RefusalRecordDouble[] = s.withheldAt ? [{ ID: 'R-1', RecordedAt: s.withheldAt, RefusalObject: { kind: 'no-sign-off' } }] : [];
  const rowsOf = (p: RunViewParams): (EvaluationProtocolColumns | RefusalRecordDouble)[] =>
    p.EntityName === 'MJ: ML Evaluation Protocols' ? [protocolRow] : p.EntityName === 'MJ: ML Model Publish Records' ? refusals : [];
  const provider = CreateFakeProvider<EvaluationProtocolColumns | RefusalRecordDouble>({ runViewResults: rowsOf });
  const failure = s.failProtocolRead;
  if (failure !== undefined) {
    const read = (p: RunViewParams): RunViewResult => p.EntityName === 'MJ: ML Evaluation Protocols'
      ? { Success: false, ErrorMessage: failure, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0 }
      : { Success: true, ErrorMessage: '', Results: rowsOf(p), RowCount: rowsOf(p).length, TotalRowCount: rowsOf(p).length, ExecutionTime: 0 };
    Object.assign(provider, { RunViews: async (all: RunViewParams[]): Promise<RunViewResult[]> => all.map(read) });
  }
  const f = renderComponentFixture(PSSignOffPanelComponent, { inputs: { Provider: provider } });
  f.componentInstance.Published.subscribe((st) => published.values.push(st));
  // inputs are set untyped (setInput), so the model double is passed as is
  f.componentRef.setInput('Model', s.model);
  await f.componentInstance.Reload();
  f.detectChanges();
  return f;
}

type Fixture = Awaited<ReturnType<typeof RenderSignOff>>;
const Text = (f: Fixture, testId: string): string => query(f, `[data-testid="${testId}"]`)?.textContent || '';
const Button = (f: Fixture, testId: string): HTMLButtonElement => query(f, `[data-testid="${testId}"]`) as HTMLButtonElement;
const Click = (f: Fixture, testId: string): void => {
  Button(f, testId).click();
  f.detectChanges();
};
const Check = (f: Fixture, testId: string): void => {
  (query(f, `[data-testid="${testId}"]`) as HTMLInputElement).dispatchEvent(new Event('change'));
  f.detectChanges();
};
const Type = async (f: Fixture, testId: string, text: string): Promise<void> => {
  const area = query(f, `[data-testid="${testId}"]`) as HTMLTextAreaElement;
  area.value = text;
  area.dispatchEvent(new Event('input'));
  await Settle(f);
};
/** Presses MJConfirmDialogComponent's confirm button (the leftmost action). */
async function ConfirmDialog(f: Fixture): Promise<void> {
  (query(f, 'mj-confirm-dialog mj-dialog-actions button') as HTMLButtonElement).click();
  await Settle(f);
}
const FormatDate = (d: Date): string => new DatePipe('en-US').transform(d, 'mediumDate') || '';
const AddDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000);

describe('PSSignOffPanelComponent (DOM)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a failed protocol read shows the load error, never a panel without the sign-off policy', async () => {
    const f = await RenderSignOff({ model: held, failProtocolRead: 'the protocol read was refused' });
    expect(Text(f, 'ps-sign-off-load-error')).toContain('the protocol read was refused');
  });

  it('a model held by requiresHumanSignOff shows the closing date and asks for a sign-off before Publish', async () => {
    const f = await RenderSignOff({ model: held, protocol: { requiresHumanSignOff: true, signOffExpiryDays: 30 }, withheldAt: DAY0 });
    expect(Text(f, 'ps-sign-off-required')).toContain(FormatDate(AddDays(DAY0, 30)));
    expect(Button(f, 'ps-sign-off-publish').disabled).toBe(true);
  });

  it('an override without a reason cannot be approved', async () => {
    const f = await RenderSignOff({ model: flagged, flags: ['single-feature-auc'] });
    Check(f, 'ps-override-single-feature-auc');
    expect(Button(f, 'ps-sign-off-approve').disabled).toBe(true);
  });

  it('a rejection needs a reason (M7.8: the reason requirement): Reject stays disabled until one is typed', async () => {
    const f = await RenderSignOff({ model: held, protocol: { requiresHumanSignOff: true, signOffExpiryDays: 30 }, withheldAt: DAY0 });
    expect(Button(f, 'ps-sign-off-reject').disabled).toBe(true);
    await Type(f, 'ps-sign-off-reason', 'the holdout window misses the renewal season');
    expect(Button(f, 'ps-sign-off-reject').disabled).toBe(false);
  });

  it('an approval with a reason records the overrides and then the publish consumes the sign-off', async () => {
    const f = await RenderSignOff({ model: flagged, flags: ['single-feature-auc'] });
    Check(f, 'ps-override-single-feature-auc');
    await Type(f, 'ps-sign-off-reason', 'the feature is known at decision time');
    Click(f, 'ps-sign-off-approve');
    await ConfirmDialog(f);
    expect(signOffCalls).toEqual([{ modelId: flagged.ID, purpose: 'publish', decision: 'approve', reason: 'the feature is known at decision time', overridesFlags: ['single-feature-auc'] }]);
    Click(f, 'ps-sign-off-publish');
    await ConfirmDialog(f);
    expect([promoteCalls[0]?.signOffId, published.Emitted()]).toEqual(['SO-1', ['Published']]);
  });

  it('renders every number from the evidence JSON', async () => {
    const f = await RenderSignOff({ model: validated });
    expect(Text(f, 'ps-evidence-primary')).toContain('0.412');
    expect(Text(f, 'ps-evidence-comparison')).toContain('0.021 [0.008, 0.034]');
  });

  it('a user without update permission sees actor-not-permitted and no publish', async () => {
    const f = await RenderSignOff({ model: validated, promoteResult: { Success: true, ResultCode: 'SUCCESS', Output: { applied: false, status: 'Validated', refusal: { kind: 'actor-not-permitted', actor: 'human' } } } });
    Click(f, 'ps-sign-off-publish');
    await ConfirmDialog(f);
    expect(Text(f, 'ps-sign-off-refusal')).toContain(TransitionRefusalText.For({ kind: 'actor-not-permitted', actor: 'human' }));
    expect(published.Emitted()).toHaveLength(0);
  });

  it('a failed operation shows its error message and emits nothing', async () => {
    const f = await RenderSignOff({ model: validated, promoteResult: { Success: false, ResultCode: 'FAILED', ErrorMessage: 'the server is unreachable' } });
    Click(f, 'ps-sign-off-publish');
    await ConfirmDialog(f);
    expect([Text(f, 'ps-sign-off-refusal'), published.Emitted()]).toEqual([expect.stringContaining('the server is unreachable'), []]);
  });
});

describe('a model change while the evidence loads (M7-3)', () => {
  it('shows the current model\'s evidence when an earlier model\'s read finishes last', async () => {
    const f = await RenderSignOff({ model: validated });
    const pending = new Map<string, (flags: PredictiveStudioLeakageFlagKind[]) => void>();
    vi.spyOn(PredictiveStudioGetModelEvidenceOperation.prototype, 'Execute').mockImplementation((input: PredictiveStudioGetModelEvidenceInput) =>
      new Promise<RemoteOpResult<PredictiveStudioGetModelEvidenceOutput>>((resolve) => {
        pending.set(input.modelId, (flags) => resolve({ Success: true, ResultCode: 'SUCCESS', Output: { evidence: Evidence(flags), evidenceSha256: 'e'.repeat(64) } }));
      }));
    const answer = (modelId: string, flags: PredictiveStudioLeakageFlagKind[]): void => {
      const resolve = pending.get(modelId);
      if (!resolve) throw new Error(`no evidence read of ${modelId} is pending`);
      resolve(flags);
    };
    f.componentRef.setInput('Model', flagged);
    f.detectChanges();
    f.componentRef.setInput('Model', held);
    f.detectChanges();
    await Settle(f);
    answer(held.ID, []);
    await Settle(f);
    answer(flagged.ID, ['single-feature-auc']);
    await Settle(f);
    expect([query(f, '[data-testid="ps-override-single-feature-auc"]'), query(f, '[data-testid="ps-sign-off-approve"]')]).toEqual([null, null]);
    expect(Text(f, 'ps-evidence-primary')).toContain('0.412');
  });
});
