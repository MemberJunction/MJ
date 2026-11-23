/**
 * Who started a Promote (review R5 item 2): the Promote ML Model action and the `PredictiveStudio.PromoteModel`
 * operation derive the lifecycle gate's initiator from the call instead of always naming the context user as a person.
 * An action run inside an agent run (BaseAgent stamps `Context.AgentRunID`) is the `agent`; an operation call made with
 * an API key, or by the MJ system user, is a `system` caller; anything else is the person. The real `LifecycleGate`
 * runs over the `GateTestStore` world, so the agent-only rules are the gate's own: an agent rollback is refused
 * `actor-not-permitted`, and a keep-simple-baseline model publishes for a non-person only under
 * `autoPublishKeepBaseline`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { UserInfo, WellKnownUserSource } from '@memberjunction/core';

import { GateTestStore, GateWorld, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import { LifecycleGate } from '../../registry/lifecycle-gate';
import { PredictiveStudioPromoteModelServerOperation } from '../../operations/promote-model.operation';
import { CallerInitiators } from '../../operations/caller-initiator';
import { CapturingContext } from '../../operations/__tests__/helpers';
import { PredictiveStudioPromoteModelAction } from '../promote-model.action';

const log: string[] = [];
const storage = new MemoryStorageAccount('promote-initiator', log);
RegisterMemoryStorage('PS Promote Initiator Test Storage', storage);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Promote Initiator Storage', 'PS Promote Initiator Test Storage', true);

const AGENT_ID = '6F1C2B3A-0000-4000-8000-00000000A6E1';
const AGENT_RUN_ID = '6F1C2B3A-0000-4000-8000-00000000A6E2';
const SYSTEM_USER = new UserInfo(null, { ID: '6F1C2B3A-0000-4000-8000-0000000005F5', Email: 'system@example.com', Type: 'User', UserRoles: [] });

/** The op over the real gate, its scoring-Action seam recorded. */
class TestablePromoteOperation extends PredictiveStudioPromoteModelServerOperation {
  protected override CreateLifecycleGate(): LifecycleGate {
    return new LifecycleGate(new StorageProviderArtifactLoader(), undefined, new RecordingScoringActions());
  }
}

/** The action over the real gate, its scoring-Action seam recorded. */
class TestablePromoteAction extends PredictiveStudioPromoteModelAction {
  protected override CreateLifecycleGate(): LifecycleGate {
    return new LifecycleGate(new StorageProviderArtifactLoader(), undefined, new RecordingScoringActions());
  }
  public run(params: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(params);
  }
}

let store: GateTestStore;
let world: GateWorld;
let op: TestablePromoteOperation;
let context: CapturingContext;

beforeEach(() => {
  storage.Reset();
  ServeStorageProviders([providerRow]);
  store = new GateTestStore();
  world = new GateWorld(store, storage);
  op = new TestablePromoteOperation();
  context = new CapturingContext(store.Provider(), GateWorld.User);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The action's params for one transition; `agentContext` adds the keys BaseAgent stamps on an action run. */
function actionParams(modelId: string, transition: string, agentContext: boolean, user: UserInfo = GateWorld.User): RunActionParams {
  const list: ActionParam[] = [
    { Name: 'ModelID', Type: 'Input', Value: modelId },
    { Name: 'Transition', Type: 'Input', Value: transition },
    { Name: 'Reason', Type: 'Input', Value: 'restore' },
  ];
  // Test-double cast: RunActionParams is a framework class; the action reads only these four members.
  return { Params: list, ContextUser: user, Provider: store.Provider(), Context: agentContext ? { AgentID: AGENT_ID, AgentRunID: AGENT_RUN_ID } : undefined } as RunActionParams;
}

/** The parsed `Initiator` of each of the model's publish records, oldest first. */
function initiators(model: WorldModel): unknown[] {
  return store.PublishRecords(model.ID).map((r) => JSON.parse(String(r['Initiator'])));
}

/** A model published (by a person) and then archived: the starting state of a rollback. */
async function archivedAfterPublish(): Promise<WorldModel> {
  const model = world.Model('Validated', 'model');
  expect(await op.ExecuteServer({ modelId: model.ID, transition: 'publish' }, context)).toMatchObject({ Output: { applied: true } });
  expect(await op.ExecuteServer({ modelId: model.ID, transition: 'archive', reason: 'retired' }, context)).toMatchObject({ Output: { applied: true, status: 'Archived' } });
  return model;
}

describe('Promote ML Model action — the initiator of an agent run', () => {
  it('an agent-run rollback is refused actor-not-permitted and the model stays Archived', async () => {
    const model = await archivedAfterPublish();
    const r = await new TestablePromoteAction().run(actionParams(model.ID, 'rollback', true));
    expect([r.Success, r.ResultCode]).toEqual([false, 'TRANSITION_REFUSED']);
    expect(r.Message).toContain('actor-not-permitted');
    expect(store.Status(model.ID)).toBe('Archived');
  });

  it('an agent-run publish of a KeepBaseline model is refused without autoPublishKeepBaseline, and recorded as the agent run', async () => {
    const keep = world.Model('KeepBaseline', 'keep');
    const r = await new TestablePromoteAction().run(actionParams(keep.ID, 'publish', true));
    expect([r.Success, r.ResultCode]).toEqual([false, 'TRANSITION_REFUSED']);
    expect(r.Message).toContain('keep-baseline-not-auto-published');
    expect(store.Status(keep.ID)).toBe('KeepBaseline');
    expect(initiators(keep)).toEqual([{ kind: 'agent', agentRunId: AGENT_RUN_ID }]);
  });

  it('under autoPublishKeepBaseline the agent run publishes the KeepBaseline model, approved by the gate, not by a person', async () => {
    const keep = world.Model('KeepBaseline', 'keep');
    store.PinProtocol(keep.ID, { autoPublishKeepBaseline: true });
    const r = await new TestablePromoteAction().run(actionParams(keep.ID, 'publish', true));
    expect([r.Success, r.ResultCode]).toEqual([true, 'SUCCESS']);
    expect(store.PublishRecords(keep.ID)).toEqual([expect.objectContaining({ Kind: 'publish', ApproverKind: 'automated-gate', Initiator: JSON.stringify({ kind: 'agent', agentRunId: AGENT_RUN_ID }) })]);
  });

  it('a person\'s call (no agent run) still publishes a KeepBaseline model, recorded as that person', async () => {
    const keep = world.Model('KeepBaseline', 'keep');
    expect((await new TestablePromoteAction().run(actionParams(keep.ID, 'publish', false))).ResultCode).toBe('SUCCESS');
    expect(store.PublishRecords(keep.ID)).toEqual([expect.objectContaining({ ApproverKind: 'user', UserID: GateWorld.User.ID, Initiator: JSON.stringify({ kind: 'human', userId: GateWorld.User.ID }) })]);
  });

  it('a person\'s rollback (no agent run) still restores the archived model', async () => {
    const model = await archivedAfterPublish();
    expect((await new TestablePromoteAction().run(actionParams(model.ID, 'rollback', false))).ResultCode).toBe('SUCCESS');
    expect(store.Status(model.ID)).toBe('Published');
  });

  it('the MJ system user running the action is a system caller, not a person', async () => {
    vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation((u) => u?.ID === SYSTEM_USER.ID);
    const keep = world.Model('KeepBaseline', 'keep');
    expect(CallerInitiators.OfActionRun(actionParams(keep.ID, 'publish', false, SYSTEM_USER))).toEqual({ kind: 'system', component: CallerInitiators.SystemUserComponent });
  });
});

describe('PredictiveStudio.PromoteModel — the initiator of an API-key call', () => {
  it('an API-key caller publishes a Validated model as an automated-gate publish, never as a person', async () => {
    const model = world.Model('Validated', 'model');
    const out = await op.ExecuteServer({ modelId: model.ID, transition: 'publish' }, { ...context, apiKeyHash: 'k' });
    expect(out).toMatchObject({ Success: true, Output: { applied: true, status: 'Published' } });
    expect(store.PublishRecords(model.ID)).toEqual([expect.objectContaining({ ApproverKind: 'automated-gate', Initiator: JSON.stringify({ kind: 'system', component: CallerInitiators.ApiKeyComponent }) })]);
  });

  it('an API-key caller cannot publish a KeepBaseline model without autoPublishKeepBaseline, nor roll back', async () => {
    const keep = world.Model('KeepBaseline', 'keep');
    expect(await op.ExecuteServer({ modelId: keep.ID, transition: 'publish' }, { ...context, apiKeyHash: 'k' })).toMatchObject({ Output: { applied: false, refusal: { kind: 'keep-baseline-not-auto-published' } } });
    const model = await archivedAfterPublish();
    expect(await op.ExecuteServer({ modelId: model.ID, transition: 'rollback', reason: 'restore' }, { ...context, apiKeyHash: 'k' })).toMatchObject({ Output: { applied: false, status: 'Archived', refusal: { kind: 'actor-not-permitted', actor: 'system' } } });
  });

  it('the MJ system user calling the operation is a system caller', async () => {
    vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation((u) => u?.ID === SYSTEM_USER.ID);
    expect(CallerInitiators.OfOperationCall(SYSTEM_USER, new CapturingContext(store.Provider(), SYSTEM_USER))).toEqual({ kind: 'system', component: CallerInitiators.SystemUserComponent });
    expect(CallerInitiators.OfOperationCall(GateWorld.User, context)).toEqual({ kind: 'human', userId: GateWorld.User.ID });
  });
});

describe('CallerInitiators.OfActionRun', () => {
  it('reads the agent run from the action context; an agent context without a run, or a malformed run id, is not a person', () => {
    const base = actionParams('m', 'publish', false);
    expect(CallerInitiators.OfActionRun({ ...base, Context: { AgentID: AGENT_ID, AgentRunID: AGENT_RUN_ID } } as RunActionParams)).toEqual({ kind: 'agent', agentRunId: AGENT_RUN_ID });
    expect(CallerInitiators.OfActionRun({ ...base, Context: { AgentID: AGENT_ID } } as RunActionParams)).toEqual({ kind: 'system', component: CallerInitiators.AgentWithoutRunComponent });
    expect(CallerInitiators.OfActionRun({ ...base, Context: { AgentRunID: 'not-a-uuid' } } as RunActionParams)).toEqual({ kind: 'system', component: CallerInitiators.AgentWithoutRunComponent });
    expect(CallerInitiators.OfActionRun({ ...base, Context: { Other: 1 } } as RunActionParams)).toEqual({ kind: 'human', userId: GateWorld.User.ID });
  });
});
