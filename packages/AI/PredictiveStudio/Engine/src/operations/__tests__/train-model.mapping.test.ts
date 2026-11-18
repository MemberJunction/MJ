import { describe, it, expect } from 'vitest';
import { TRAINING_RUN_RESULTS_SCHEMA, type StoredGateRecord, type TrainingRunResults } from '@memberjunction/predictive-studio-core';

import { TrainModelMapping, type TrainRunFacts } from '../train-model.mapping';
import { TrainingRefusedError } from '../../training/training-refusal';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';
import { ProtocolRowFixture } from '../../training/__tests__/fixtures/protocol-row';
import { FakeEvaluationProtocolStore, TrainingHarness } from '../../__tests__/fakes/training-fakes';

const RUN_ID = '00000000-0000-0000-0000-0000000000a1';
const PROTOCOL = ProtocolRowFixture.Spec();
const envelopeOf = TrainerResultFixtures.ValidationResultsFor;
const gateRecordOf = TrainerResultFixtures.GateRecordFor;
const resultOf = TrainingHarness.ResultOf;

function facts(over: Partial<TrainRunFacts>): TrainRunFacts {
  return {
    Model: null, LeakageFlagged: false,
    RunID: 'run-1', TrainingSnapshotID: 'snap-1', EvaluationProtocolID: 'proto-1', EvaluationProtocolVersion: 2,
    ValidationResults: envelopeOf(TrainerResultFixtures.CannedNoSignal(RUN_ID, PROTOCOL)),
    ...over,
  };
}

describe('TrainModel mapping — retired inputs', () => {
  it('names every retired input present in one message, in the declared order', () => {
    expect(TrainModelMapping.RetiredInputsMessage('TrainModel', ['asOf', 'maxRows'])).toBe(
      'TrainModel no longer accepts asOf, maxRows: the Prediction Unit declares the decision date and the row key, and every eligible row is read. Remove them from the call.',
    );
  });

  it('finds a retired key by presence, even when its value asks for nothing', () => {
    expect(TrainModelMapping.PresentRetiredInputs({ pipelineId: 'p1', maxRows: 1000, asOf: { Mode: 'none' } })).toEqual(['asOf', 'maxRows']);
    expect(TrainModelMapping.PresentRetiredInputs({ pipelineId: 'p1', primaryKeyField: undefined })).toEqual(['primaryKeyField']);
    expect(TrainModelMapping.PresentRetiredInputs({ pipelineId: 'p1', labelEventDates: {} })).toEqual(['labelEventDates']);
    expect(TrainModelMapping.PresentRetiredInputs({ pipelineId: 'p1', sidecarVersion: 'x' })).toEqual([]);
  });

  it('refuses the first present key as input-not-accepted, with the message naming them all; null when clean', () => {
    const refusal = TrainModelMapping.RetiredInputRefusal('TrainModel', ['maxRows', 'primaryKeyField']);
    expect(refusal).toBeInstanceOf(TrainingRefusedError);
    expect(refusal?.Refusal).toEqual({
      stage: 'pipeline',
      reason: { kind: 'input-not-accepted', input: 'maxRows', why: TrainModelMapping.RetiredInputsMessage('TrainModel', ['maxRows', 'primaryKeyField']) },
    });
    expect(TrainModelMapping.RetiredInputRefusal('TrainModel', [])).toBeNull();
  });
});

describe('TrainModel mapping — output from the run facts', () => {
  it('no-signal: NoSignal, no model fields, the trainer holdout as the scores, the stored decision, snapshot and protocol', () => {
    const out = TrainModelMapping.TrainModelOutputFrom(facts({}));
    expect(out).toEqual({
      trainingRunId: 'run-1', status: 'NoSignal', leakageFlagged: false,
      holdoutMetrics: JSON.stringify({ 'log-loss': 0.452, auc: 0.67, brier: 0.15 }),
      trainingSnapshotId: 'snap-1', evaluationProtocolId: 'proto-1', evaluationProtocolVersion: 2,
      gateOutcome: 'no-signal', gateBranch: 'c:no-signal', gateReason: TrainerResultFixtures.NoSignalReason,
    });
    expect('modelId' in out || 'version' in out || 'shipped' in out).toBe(false);
  });

  it('a shipped member: the model row status, version and stored scores (not the finalist holdout), and the shipped member', () => {
    const shipped = TrainerResultFixtures.CannedCompleted(RUN_ID, PROTOCOL);
    const out = TrainModelMapping.TrainModelOutputFrom(facts({
      Model: { ID: 'model-1', Version: 3, Status: 'Draft', HoldoutMetrics: JSON.stringify({ 'log-loss': 0.455 }) }, LeakageFlagged: true,
      ValidationResults: envelopeOf(shipped),
    }));
    expect(out).toEqual({
      modelId: 'model-1', version: 3, trainingRunId: 'run-1', status: 'Draft', leakageFlagged: true,
      holdoutMetrics: JSON.stringify({ 'log-loss': 0.455 }),
      trainingSnapshotId: 'snap-1', evaluationProtocolId: 'proto-1', evaluationProtocolVersion: 2,
      gateOutcome: 'keep-simple-baseline', gateBranch: 'b:keep-simple-baseline', gateReason: gateRecordOf(shipped).reason.text, shipped: 'glm',
    });
  });

  it('a kept existing rule (no model row): KeptExistingRule, with the rule as the shipped member', () => {
    const base = TrainerResultFixtures.CannedCompleted(RUN_ID, PROTOCOL);
    const record = gateRecordOf(base);
    const kept: StoredGateRecord = {
      ...record,
      decision: { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'heuristic:renewal-rule', shippedRole: 'simpleBaseline', note: null },
      reason: { code: 'heuristic-carries-signal', text: 'The existing rule "renewal-rule" beats the flat guess: keep the rule.' },
    };
    const out = TrainModelMapping.TrainModelOutputFrom(facts({ ValidationResults: envelopeOf(base, { Gate: kept }) }));
    expect([out.status, out.modelId, out.shipped, out.gateReason]).toEqual(['KeptExistingRule', undefined, 'heuristic:renewal-rule', kept.reason.text]);
  });

  it('a model row whose stored scores are empty falls back to nothing, never to another member', () => {
    const out = TrainModelMapping.TrainModelOutputFrom(facts({ Model: { ID: 'm', Version: 1, Status: 'Draft', HoldoutMetrics: '' }, ValidationResults: envelopeOf(TrainerResultFixtures.CannedCompleted(RUN_ID, PROTOCOL)) }));
    expect('holdoutMetrics' in out).toBe(false);
  });

  it('fails closed on an unreadable envelope, a stored refusal, a run with no model and no stored decision, and a shipping decision with no model row', () => {
    expect(() => TrainModelMapping.TrainModelOutputFrom(facts({ ValidationResults: 'not json' }))).toThrow(/run-1 .*cannot be read/);
    expect(() => TrainModelMapping.TrainModelOutputFrom(facts({ ValidationResults: null }))).toThrow(/run-1 .*cannot be read/);
    const noGate = envelopeOf(TrainerResultFixtures.CannedNoSignal(RUN_ID, PROTOCOL), { Gate: null });
    expect(() => TrainModelMapping.TrainModelOutputFrom(facts({ ValidationResults: noGate }))).toThrow('training run run-1 produced no model and stored no gate decision');
    const refused: TrainingRunResults = { schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: 'p1' } } };
    expect(() => TrainModelMapping.TrainModelOutputFrom(facts({ ValidationResults: JSON.stringify(refused) })))
      .toThrow('training run run-1 stored a refusal, so its results cannot be read as a completed run');
    const shipsGlm = envelopeOf(TrainerResultFixtures.CannedCompleted(RUN_ID, PROTOCOL));
    expect(() => TrainModelMapping.TrainModelOutputFrom(facts({ ValidationResults: shipsGlm })))
      .toThrow('training run run-1 stored the outcome keep-simple-baseline shipping glm but produced no model');
  });
});

describe('TrainModel mapping — gathering the run facts', () => {
  it('reads the protocol version through the run\'s EvaluationProtocolID, once', async () => {
    const store = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({ ID: 'proto-1', Version: 4 })]);
    const f = await TrainModelMapping.GatherRunFacts(
      await resultOf({ TrainingSnapshotID: 'snap-1', EvaluationProtocolID: 'proto-1', ValidationResults: 'x', Notes: 'LEAKAGE WARNING: x' }, null),
      store,
    );
    expect(f).toEqual({
      Model: null, LeakageFlagged: true,
      RunID: 'run-1', TrainingSnapshotID: 'snap-1', EvaluationProtocolID: 'proto-1', EvaluationProtocolVersion: 4, ValidationResults: 'x',
    });
    expect(store.Reads).toBe(1);
  });

  it('takes the model fields from the model row when one was produced', async () => {
    const store = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({ ID: 'proto-1', Version: 1 })]);
    const f = await TrainModelMapping.GatherRunFacts(
      await resultOf({ EvaluationProtocolID: 'proto-1' }, { Version: 7, Status: 'Draft', HoldoutMetrics: '{"log-loss":0.4}' }),
      store,
    );
    expect([f.Model, f.LeakageFlagged]).toEqual([{ ID: 'model-1', Version: 7, Status: 'Draft', HoldoutMetrics: '{"log-loss":0.4}' }, false]);
  });

  it('reads no protocol for a run without one, and fails closed when the protocol row cannot be found', async () => {
    const store = new FakeEvaluationProtocolStore([]);
    expect((await TrainModelMapping.GatherRunFacts(await resultOf({}, null), store)).EvaluationProtocolVersion).toBeNull();
    expect(store.Reads).toBe(0);
    await expect(TrainModelMapping.GatherRunFacts(await resultOf({ EvaluationProtocolID: 'gone' }, null), store))
      .rejects.toThrow("training run run-1 names Evaluation Protocol 'gone', which cannot be read");
  });
});
