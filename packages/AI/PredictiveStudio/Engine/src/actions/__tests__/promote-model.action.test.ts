import { describe, it, expect } from 'vitest';
import type { RunActionParams, ActionParam, ActionResultSimple } from '@memberjunction/actions-base';
import type { UserInfo } from '@memberjunction/core';
import type { Actor, PairedComparison, TransitionRefusal } from '@memberjunction/predictive-studio-core';

import { PredictiveStudioPromoteModelAction } from '../promote-model.action';
import { LifecycleGate } from '../../registry/lifecycle-gate';
import type { EvaluateOutcome, EvaluateSubject, GateApplyResult, GateContext, PublishOutcome, PublishRequest } from '../../registry/gate-context';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';

/**
 * Unit tests for the Promote ML Model action over the lifecycle gate. NO live DB: the gate is a `LifecycleGate` fake
 * injected through `CreateLifecycleGate`. Covered: param validation (`ModelID`, `Transition`, before any gate call), the
 * transition → gate method mapping with `Reason`, and every gate outcome → result code. The gate's own refusals are
 * pinned by `registry/__tests__/lifecycle-gate.test.ts`.
 */

const M = '6F1C2B3A-0000-4000-8000-0000000000A1';
const OLD = '6F1C2B3A-0000-4000-8000-0000000000A0';
const comparison: PairedComparison = { value: -0.01, ci: [-0.03, 0.01], beats: false };
const USER = { ID: '6F1C2B3A-0000-4000-8000-0000000000F1', Email: 'test@example.com' } as UserInfo;

/** One gate call the fake saw: the method, the model, and the purpose (Publish) or reason (Archive). */
type GateCall = readonly [method: 'Evaluate' | 'Publish' | 'Archive', modelId: string, detail?: string | null];

/** A gate fake that records every call and applies it, or refuses it with `refusal`, or throws from Publish. */
class FakeGate extends LifecycleGate {
  public readonly Calls: GateCall[] = [];
  constructor(private readonly refusal: TransitionRefusal | null, private readonly publishThrows: string | null = null) {
    super();
  }
  public override async Evaluate(subject: EvaluateSubject, _actor: Actor, _ctx: GateContext): Promise<EvaluateOutcome> {
    const modelId = 'modelId' in subject ? subject.modelId : subject.trainingRunId;
    this.Calls.push(['Evaluate', modelId]);
    return this.refusal === null ? { Kind: 'evaluated', ModelID: modelId, From: 'Draft', To: 'Validated' } : { Kind: 'refused', Refusal: this.refusal };
  }
  public override async Publish(request: PublishRequest, _ctx: GateContext): Promise<PublishOutcome> {
    this.Calls.push(['Publish', request.modelId, request.purpose]);
    if (this.publishThrows !== null) throw new Error(this.publishThrows);
    if (this.refusal === null) return { Kind: 'published', ModelID: request.modelId, PublishRecordID: 'R1', Replaces: null, Approver: 'user' };
    return { Kind: 'withheld', ModelID: request.modelId, Status: 'Validated', Refusal: this.refusal, Transient: false, RefusalRecordID: 'R2' };
  }
  public override async Archive(modelId: string, reason: string, _actor: Actor, _ctx: GateContext): Promise<GateApplyResult> {
    this.Calls.push(['Archive', modelId, reason]);
    return this.refusal === null ? { Ok: true, ModelID: modelId, From: 'Validated', To: 'Archived', Archived: null } : { Ok: false, Refusal: this.refusal };
  }
}

/** A gate that applies every call. */
const RecordingGate = (): FakeGate => new FakeGate(null);
/** A gate that refuses every call with `refusal`. */
const RefusingGate = (refusal: TransitionRefusal): FakeGate => new FakeGate(refusal);
/** A gate whose Publish throws `message` (a lock timeout, a lost connection). */
const ThrowingGate = (message: string): FakeGate => new FakeGate(null, message);

class TestablePromoteAction extends PredictiveStudioPromoteModelAction {
  constructor(private readonly gate: LifecycleGate) {
    super();
  }
  protected override CreateLifecycleGate(): LifecycleGate {
    return this.gate;
  }
  public run(params: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(params);
  }
}

function params(list: ActionParam[]): RunActionParams {
  return { Params: list, ContextUser: USER } as RunActionParams;
}
function out(p: RunActionParams, name: string): ActionParam['Value'] {
  return p.Params.find((x) => x.Name === name)?.Value;
}

describe('PredictiveStudioPromoteModelAction — validation', () => {
  it('fails when ModelID is missing, and never calls the gate', async () => {
    const gate = RecordingGate();
    const result = await new TestablePromoteAction(gate).run(params([{ Name: 'Transition', Type: 'Input', Value: 'publish' }]));
    expect([result.Success, result.ResultCode, gate.Calls.length]).toEqual([false, 'VALIDATION_ERROR', 0]);
  });

  it('refuses a missing or unknown Transition with VALIDATION_ERROR and never calls the gate', async () => {
    for (const value of [undefined, 'Published']) {
      const gate = RecordingGate();
      const r = await new TestablePromoteAction(gate).run(params([{ Name: 'ModelID', Type: 'Input', Value: M }, ...(value ? [{ Name: 'Transition', Type: 'Input' as const, Value: value }] : [])]));
      expect([r.ResultCode, gate.Calls.length]).toEqual(['VALIDATION_ERROR', 0]);
    }
  });

  it('refuses a run with no context user (the initiator) before any gate call', async () => {
    const gate = RecordingGate();
    const r = await new TestablePromoteAction(gate).run({ Params: [{ Name: 'ModelID', Type: 'Input', Value: M }, { Name: 'Transition', Type: 'Input', Value: 'publish' }] } as RunActionParams);
    expect([r.ResultCode, gate.Calls.length]).toEqual(['VALIDATION_ERROR', 0]);
  });
});

describe('PredictiveStudioPromoteModelAction — the gate call and its result codes', () => {
  it('passes Transition and Reason to the gate and maps an applied outcome to SUCCESS with the Status output', async () => {
    const gate = RecordingGate();
    const p = params([{ Name: 'ModelID', Type: 'Input', Value: M }, { Name: 'Transition', Type: 'Input', Value: 'archive' }, { Name: 'Reason', Type: 'Input', Value: 'superseded' }]);
    const r = await new TestablePromoteAction(gate).run(p);
    expect([r.ResultCode, gate.Calls]).toEqual(['SUCCESS', [['Archive', M, 'superseded']]]);
    expect(out(p, 'Status')).toBe('Archived');
  });

  it('maps evaluate to Evaluate, publish to Publish (purpose publish) and rollback to Publish (purpose rollback)', async () => {
    const gate = RecordingGate();
    const action = new TestablePromoteAction(gate);
    for (const transition of ['evaluate', 'publish', 'rollback']) {
      const p = params([{ Name: 'ModelID', Type: 'Input', Value: M }, { Name: 'Transition', Type: 'Input', Value: transition }, { Name: 'Reason', Type: 'Input', Value: 'restore' }]);
      expect((await action.run(p)).ResultCode).toBe('SUCCESS');
    }
    expect(gate.Calls).toEqual([['Evaluate', M], ['Publish', M, 'publish'], ['Publish', M, 'rollback']]);
  });

  it.each<[TransitionRefusal, string]>([
    [{ kind: 'unacknowledged-leakage-flags', flags: ['single-feature-auc'] }, 'LEAKAGE_FLAGGED'],
    [{ kind: 'illegal-transition', from: 'draft', to: 'published' }, 'ILLEGAL_TRANSITION'],
    [{ kind: 'reason-required' }, 'REASON_REQUIRED'],
    [{ kind: 'does-not-beat-incumbent', incumbentModelId: OLD, comparison }, 'TRANSITION_REFUSED'],
    [{ kind: 'model-not-found', modelId: M }, 'MODEL_NOT_FOUND'],
    [{ kind: 'calibration-held', slope: 1.6 }, 'CALIBRATION_HOLD'],
    [{ kind: 'not-servable', reason: 'forecast' }, 'MODEL_NOT_SERVABLE'],
  ])('maps the refusal %o to %s', async (refusal, code) => {
    const r = await new TestablePromoteAction(RefusingGate(refusal)).run(params([{ Name: 'ModelID', Type: 'Input', Value: M }, { Name: 'Transition', Type: 'Input', Value: 'publish' }]));
    expect([r.Success, r.ResultCode]).toEqual([false, code]);
  });

  it('names the refusal kind and says what it means in the message of a TRANSITION_REFUSED', async () => {
    const r = await new TestablePromoteAction(RefusingGate({ kind: 'publish-in-progress' })).run(params([{ Name: 'ModelID', Type: 'Input', Value: M }, { Name: 'Transition', Type: 'Input', Value: 'publish' }]));
    expect([r.ResultCode, r.Message]).toEqual(['TRANSITION_REFUSED', expect.stringContaining('publish-in-progress')]);
    expect(r.Message).toContain('Another publish of this pipeline or model holds its lock');
  });

  it('maps a gate that throws to PROMOTION_FAILED with the error text', async () => {
    const errors = ConsoleCapture.Errors();
    const r = await new TestablePromoteAction(ThrowingGate('lock timeout')).run(params([{ Name: 'ModelID', Type: 'Input', Value: M }, { Name: 'Transition', Type: 'Input', Value: 'publish' }]));
    expect([r.Success, r.ResultCode, r.Message]).toEqual([false, 'PROMOTION_FAILED', expect.stringContaining('lock timeout')]);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining('lock timeout')]);
  });
});
