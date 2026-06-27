import { describe, it, expect } from 'vitest';
import type { RunActionParams, ActionParam, ActionResultSimple } from '@memberjunction/actions-base';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';

import { PredictiveStudioPromoteModelAction } from '../promote-model.action';
import type {
  IModelPromotionGate,
  PromoteModelRequest,
  PromoteModelOutcome,
} from '../promote-model.action';
import { ProductionModelPromotionGate } from '../promote-model.gate';

/**
 * Unit tests for the Promote ML Model action + its leakage sign-off gate. NO live
 * DB. Two layers are covered:
 *
 * 1. The ACTION (with a mock gate): param validation (ModelID + TargetStatus),
 *    correctly-mapped delegation, and outcome→result mapping — including the
 *    leakage-refusal mapping.
 * 2. The GATE itself (with its `loadModel` / `resolveThreshold` seams overridden):
 *    the real sign-off enforcement — refuses a leakage-flagged model without
 *    sign-off, allows it WITH sign-off, and transitions lifecycle-only.
 */

// ---------------------------------------------------------------------------
// Layer 1 — the action, with a captured-call mock gate.
// ---------------------------------------------------------------------------

class MockGate implements IModelPromotionGate {
  public LastRequest: PromoteModelRequest | null = null;
  public CallCount = 0;
  constructor(private readonly outcome: PromoteModelOutcome) {}
  public async promote(request: PromoteModelRequest): Promise<PromoteModelOutcome> {
    this.CallCount++;
    this.LastRequest = request;
    return this.outcome;
  }
}

class TestablePromoteAction extends PredictiveStudioPromoteModelAction {
  constructor(private readonly gate: IModelPromotionGate) {
    super();
  }
  protected override createGate(): IModelPromotionGate {
    return this.gate;
  }
  public run(params: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(params);
  }
}

function params(list: ActionParam[]): RunActionParams {
  return { Params: list } as RunActionParams;
}
function out(p: RunActionParams, name: string): unknown {
  return p.Params.find((x) => x.Name === name)?.Value;
}

describe('PredictiveStudioPromoteModelAction — validation', () => {
  it('fails when ModelID is missing', async () => {
    const gate = new MockGate({ kind: 'promoted', newStatus: 'Published' });
    const result = await new TestablePromoteAction(gate).run(
      params([{ Name: 'TargetStatus', Type: 'Input', Value: 'Published' }]),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(gate.CallCount).toBe(0);
  });

  it('fails when TargetStatus is missing or invalid', async () => {
    const gate = new MockGate({ kind: 'promoted', newStatus: 'Published' });
    const action = new TestablePromoteAction(gate);
    const missing = await action.run(params([{ Name: 'ModelID', Type: 'Input', Value: 'm1' }]));
    expect(missing.ResultCode).toBe('VALIDATION_ERROR');
    const invalid = await action.run(
      params([
        { Name: 'ModelID', Type: 'Input', Value: 'm1' },
        { Name: 'TargetStatus', Type: 'Input', Value: 'Draft' }, // Draft is not a promotable target
      ]),
    );
    expect(invalid.ResultCode).toBe('VALIDATION_ERROR');
    expect(gate.CallCount).toBe(0);
  });
});

describe('PredictiveStudioPromoteModelAction — outcome mapping', () => {
  it('maps a promoted outcome to SUCCESS + Status output and threads sign-off through', async () => {
    const gate = new MockGate({ kind: 'promoted', newStatus: 'Validated' });
    const p = params([
      { Name: 'ModelID', Type: 'Input', Value: 'model-1' },
      { Name: 'TargetStatus', Type: 'Input', Value: 'validated' }, // case-insensitive
      { Name: 'SignOff', Type: 'Input', Value: true },
    ]);
    const result = await new TestablePromoteAction(gate).run(p);

    expect(gate.LastRequest).toMatchObject({ modelId: 'model-1', targetStatus: 'Validated', signOff: true });
    expect(result.Success).toBe(true);
    expect(out(p, 'Status')).toBe('Validated');
  });

  it('maps a leakage refusal to LEAKAGE_SIGNOFF_REQUIRED with a clear message', async () => {
    const gate = new MockGate({ kind: 'refused-leakage', topFeature: 'cancelled_flag', topShare: 0.92 });
    const p = params([
      { Name: 'ModelID', Type: 'Input', Value: 'model-1' },
      { Name: 'TargetStatus', Type: 'Input', Value: 'Published' },
    ]);
    const result = await new TestablePromoteAction(gate).run(p);

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('LEAKAGE_SIGNOFF_REQUIRED');
    expect(result.Message).toContain('cancelled_flag');
    expect(result.Message).toContain('SignOff=true');
    expect(out(p, 'Status')).toBeUndefined();
  });

  it('maps not-found and save-failed outcomes', async () => {
    const notFound = await new TestablePromoteAction(new MockGate({ kind: 'not-found' })).run(
      params([
        { Name: 'ModelID', Type: 'Input', Value: 'missing' },
        { Name: 'TargetStatus', Type: 'Input', Value: 'Archived' },
      ]),
    );
    expect(notFound.ResultCode).toBe('MODEL_NOT_FOUND');

    const saveFailed = await new TestablePromoteAction(new MockGate({ kind: 'save-failed', message: 'FK violation' })).run(
      params([
        { Name: 'ModelID', Type: 'Input', Value: 'm1' },
        { Name: 'TargetStatus', Type: 'Input', Value: 'Archived' },
      ]),
    );
    expect(saveFailed.ResultCode).toBe('SAVE_FAILED');
    expect(saveFailed.Message).toContain('FK violation');
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — the REAL gate, with its load + threshold seams overridden so the
// sign-off enforcement logic is exercised with no DB.
// ---------------------------------------------------------------------------

/** A field-bag model fake exposing exactly what the gate touches. */
class FakeModel {
  public ID = 'model-1';
  public PipelineID: string | null = 'pipe-1';
  public FeatureImportance: string | null = null;
  public Status: 'Archived' | 'Draft' | 'Published' | 'Validated' = 'Draft';
  public LatestResult: { CompleteMessage: string } | null = null;
  public SaveCallCount = 0;
  private saveOk: boolean;
  constructor(featureImportance: Record<string, number>, saveOk = true) {
    this.FeatureImportance = JSON.stringify(featureImportance);
    this.saveOk = saveOk;
  }
  public async Save(): Promise<boolean> {
    this.SaveCallCount++;
    if (!this.saveOk) {
      this.LatestResult = { CompleteMessage: 'save blew up' };
      return false;
    }
    this.LatestResult = { CompleteMessage: '' };
    return true;
  }
}

/** Real gate with load/threshold overridden; threshold fixed at 0.6. */
class TestableGate extends ProductionModelPromotionGate {
  constructor(private readonly model: FakeModel | null, private readonly threshold = 0.6) {
    super();
  }
  protected override async loadModel(): Promise<MJMLModelEntity | null> {
    return this.model as unknown as MJMLModelEntity | null;
  }
  protected override async resolveThreshold(): Promise<number> {
    return this.threshold;
  }
}

function req(over: Partial<PromoteModelRequest> = {}): PromoteModelRequest {
  return {
    modelId: 'model-1',
    targetStatus: 'Published',
    signOff: false,
    contextUser: undefined as unknown as UserInfo,
    provider: undefined as unknown as IMetadataProvider,
    ...over,
  };
}

describe('ProductionModelPromotionGate — leakage sign-off gate', () => {
  it('refuses a leakage-flagged model when SignOff is false', async () => {
    // cancelled_flag dominates (>0.6 share) → flagged.
    const model = new FakeModel({ cancelled_flag: 0.92, tenure: 0.05, city: 0.03 });
    const outcome = await new TestableGate(model).promote(req({ signOff: false }));

    expect(outcome.kind).toBe('refused-leakage');
    if (outcome.kind === 'refused-leakage') {
      expect(outcome.topFeature).toBe('cancelled_flag');
    }
    // Never transitioned — the model was not saved.
    expect(model.SaveCallCount).toBe(0);
    expect(model.Status).toBe('Draft');
  });

  it('allows a leakage-flagged model when SignOff is true — lifecycle only', async () => {
    const model = new FakeModel({ cancelled_flag: 0.92, tenure: 0.05, city: 0.03 });
    const outcome = await new TestableGate(model).promote(req({ signOff: true, targetStatus: 'Validated' }));

    expect(outcome.kind).toBe('promoted');
    if (outcome.kind === 'promoted') {
      expect(outcome.newStatus).toBe('Validated');
    }
    expect(model.Status).toBe('Validated'); // only Status changed
    expect(model.SaveCallCount).toBe(1);
  });

  it('promotes a clean (non-flagged) model without requiring sign-off', async () => {
    // Balanced importances → not dominant.
    const model = new FakeModel({ tenure: 0.3, events: 0.25, city: 0.25, recency: 0.2 });
    const outcome = await new TestableGate(model).promote(req({ signOff: false, targetStatus: 'Published' }));

    expect(outcome.kind).toBe('promoted');
    expect(model.Status).toBe('Published');
  });

  it('returns not-found when the model does not load', async () => {
    const outcome = await new TestableGate(null).promote(req());
    expect(outcome.kind).toBe('not-found');
  });

  it('returns save-failed and surfaces the CompleteMessage', async () => {
    const model = new FakeModel({ tenure: 0.5, city: 0.5 }, false);
    const outcome = await new TestableGate(model).promote(req({ signOff: false, targetStatus: 'Archived' }));
    expect(outcome.kind).toBe('save-failed');
    if (outcome.kind === 'save-failed') {
      expect(outcome.message).toContain('save blew up');
    }
  });
});
