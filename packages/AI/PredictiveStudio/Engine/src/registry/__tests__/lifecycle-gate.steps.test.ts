/**
 * `LifecycleGate`'s protected steps, each on its own (standards §3: each step JSDoc'd and unit-tested), through a
 * subclass that exposes them, over the `GateTestStore` world of `lifecycle-gate.test.ts`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { RunView } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { MonitoringJobSpecs, SemanticsRules, type Actor, type OutputSemantics, type SemanticsCheck, type SignOff, type StoredPublishInputs, type TransitionRefusal } from '@memberjunction/predictive-studio-core';

import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import { FakeClock, GateTestStore, GateWorld, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import type { EvaluateSubject, GateContext, PublishCheck, PublishRequest } from '../gate-context';
import { GateContexts } from '../gate-seams';
import { LifecycleGate } from '../lifecycle-gate';
import { PublishRecords } from '../publish-records';
import { StatusWriteAuthorisations } from '../status-write-authorisations';
import { StoredRuns } from '../stored-publish-inputs';

/** The gate with its protected steps exposed. */
class StepGate extends LifecycleGate {
  public Lock(pipelineId: string, modelId: string, ctx: GateContext) { return this.LockPipelineAndModel(pipelineId, modelId, ctx); }
  public Status(model: MJMLModelEntity, to: MJMLModelEntity['Status']) { return this.CheckPersistedStatus(model, to); }
  public Leakage(model: MJMLModelEntity, request: PublishRequest, ctx: GateContext) { return this.CheckLeakageFlags(model, request, ctx); }
  public RequestSignOff(request: PublishRequest, evidenceSha256: string, ctx: GateContext) { return this.FindRequestSignOff(request, evidenceSha256, ctx); }
  public Inputs(modelId: string, initiator: Actor, ctx: GateContext) { return this.LoadStoredPublishInputs(modelId, initiator, ctx); }
  public Publishable(model: MJMLModelEntity, inputs: StoredPublishInputs, request: PublishRequest, ctx: GateContext) { return this.CheckPublishable(model, inputs, request, ctx); }
  public Apply(model: MJMLModelEntity, to: MJMLModelEntity['Status'], replaces: string | null, initiator: Actor, ctx: GateContext) { return this.ApplyTransition(model, to, replaces, initiator, ctx); }
  public PublishRecord(model: MJMLModelEntity, request: PublishRequest, check: Extract<PublishCheck, { readonly Ok: true }>, ctx: GateContext) { return this.WritePublishRecord(model, request, check, ctx); }
  public RefusalRecord(subject: EvaluateSubject, initiator: Actor, request: PublishRequest | null, refusal: TransitionRefusal, transient: boolean, ctx: GateContext) {
    return this.WriteRefusalRecord(subject, initiator, request, refusal, transient, ctx, 'caller');
  }
  public Job(model: MJMLModelEntity, ctx: GateContext) { return this.CreateMonitoringJob(model, ctx); }
  public Bindings(model: MJMLModelEntity, semantics: OutputSemantics, ctx: GateContext) { return this.CreateOutputBindings(model, semantics, ctx); }
}

const agent: Actor = { kind: 'agent', agentRunId: '7A2B3C4D-0000-4000-8000-0000000000C1' };
/** The registry job's initiator: an automatic rollback comes from it (or from a user), never from an agent (§5.1). */
const registryJob: Actor = { kind: 'scheduled-job', scheduledJobRunId: '7A2B3C4D-0000-4000-8000-0000000000C2' };
const log: string[] = [];
const storage = new MemoryStorageAccount('gate-steps', log);
RegisterMemoryStorage('PS Lifecycle Gate Steps Storage', storage);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Gate Steps Storage', 'PS Lifecycle Gate Steps Storage', true);

let store: GateTestStore;
let world: GateWorld;
let clock: FakeClock;
let gate: StepGate;
let ctx: GateContext;
let incumbent: WorldModel;
let candidate: WorldModel;
let request: PublishRequest;

/** The model row as the gate reads it (an entity object over the store's row). */
async function Model(id: string): Promise<MJMLModelEntity> {
  const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJMLModelEntity>({ EntityName: 'MJ: ML Models', ExtraFilter: `ID='${id}'`, ResultType: 'entity_object' }, ctx.ContextUser);
  return r.Results[0];
}

/** The candidate's stored publish inputs for `request`'s initiator. */
async function Inputs(): Promise<StoredPublishInputs> {
  const inputs = await gate.Inputs(candidate.ID, request.initiator, ctx);
  if ('kind' in inputs) throw new Error(`the stored inputs were refused: ${inputs.kind}`);
  return inputs;
}

beforeEach(() => {
  storage.Reset();
  ServeStorageProviders([providerRow]);
  store = new GateTestStore();
  world = new GateWorld(store, storage);
  incumbent = world.Model('Published', 'model');
  candidate = world.Model('Validated', 'model', { IncumbentID: incumbent.ID });
  clock = new FakeClock();
  gate = new StepGate(new StorageProviderArtifactLoader(), clock, new RecordingScoringActions());
  ctx = GateContexts.ForRequest({ ContextUser: GateWorld.User, Provider: store.Provider() });
  request = { modelId: candidate.ID, purpose: 'publish', initiator: agent, signOffId: null, reason: null };
});

describe('LifecycleGate.LockPipelineAndModel', () => {
  it('takes the pipeline lock, then the model lock, and returns the status the model lock read', async () => {
    expect(await gate.Lock(GateWorld.PipelineID, candidate.ID, ctx)).toEqual({ Locked: true, PersistedStatus: 'Validated' });
    expect(store.Reads).toEqual(['query Predictive Studio: Lock Pipeline For Publish', 'query Predictive Studio: Lock Model For Publish']);
  });
  it('retries a held lock (a failed RunQuery result) with backoff 250 ms doubling, then succeeds', async () => {
    store.LockFailures = 3;
    expect(await gate.Lock(GateWorld.PipelineID, candidate.ID, ctx)).toMatchObject({ Locked: true });
    expect(clock.Sleeps).toEqual([250, 500, 1000]);
    expect(store.Reads.filter((r) => r.endsWith('Lock Pipeline For Publish'))).toHaveLength(4);
  });
  it('gives up after 30 s with the transient publish-in-progress refusal, never sleeping past the deadline', async () => {
    ConsoleCapture.Errors();
    store.LockFailures = 1_000;
    expect(await gate.Lock(GateWorld.PipelineID, candidate.ID, ctx)).toEqual({ Locked: false, Refusal: { kind: 'publish-in-progress' } });
    expect([clock.NowMs, clock.Sleeps.reduce((a, b) => a + b, 0), Math.max(...clock.Sleeps)]).toEqual([30_000, 30_000, 4_000]);
  });
  it('rethrows an error RunQuery throws (a lost connection is not a lock conflict)', async () => {
    store.QueryThrows = 'connection lost';
    await expect(gate.Lock(GateWorld.PipelineID, candidate.ID, ctx)).rejects.toThrow('connection lost');
    expect(clock.Sleeps).toEqual([]);
  });
  it('a model row the lock does not find is model-not-found', async () => {
    expect(await gate.Lock(GateWorld.PipelineID, '0B1C2D3E-0000-4000-8000-00000000DEAD', ctx)).toEqual({ Locked: false, Refusal: { kind: 'model-not-found', modelId: '0B1C2D3E-0000-4000-8000-00000000DEAD' } });
  });
  it('logs the provider message with the pipeline and model ids and the elapsed time before it refuses', async () => {
    const errors = ConsoleCapture.Errors();
    store.LockFailures = 1_000;
    await gate.Lock(GateWorld.PipelineID, candidate.ID, ctx);
    expect(ConsoleCapture.Lines(errors)).toEqual([
      `Predictive Studio lifecycle gate: the pipeline lock was not acquired for pipeline ${GateWorld.PipelineID}, ML Model ${candidate.ID} after 30000 ms (12 attempts); ` +
        'refusing publish-in-progress. Last error: Error executing SQL\n    Error: Lock request time out period exceeded.',
    ]);
  });
  it('a Publish whose lock wait runs out is withheld publish-in-progress, transient, with a refusal record', async () => {
    ConsoleCapture.Errors();
    store.LockFailures = 1_000;
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'publish-in-progress' }, Transient: true });
    expect(store.PublishRecords(candidate.ID)).toEqual([expect.objectContaining({ Kind: 'refusal', Transient: true })]);
  });
});

describe('LifecycleGate.CheckPersistedStatus', () => {
  it('allows a row of the lifecycle table and names both states of any other (D4-90)', async () => {
    const model = await Model(candidate.ID);
    expect(gate.Status(model, 'Published')).toBeNull();
    expect(gate.Status(model, 'Draft')).toEqual({ kind: 'illegal-transition', from: 'validated', to: 'draft' });
    model.Status = 'KeepBaseline';
    expect(gate.Status(model, 'Validated')).toEqual({ kind: 'illegal-transition', from: 'keep-baseline', to: 'validated' });
    model.Status = 'Unevaluated';
    expect(gate.Status(model, 'Published')).toEqual({ kind: 'illegal-transition', from: 'unevaluated', to: 'published' });
  });
});

describe('LifecycleGate.CheckLeakageFlags', () => {
  const flags = [
    { kind: 'single-feature-auc', sourceColumn: 'cancelled_flag', heldOutAuc: 0.97 },
    { kind: 'single-feature-auc', sourceColumn: 'refund_flag', heldOutAuc: 0.95 },
    { kind: 'high-cardinality-id', sourceColumn: 'member_no', distinctRatio: 0.99 },
  ] as const;
  /** A sign-off overriding `kinds`. */
  const signOff = (kinds: SignOff['OverridesFlags']): SignOff => ({
    ID: 'S1', ModelID: candidate.ID, Approver: { kind: 'human', userId: GateWorld.User.ID }, SignedAt: '2026-11-12T00:00:00Z', Decision: 'approve', Reason: 'reviewed',
    Evidence: { holdoutPrimary: { metric: 'log-loss', value: 0.4, interval: { level: 0.95, lower: 0.3, upper: 0.5 }, n: 10 }, comparisons: {}, gate: { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null }, leakageFlags: [], dataWindow: { from: '2026-01-01', to: '2026-01-01' }, snapshotHash: '' },
    OverridesFlags: kinds,
  });
  it('is null for a run with no stored flags', async () => {
    expect(await gate.Leakage(await Model(candidate.ID), request, ctx)).toBeNull();
  });
  it('names each flag kind once', async () => {
    store.FlagLeakage(candidate.ID, flags);
    expect(await gate.Leakage(await Model(candidate.ID), request, ctx)).toEqual({ kind: 'unacknowledged-leakage-flags', flags: ['single-feature-auc', 'high-cardinality-id'] });
  });
  it('passes when the request\'s approving sign-off overrides every flag kind, and names only the kinds a partial override leaves', async () => {
    store.FlagLeakage(candidate.ID, flags);
    const signed: PublishRequest = { ...request, signOffId: 'S1' };
    const full: GateContext = { ...ctx, SignOffLookup: { FindApproving: async () => signOff(['single-feature-auc', 'high-cardinality-id']) } };
    const partial: GateContext = { ...ctx, SignOffLookup: { FindApproving: async () => signOff(['single-feature-auc']) } };
    expect(await gate.Leakage(await Model(candidate.ID), signed, full)).toBeNull();
    expect(await gate.Leakage(await Model(candidate.ID), signed, partial)).toEqual({ kind: 'unacknowledged-leakage-flags', flags: ['high-cardinality-id'] });
  });
  it('asks the lookup with the hash of the evidence rebuilt from stored rows, and never for a request that names no sign-off', async () => {
    store.FlagLeakage(candidate.ID, flags);
    const asked: string[] = [];
    const recording: GateContext = { ...ctx, SignOffLookup: { FindApproving: async (_r, sha) => { asked.push(sha); return signOff(['single-feature-auc', 'high-cardinality-id']); } } };
    expect(await gate.Leakage(await Model(candidate.ID), request, recording)).toMatchObject({ kind: 'unacknowledged-leakage-flags' });
    expect(asked).toEqual([]);
    await gate.Leakage(await Model(candidate.ID), { ...request, signOffId: 'S1' }, recording);
    expect(asked).toEqual([PublishRecords.EvidenceSha256(await ctx.EvidenceBuilder.Build(candidate.ID, ctx))]);
  });
});

describe('LifecycleGate.FindRequestSignOff', () => {
  it('is null without a signOffId; otherwise the lookup answers for the request and the evidence hash', async () => {
    const seen: string[] = [];
    const lookup: GateContext = { ...ctx, SignOffLookup: { FindApproving: async (r, sha) => { seen.push(`${r.signOffId}:${sha}`); return null; } } };
    expect(await gate.RequestSignOff(request, 'h', lookup)).toBeNull();
    expect(seen).toEqual([]);
    expect(await gate.RequestSignOff({ ...request, signOffId: 'S9' }, 'h', lookup)).toBeNull();
    expect(seen).toEqual(['S9:h']);
  });
});

describe('LifecycleGate.LoadStoredPublishInputs', () => {
  it('reads every input from the stored rows', async () => {
    const run = await StoredRuns.Read(candidate.RunID, ctx);
    const inputs = await Inputs();
    expect(inputs).toMatchObject({
      ModelID: candidate.ID, Task: { kind: 'binary' }, RegisteredDelivery: { Shipped: 'xgb', ArtifactSha256: store.Row('MJ: ML Models', candidate.ID)?.['ArtifactSha256'] },
      CurrentPublishedModelID: incumbent.ID, Initiator: agent, IncumbentDiff: { incumbentModelId: incumbent.ID },
      PinnedProtocol: { ProtocolID: run?.EvaluationProtocolID, ProtocolVersion: 1 }, ProtocolRow: { ID: run?.EvaluationProtocolID, Version: 1 },
    });
    expect(inputs.RegisteredArtifacts.map((a) => a.candidate)).toEqual(['xgb', 'oneFeature', 'glm']);
  });
  it('refuses a model with no stored training run (a pre-change model) as not-servable', async () => {
    const row = store.Row('MJ: ML Models', candidate.ID);
    if (row) row['TrainingRunID'] = null;
    expect(await gate.Inputs(candidate.ID, agent, ctx)).toMatchObject({ kind: 'not-servable' });
  });
  it('a Publish of a model whose snapshot reference is null is withheld not-servable before the evidence is built, with a refusal record and the status unchanged (D4-128)', async () => {
    const row = store.Row('MJ: ML Models', candidate.ID);
    if (row) row['TrainingSnapshotID'] = null;
    const reason = `ML Model ${candidate.ID} names no Training Snapshot to build evidence from`;
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'withheld', ModelID: candidate.ID, Status: 'Validated', Transient: false, Refusal: { kind: 'not-servable', reason } });
    expect(store.Status(candidate.ID)).toBe('Validated');
    expect(store.StatusReason(candidate.ID)).toBe(`Automatic publish withheld: The model cannot be served: ${reason}`);
    const records = store.PublishRecords(candidate.ID);
    expect(records.map((r) => [r['Kind'], r['Purpose']])).toEqual([['refusal', 'publish']]);
    expect(GateTestStore.JsonObjectColumn(records[0], 'Refusal')).toEqual({ kind: 'not-servable', reason });
  });

  /** A leakage-flagged candidate whose request names a sign-off overriding the flag, with its snapshot reference cleared. */
  function flaggedSignedWithoutSnapshot(): { readonly Signed: PublishRequest; readonly Lookups: string[]; readonly Ctx: GateContext; readonly Reason: string } {
    store.FlagLeakage(candidate.ID, [{ kind: 'single-feature-auc', sourceColumn: 'cancelled_flag', heldOutAuc: 0.97 }]);
    const row = store.Row('MJ: ML Models', candidate.ID);
    if (row) row['TrainingSnapshotID'] = null;
    const lookups: string[] = [];
    // The lookup is never reached: the stored inputs refuse before anything builds the evidence it is asked about.
    const recording: GateContext = { ...ctx, SignOffLookup: { FindApproving: async (_r, sha) => { lookups.push(sha); return null; } } };
    return { Signed: { ...request, signOffId: '5E1A0FF0-0000-4000-8000-0000000000D1' }, Lookups: lookups, Ctx: recording, Reason: `ML Model ${candidate.ID} names no Training Snapshot to build evidence from` };
  }

  it('a Publish of a leakage-flagged model naming a sign-off, whose snapshot reference is null, is withheld not-servable before the leakage check builds evidence, with a refusal record and the status unchanged (D4-128, R1)', async () => {
    const f = flaggedSignedWithoutSnapshot();
    expect(await gate.Publish(f.Signed, f.Ctx)).toMatchObject({ Kind: 'withheld', ModelID: candidate.ID, Status: 'Validated', Transient: false, Refusal: { kind: 'not-servable', reason: f.Reason } });
    expect(f.Lookups).toEqual([]);
    expect(store.Status(candidate.ID)).toBe('Validated');
    const records = store.PublishRecords(candidate.ID);
    expect(records.map((r) => [r['Kind'], r['Purpose']])).toEqual([['refusal', 'publish']]);
    expect(GateTestStore.JsonObjectColumn(records[0], 'Refusal')).toEqual({ kind: 'not-servable', reason: f.Reason });
  });

  it('a restore (R1) of a leakage-flagged model naming a sign-off, whose snapshot reference is null, is withheld not-servable with a refusal record and the status unchanged (D4-128, R1)', async () => {
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'published', ModelID: candidate.ID });
    store.SetStatus(candidate.ID, 'Validated');
    const f = flaggedSignedWithoutSnapshot();
    expect(await gate.Publish(f.Signed, f.Ctx)).toMatchObject({ Kind: 'withheld', ModelID: candidate.ID, Status: 'Validated', Transient: false, Refusal: { kind: 'not-servable', reason: f.Reason } });
    expect(f.Lookups).toEqual([]);
    expect(store.Status(candidate.ID)).toBe('Validated');
    const records = store.PublishRecords(candidate.ID);
    expect(records.map((r) => [r['Kind'], r['Purpose']])).toEqual([['publish', 'publish'], ['refusal', 'publish']]);
    expect(GateTestStore.JsonObjectColumn(records[1], 'Refusal')).toEqual({ kind: 'not-servable', reason: f.Reason });
  });
});

describe('LifecycleGate.CheckPublishable', () => {
  it('passes a stored model outcome: re-derived publish, replaced incumbent, evidence with its hash, the automated approver', async () => {
    const check = await gate.Publishable(await Model(candidate.ID), await Inputs(), request, ctx);
    if (check.Ok === false) throw new Error(`refused: ${check.Refusal.kind}`);
    expect([check.Reverified.Shipped, check.Replaces, check.Approver, check.SignOff]).toEqual(['xgb', incumbent.ID, { Kind: 'automated-gate' }, null]);
    expect(check.EvidenceSha256).toBe(PublishRecords.EvidenceSha256(check.Evidence));
  });
  it('a definite hash mismatch is not transient and carries the artifact state to record', async () => {
    world.CorruptArtifact(candidate.ID);
    expect(await gate.Publishable(await Model(candidate.ID), await Inputs(), request, ctx)).toMatchObject({
      Ok: false, Refusal: { kind: 'artifact-unverifiable' }, Transient: false, Artifact: { Status: 'hash-mismatch', CheckedAt: expect.any(Date) },
    });
  });
  it("refuses a model whose stored output bindings break its semantics, naming the mismatch (the production check)", async () => {
    const row = store.OutputBindings(candidate.ID).find((r) => r['Surface'] === 'at-risk-list');
    if (!row) throw new Error('the candidate has no at-risk-list binding');
    row['SortsBy'] = 'score-asc';
    expect(await gate.Publishable(await Model(candidate.ID), await Inputs(), request, ctx)).toMatchObject({
      Ok: false, Refusal: { kind: 'semantics-check-failed', mismatches: ['at-risk-list: SortsBy is score-asc, the semantics require adverse-probability-desc'] },
    });
  });
  it('a failing semantics check is semantics-check-failed', async () => {
    const failing: SemanticsCheck = { ModelID: candidate.ID, Semantics: { task: { kind: 'count' } }, BindingSource: 'MJ: ML Output Bindings', UIBindings: [], Result: { Status: 'failed', Mismatches: ['at-risk-list sorts the wrong class'] } };
    const seams: GateContext = { ...ctx, SemanticsCheck: { Check: async () => failing } };
    expect(await gate.Publishable(await Model(candidate.ID), await Inputs(), request, seams)).toMatchObject({ Ok: false, Refusal: { kind: 'semantics-check-failed', mismatches: ['at-risk-list sorts the wrong class'] } });
  });
  it('a calibration-held finalist is calibration-held, and a model the inputs do not beat is does-not-beat-incumbent', async () => {
    const held = await Model(candidate.ID);
    held.Lineage = JSON.stringify({ calibrationHold: { slope: null } });
    expect(await gate.Publishable(held, await Inputs(), request, ctx)).toMatchObject({ Ok: false, Refusal: { kind: 'calibration-held', slope: null } });
    const inputs = await Inputs();
    const losing: StoredPublishInputs = { ...inputs, IncumbentDiff: { incumbentModelId: incumbent.ID, value: 0, lower: -0.01, upper: 0.01 } };
    expect(await gate.Publishable(await Model(candidate.ID), losing, request, ctx)).toMatchObject({ Ok: false, Refusal: { kind: 'does-not-beat-incumbent', incumbentModelId: incumbent.ID, comparison: { ci: [-0.01, 0.01], beats: false } } });
  });
  it('an approving sign-off, when the protocol requires one, makes its approver the approver', async () => {
    store.PinProtocol(candidate.ID, { requiresHumanSignOff: true });
    const approving: SignOff = {
      ID: 'S2', ModelID: candidate.ID, Approver: { kind: 'human', userId: 'U-APPROVER' }, SignedAt: '2026-11-12T00:00:00Z', Decision: 'approve', Reason: 'ok',
      Evidence: { holdoutPrimary: { metric: 'log-loss', value: 0.4, interval: { level: 0.95, lower: 0.3, upper: 0.5 }, n: 10 }, comparisons: {}, gate: { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null }, leakageFlags: [], dataWindow: { from: '2026-01-01', to: '2026-01-01' }, snapshotHash: '' },
      OverridesFlags: [],
    };
    const seams: GateContext = { ...ctx, SignOffLookup: { FindApproving: async () => approving } };
    expect(await gate.Publishable(await Model(candidate.ID), await Inputs(), request, seams)).toMatchObject({ Ok: false, Refusal: { kind: 'no-sign-off' } });
    expect(await gate.Publishable(await Model(candidate.ID), await Inputs(), { ...request, signOffId: 'S2' }, seams)).toMatchObject({ Ok: true, SignOff: { ID: 'S2' }, Approver: { Kind: 'user', UserID: 'U-APPROVER' } });
  });
});

describe('LifecycleGate.ApplyTransition', () => {
  it('archives the replaced model first, then authorises exactly From → To by the initiator (naming what it replaces) for the instance during its save, then revokes it', async () => {
    const model = await Model(candidate.ID);
    const seen: (ReturnType<StatusWriteAuthorisations['Take']>)[] = [];
    store.OnSave = (_entityName, record) => {
      if (record === model) seen.push(StatusWriteAuthorisations.Instance.Take(model));
    };
    await gate.Apply(model, 'Published', incumbent.ID, agent, ctx);
    expect(seen).toEqual([{ From: 'Validated', To: 'Published', Initiator: agent, Replaces: incumbent.ID }]);
    expect(store.Saves.filter((x) => x.startsWith('MJ: ML Models '))).toEqual([`MJ: ML Models ${incumbent.ID}`, `MJ: ML Models ${candidate.ID}`]);
    expect(StatusWriteAuthorisations.Instance.Take(model)).toBeNull();
    expect([store.Status(candidate.ID), store.Status(incumbent.ID)]).toEqual(['Published', 'Archived']);
  });
  it('revokes an authorisation the save did not consume, and throws on a failed save', async () => {
    const model = await Model(candidate.ID);
    store.FailingSaves.set('MJ: ML Models', 'row locked');
    await expect(gate.Apply(model, 'Archived', null, agent, ctx)).rejects.toThrow(`Saving ML Model ${candidate.ID} as Archived failed: row locked`);
    expect(StatusWriteAuthorisations.Instance.Take(model)).toBeNull();
  });
  it('refuses a transition outside the lifecycle table before writing', async () => {
    await expect(gate.Apply(await Model(candidate.ID), 'Draft', null, agent, ctx)).rejects.toThrow('Validated → Draft is not in the lifecycle table');
    expect(store.SaveCount()).toBe(0);
  });
});

describe('LifecycleGate.WritePublishRecord', () => {
  it('writes the publish row with the re-derived decision, the evidence and its hash, the approver and the replaced model', async () => {
    const model = await Model(candidate.ID);
    const check = await gate.Publishable(model, await Inputs(), request, ctx);
    if (check.Ok === false) throw new Error(`refused: ${check.Refusal.kind}`);
    const id = await gate.PublishRecord(model, request, check, ctx);
    expect(store.Row('MJ: ML Model Publish Records', id)).toMatchObject({
      Kind: 'publish', Purpose: 'publish', ModelID: candidate.ID, TrainingRunID: candidate.RunID, ApproverKind: 'automated-gate', UserID: null,
      EvidenceSha256: check.EvidenceSha256, Evidence: JSON.stringify(check.Evidence), GateDecision: JSON.stringify(check.Reverified.Gate), ReplacesModelID: incumbent.ID, SignOffID: null,
    });
  });
});

describe('LifecycleGate.WriteRefusalRecord', () => {
  it('writes a run-level row for a run subject and a model row (with its training run) for a model subject', async () => {
    const runLevel = await gate.RefusalRecord({ trainingRunId: candidate.RunID }, agent, null, { kind: 'gate-no-signal', reason: 'nothing beats the dummy' }, false, ctx);
    expect(store.Row('MJ: ML Model Publish Records', runLevel)).toMatchObject({ Kind: 'refusal', Purpose: 'evaluate', ModelID: null, TrainingRunID: candidate.RunID, Transient: false });
    const modelLevel = await gate.RefusalRecord({ modelId: candidate.ID }, { kind: 'human', userId: GateWorld.User.ID }, request, { kind: 'publish-in-progress' }, true, ctx);
    expect(store.Row('MJ: ML Model Publish Records', modelLevel)).toMatchObject({
      Kind: 'refusal', Purpose: 'publish', ModelID: candidate.ID, TrainingRunID: candidate.RunID, ApproverKind: 'user', UserID: GateWorld.User.ID, Transient: true,
      Refusal: JSON.stringify({ kind: 'publish-in-progress' }), Reason: 'Another publish of this pipeline or model holds its lock; retry later.',
    });
  });
  it('refuses a model subject with no request (a model-level Evaluate refusal writes no record)', async () => {
    await expect(gate.RefusalRecord({ modelId: candidate.ID }, agent, null, { kind: 'reason-required' }, false, ctx)).rejects.toThrow('needs the publish request it refuses');
  });
});

describe('LifecycleGate.CreateMonitoringJob', () => {
  it('creates one Pending job of the monitoring type, owned by the context user, configured by the protocol spec', async () => {
    const model = await Model(candidate.ID);
    const id = await gate.Job(model, ctx);
    const protocol = await StoredRuns.ReadProtocol(String(model.EvaluationProtocolID), ctx);
    if (protocol === null) throw new Error('no protocol');
    const spec = MonitoringJobSpecs.FromProtocol(protocol.Spec, { ModelID: candidate.ID, PredictionUnitID: GateWorld.UnitID, FeatureCount: 2 });
    expect(store.Row('MJ: Scheduled Jobs', id)).toMatchObject({
      Status: 'Pending', JobTypeID: GateWorld.JobTypeID, OwnerUserID: GateWorld.User.ID, CronExpression: '0 3 1 * *', Timezone: 'UTC', Configuration: JSON.stringify(spec),
    });
  });
});

describe('LifecycleGate.CreateOutputBindings (inside Evaluate)', () => {
  /** The model's binding rows as surface → (sort, direction, label). */
  const shapes = (modelId: string) => store.OutputBindings(modelId).map((r) => [r['Surface'], r['SortsBy'], r['DriverDirectionRelativeTo'], r['Label']]);
  /** The world's models' stored semantics (`GateWorld`: binary, classes '0'/'1', adverse 0). */
  const binary: OutputSemantics = { task: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 } };
  const defaults = SemanticsRules.DefaultBindings(binary).map((b) => [b.Surface, b.SortsBy, b.DriverDirectionRelativeTo, b.Label]);

  it("an applied Evaluate creates the four rows from the model's stored semantics, in the evaluation's transaction", async () => {
    const draft = world.Model('Draft', 'model');
    expect(store.OutputBindings(draft.ID)).toEqual([]);
    expect(await gate.Evaluate({ modelId: draft.ID }, agent, ctx)).toMatchObject({ Kind: 'evaluated', To: 'Validated' });
    expect(shapes(draft.ID)).toEqual(defaults);
    expect(store.Transactions).toEqual(['begin', 'commit']);
  });
  it('a KeepBaseline evaluation creates them too', async () => {
    const draft = world.Model('Draft', 'keep');
    expect(await gate.Evaluate({ modelId: draft.ID }, agent, ctx)).toMatchObject({ Kind: 'evaluated', To: 'KeepBaseline' });
    expect(store.OutputBindings(draft.ID)).toHaveLength(4);
  });
  it('a second Evaluate creates none: it is refused, and the step itself never overwrites an existing row', async () => {
    const draft = world.Model('Draft', 'model');
    await gate.Evaluate({ modelId: draft.ID }, agent, ctx);
    const edited = store.OutputBindings(draft.ID).find((r) => r['Surface'] === 'record-panel');
    if (!edited) throw new Error('no record-panel row');
    edited['Label'] = 'Risk of 0 (edited)';
    const saves = store.SaveCount();
    expect(await gate.Evaluate({ modelId: draft.ID }, agent, ctx)).toMatchObject({ Kind: 'refused', Refusal: { kind: 'illegal-transition' } });
    await gate.Bindings(await Model(draft.ID), binary, ctx);
    expect(store.SaveCount()).toBe(saves);
    expect(store.OutputBindings(draft.ID)).toHaveLength(4);
    expect(store.OutputBindings(draft.ID).find((r) => r['Surface'] === 'record-panel')?.['Label']).toBe('Risk of 0 (edited)');
  });
  it('completes a partial set, creating only the missing surfaces', async () => {
    const draft = world.Model('Draft', 'model');
    store.Insert('MJ: ML Output Bindings', { ID: '7A2B3C4D-0000-4000-8000-0000000000D1', ModelID: draft.ID, Surface: 'why-badge', SortsBy: 'none', DriverDirectionRelativeTo: 'adverse-class', Label: '0 risk' });
    await gate.Evaluate({ modelId: draft.ID }, agent, ctx);
    expect(store.Saves.filter((x) => x.startsWith('MJ: ML Output Bindings '))).toHaveLength(3);
    expect(store.OutputBindings(draft.ID).map((r) => r['Surface']).sort()).toEqual(['at-risk-list', 'predictions-grid', 'record-panel', 'why-badge']);
    expect(store.OutputBindings(draft.ID).filter((r) => r['Surface'] === 'why-badge')).toHaveLength(1);
  });
  it('a refused Evaluate writes no rows', async () => {
    const draft = world.Model('Draft', 'model');
    store.SetStatus(draft.ID, 'Archived');
    expect(await gate.Evaluate({ modelId: draft.ID }, agent, ctx)).toMatchObject({ Kind: 'refused' });
    expect(store.OutputBindings(draft.ID)).toEqual([]);
  });
  it('a failed binding save throws with the entity message and rolls the evaluation back', async () => {
    const draft = world.Model('Draft', 'model');
    store.FailingSaves.set('MJ: ML Output Bindings', 'at-risk-list: SortsBy is none, the semantics require adverse-probability-desc');
    await expect(gate.Evaluate({ modelId: draft.ID }, agent, ctx)).rejects.toThrow(`Saving the at-risk-list output binding of ML Model ${draft.ID} failed: at-risk-list: SortsBy is none`);
    expect([store.Status(draft.ID), store.OutputBindings(draft.ID)]).toEqual(['Draft', []]);
    expect(store.Transactions).toEqual(['begin', 'rollback']);
  });
  it.each([
    ['empty', '', 'OutputSemantics is empty; it must hold JSON'],
    ['malformed', '{"task":{"kind":"sideways"}}', 'TaskType kind "sideways" is not one of'],
  ])('an Evaluate of a Draft model whose OutputSemantics is %s is refused not-servable before the status write: Draft kept, no rows, nothing committed (D4-129)', async (_label, stored, error) => {
    const draft = world.Model('Draft', 'model');
    const row = store.Row('MJ: ML Models', draft.ID);
    if (row === undefined) throw new Error('no model row');
    row['OutputSemantics'] = stored;
    const outcome = await gate.Evaluate({ modelId: draft.ID }, agent, ctx);
    expect(outcome).toMatchObject({ Kind: 'refused', Refusal: { kind: 'not-servable' } });
    if (outcome.Kind !== 'refused' || outcome.Refusal.kind !== 'not-servable') throw new Error('not a not-servable refusal');
    expect(outcome.Refusal.reason).toContain(`ML Model ${draft.ID}'s OutputSemantics does not parse: `);
    expect(outcome.Refusal.reason).toContain(error);
    expect([store.Status(draft.ID), store.OutputBindings(draft.ID), store.Transactions]).toEqual(['Draft', [], ['begin', 'rollback']]);
    expect(store.Saves.filter((x) => x.startsWith('MJ: ML Models ') || x.startsWith('MJ: ML Model Publish Records '))).toEqual([]);
  });
  it('throws for a failed read of the existing rows', async () => {
    store.ReadLog.FailNext('MJ: ML Output Bindings');
    await expect(gate.Bindings(await Model(candidate.ID), binary, ctx)).rejects.toThrow(`Reading the output bindings of ML Model ${candidate.ID} failed`);
  });
});

describe('LifecycleGate.CheckPublishable fills missing output bindings before the semantics check (D4-112)', () => {
  /** The model's binding rows as surface → (sort, direction, label), in surface order. */
  const shapes = (modelId: string) =>
    store.OutputBindings(modelId).map((r) => [r['Surface'], r['SortsBy'], r['DriverDirectionRelativeTo'], r['Label']]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const defaults = SemanticsRules.DefaultBindings({ task: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 } })
    .map((b) => [b.Surface, b.SortsBy, b.DriverDirectionRelativeTo, b.Label]).sort((a, b) => a[0].localeCompare(b[0]));
  const bindingSaves = () => store.Saves.filter((x) => x.startsWith('MJ: ML Output Bindings ')).length;
  const dropBindings = (modelId: string, surfaces?: readonly string[]) => {
    store.Tables['MJ: ML Output Bindings'] = (store.Tables['MJ: ML Output Bindings'] || []).filter((r) => !(String(r['ModelID']) === modelId && (surfaces === undefined || surfaces.includes(String(r['Surface'])))));
  };

  it('a publish of a Validated model with no rows creates the four default rows and proceeds', async () => {
    dropBindings(candidate.ID);
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'published', ModelID: candidate.ID });
    expect(shapes(candidate.ID)).toEqual(defaults);
    expect(bindingSaves()).toBe(4);
  });
  it('with three of four rows present, creates only the missing one', async () => {
    dropBindings(candidate.ID, ['why-badge']);
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'published' });
    expect(store.Saves.filter((x) => x.startsWith('MJ: ML Output Bindings '))).toHaveLength(1);
    expect(shapes(candidate.ID)).toEqual(defaults);
  });
  it('a present row that disagrees is still refused, and the attempt keeps no row it created and changes none', async () => {
    dropBindings(candidate.ID, ['why-badge']);
    const atRisk = store.OutputBindings(candidate.ID).find((r) => r['Surface'] === 'at-risk-list');
    if (!atRisk) throw new Error('no at-risk-list row');
    atRisk['SortsBy'] = 'score-asc';
    const before = store.OutputBindings(candidate.ID).map((r) => ({ ...r }));
    expect(await gate.Publish(request, ctx)).toMatchObject({
      Kind: 'withheld', Refusal: { kind: 'semantics-check-failed', mismatches: ['at-risk-list: SortsBy is score-asc, the semantics require adverse-probability-desc'] },
    });
    expect(store.OutputBindings(candidate.ID)).toEqual(before);
    expect(store.Status(candidate.ID)).toBe('Validated');
  });
  it('a rollback fills the missing rows', async () => {
    await gate.Publish(request, ctx);
    await gate.Archive(candidate.ID, 'retired', agent, ctx);
    dropBindings(candidate.ID);
    expect(await gate.Publish({ ...request, purpose: 'rollback', reason: 'the newer model degraded', initiator: registryJob }, ctx)).toMatchObject({ Kind: 'published', ModelID: candidate.ID });
    expect(shapes(candidate.ID)).toEqual(defaults);
  });
  it('a restore (R1) fills the missing rows', async () => {
    const first = await gate.Publish(request, ctx);
    store.SetStatus(candidate.ID, 'Validated');   // a write outside the gate
    dropBindings(candidate.ID);
    expect(await gate.Publish(request, ctx)).toMatchObject({ Kind: 'published', PublishRecordID: first.Kind === 'published' ? first.PublishRecordID : '' });
    expect(shapes(candidate.ID)).toEqual(defaults);
  });
});
