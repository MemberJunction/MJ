/**
 * A2 attack list — `BuildApprovalResolver.Resolve` (D-090 rules 1–5 and consumption): attacks 1, 2, 3, 4, 5, 7, 10, 14
 * (plan-edited) and 20, plus the answering-save hook that records a non-person answer as nobody's (attack 3 a–c).
 *
 * The database is a fixture table read through a fake `RunView` (`RunView.FromMetadataProvider` is spied): each
 * entity's rows, a run looked up by its `ID='…'` filter. Test doubles at the framework boundary, cast where handed over:
 * the provider (`EntityByName` with per-user permissions), the run entity (`ID`, `AgentID`, `LastRunID`, `UserID`,
 * `ConversationDetailID`), the users (`UserInfo` with `ID`, `Type`) and the request entity the hook checks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, UserCache, UserInfo, WellKnownUserSource, ServerOperationScopeManager, type IMetadataProvider, type BaseEntity } from '@memberjunction/core';
import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { BuildApprovalResolver } from '../build-approval-resolver';
import { AgentControlPath } from '../control-path';

const MDA = 'A0000000-0000-4000-8000-000000000001';
const R1 = 'B1000000-0000-4000-8000-000000000001'; // the presenting run
const R2 = 'B2000000-0000-4000-8000-000000000002'; // the resumed run that resolves
const S1 = 'C1000000-0000-4000-8000-000000000001'; // the presenting run's Plan step
const Q1 = 'D1000000-0000-4000-8000-000000000001'; // the agent's request
const PERSON = 'E1000000-0000-4000-8000-000000000001';
const OTHER = 'E2000000-0000-4000-8000-000000000002';
const SYSTEM = 'E3000000-0000-4000-8000-000000000003';
const REQUEST_ENTITY_ID = 'F1000000-0000-4000-8000-000000000001';
const PLAN_TEXT = '## Plan\nPredict Renewed from Tenure.';
const PAYLOAD = {
  Goal: 'Predict renewal',
  TargetDefinition: { EntityName: 'PS Truth C1 People', TargetVariable: 'Renewed', ProblemType: 'classification' as const, SuccessMetric: 'AUC' },
  CandidateSources: [], CandidateFeatures: [{ Name: 'Tenure', SourceRef: 'x', Kind: 'numeric' as const, Why: 'y' }], LeakageNotes: [],
  ProposedExperiments: [{ Label: 'lr', AlgorithmName: 'logistic_regression', FeatureSet: ['Tenure'], Rationale: 'r', Priority: 1 }],
  ValidationStrategy: { Strategy: 'holdout' as const }, ProposedBudget: {},
};
const HASH = AgentControlPath.PlanHash(PAYLOAD);

type Row = Record<string, string | number | boolean | null>;
let db: Record<string, Row[]>;
let perms: Record<string, { CanCreate: boolean }>;

function runRow(id: string, lastRunId: string | null, finalPayload: object | null): Row {
  return { ID: id, AgentID: MDA, LastRunID: lastRunId, UserID: PERSON, Status: 'AwaitingFeedback', FinalPayload: finalPayload ? JSON.stringify(finalPayload) : null, StartedAt: '2026-11-26T09:00:00Z', LastHeartbeatAt: null, ConversationDetailID: null };
}
function change(type: 'Create' | 'Update', userId: string, full: Row, at: string): Row {
  return { ID: `${type}-${at}`, EntityID: REQUEST_ENTITY_ID, RecordID: `ID|${Q1}`, UserID: userId, Type: type, ChangedAt: at, FullRecordJSON: JSON.stringify(full), ChangesJSON: '{}' };
}
const REQUESTED: Row = { ID: Q1, Status: 'Requested', ResponseByUserID: null, RespondedAt: null, ResponseData: null, RequestForUserID: PERSON };
const APPROVED: Row = { ...REQUESTED, Status: 'Approved', ResponseByUserID: PERSON, RespondedAt: '2026-11-26T09:05:00Z', ResponseData: JSON.stringify({ plan: PLAN_TEXT, decision: 'approve' }) };

function seed(): void {
  db = {
    'MJ: AI Agent Runs': [runRow(R2, R1, PAYLOAD), runRow(R1, null, { ...PAYLOAD, PlanHash: HASH, PlanId: '9A000000-0000-4000-8000-000000000001' })],
    'MJ: AI Agent Run Steps': [{ ID: S1, AgentRunID: R1, StepName: 'Plan Presented for Approval', StepType: 'Plan', InputData: JSON.stringify({ plan: PLAN_TEXT }) }],
    'MJ: AI Agent Requests': [{ ...APPROVED, AgentID: MDA, OriginatingAgentRunID: R1, OriginatingAgentRunStepID: S1, OriginatingTaskID: null, ResponseSource: 'Dashboard', __mj_CreatedAt: '2026-11-26T09:01:00Z' }],
    'MJ: Record Changes': [change('Create', PERSON, REQUESTED, '2026-11-26T09:01:00Z'), change('Update', PERSON, APPROVED, '2026-11-26T09:05:00Z')],
    'MJ: ML Build Approval Claims': [],
  };
  perms = { 'MJ: ML Training Pipelines': { CanCreate: true }, 'MJ: ML Models': { CanCreate: true } };
}

/** The fake `RunView`: an entity's rows; for runs and steps, the one named by an `ID='…'` filter. */
function fakeRows(entityName: string, filter: string | undefined): Row[] {
  const rows = db[entityName] ?? [];
  const id = /\bID\s*=\s*'([^']+)'/i.exec(filter ?? '')?.[1];
  if ((entityName === 'MJ: AI Agent Runs' || entityName === 'MJ: AI Agent Run Steps') && id) return rows.filter((r) => String(r.ID).toUpperCase() === id.toUpperCase());
  return rows;
}

const users = new Map<string, UserInfo>();
function user(id: string, type: string): UserInfo {
  const u = { ID: id, Type: type, Name: id, Email: `${id}@example.com` } as unknown as UserInfo;
  users.set(id, u);
  return u;
}

const provider = {
  EntityByName: (name: string) => ({
    ID: name === 'MJ: AI Agent Requests' ? REQUEST_ENTITY_ID : name,
    Name: name,
    GetUserPermisions: () => ({ CanCreate: perms[name]?.CanCreate ?? false, CanRead: true }),
  }),
} as unknown as IMetadataProvider;

const run = { ID: R2, AgentID: MDA, LastRunID: R1, UserID: PERSON, ConversationDetailID: null } as unknown as MJAIAgentRunEntity;
const caller = user(PERSON, 'User');
user(OTHER, 'User');
user(SYSTEM, 'Owner');

beforeEach(() => {
  seed();
  const rv = {
    RunView: vi.fn(async (p: { EntityName: string; ExtraFilter?: string }) => ({ Success: true, Results: fakeRows(p.EntityName, p.ExtraFilter) })),
    RunViews: vi.fn(async (ps: { EntityName: string; ExtraFilter?: string }[]) => ps.map((p) => ({ Success: true, Results: fakeRows(p.EntityName, p.ExtraFilter) }))),
  };
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rv as unknown as RunView);
  vi.spyOn(UserCache.Instance, 'UserByID').mockImplementation((id: string) => users.get(id.toUpperCase()) ?? users.get(id));
  vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation((u: UserInfo) => u?.ID === SYSTEM);
});
afterEach(() => vi.restoreAllMocks());

const resolve = () => BuildApprovalResolver.Resolve(run, HASH, provider, caller);

describe('BuildApprovalResolver.Resolve — an approval that meets rules 1–5', () => {
  it('returns the BuildApproval: plan hash, plan id, the person, the request', async () => {
    const r = await resolve();
    expect(r).toEqual({
      planId: '9A000000-0000-4000-8000-000000000001', planHash: HASH, approvedBy: { kind: 'human', userId: PERSON },
      conversationDetailId: null, approvedAt: new Date('2026-11-26T09:05:00Z').toISOString(), requestId: Q1,
    });
  });

  it('no request in the session → no-request', async () => {
    db['MJ: AI Agent Requests'] = [];
    expect(await resolve()).toEqual({ kind: 'no-request' });
  });
});

describe('attack 1 (rule 1): a row the client created is refused', () => {
  it('a request naming no Plan Presented for Approval step of the run → not-agent-created', async () => {
    db['MJ: AI Agent Requests'][0].OriginatingAgentRunStepID = null;
    expect(await resolve()).toEqual({ kind: 'not-agent-created', requestId: Q1 });
  });
  it('a request naming another step of the run → not-agent-created', async () => {
    db['MJ: AI Agent Run Steps'][0].StepName = 'User Interaction';
    db['MJ: AI Agent Run Steps'][0].StepType = 'Chat';
    expect(await resolve()).toEqual({ kind: 'not-agent-created', requestId: Q1 });
  });
  it("a second, client-made request copying the Plan step's ID is not the agent's (it is not the step's first request)", async () => {
    const Q2 = 'D2000000-0000-4000-8000-000000000002';
    db['MJ: AI Agent Requests'].push({ ...db['MJ: AI Agent Requests'][0], ID: Q2, __mj_CreatedAt: '2026-11-26T09:03:00Z' });
    expect(await resolve()).toEqual({ kind: 'not-agent-created', requestId: Q2 });
  });
  it('a request whose originating run is not a run of the session (or not this agent) → not-agent-created', async () => {
    db['MJ: AI Agent Runs'][1].AgentID = 'A9999999-0000-4000-8000-000000000009';
    expect(await resolve()).toEqual({ kind: 'not-agent-created', requestId: Q1 });
  });
});

describe('the request must be Approved', () => {
  it.each(['Requested', 'Rejected', 'Responded', 'Canceled', 'Expired'] as const)('%s → not-approved', async (status) => {
    db['MJ: AI Agent Requests'][0].Status = status;
    expect(await resolve()).toEqual({ kind: 'not-approved', status });
  });
});

describe('attack 2 (rule 2): created Requested, answered by a separate save', () => {
  it('a row created already Approved → not-two-step', async () => {
    db['MJ: Record Changes'] = [change('Create', PERSON, APPROVED, '2026-11-26T09:01:00Z')];
    expect(await resolve()).toEqual({ kind: 'not-two-step', requestId: Q1 });
  });
  it('no Record Change of the create → not-two-step', async () => {
    db['MJ: Record Changes'] = [change('Update', PERSON, APPROVED, '2026-11-26T09:05:00Z')];
    expect(await resolve()).toEqual({ kind: 'not-two-step', requestId: Q1 });
  });
  it('a create that already carried a responder → not-two-step', async () => {
    db['MJ: Record Changes'][0] = change('Create', PERSON, { ...REQUESTED, ResponseByUserID: PERSON }, '2026-11-26T09:01:00Z');
    expect(await resolve()).toEqual({ kind: 'not-two-step', requestId: Q1 });
  });
});

describe('attack 3 (rule 3): the responder is the session person, never a key, the system user or an agent run', () => {
  it('(a, c) an answering save recorded with no responder (API key, an agent run) → not-human', async () => {
    db['MJ: Record Changes'][1] = change('Update', PERSON, { ...APPROVED, ResponseByUserID: null }, '2026-11-26T09:05:00Z');
    expect(await resolve()).toEqual({ kind: 'not-human', userId: PERSON });
  });
  it('(b) answered as the MJ system user → not-human', async () => {
    db['MJ: Record Changes'][1] = change('Update', SYSTEM, { ...APPROVED, ResponseByUserID: SYSTEM }, '2026-11-26T09:05:00Z');
    expect(await resolve()).toEqual({ kind: 'not-human', userId: SYSTEM });
  });
  it('(d) answered by a different person than RequestForUserID → not-human', async () => {
    db['MJ: Record Changes'][1] = change('Update', OTHER, { ...APPROVED, ResponseByUserID: OTHER }, '2026-11-26T09:05:00Z');
    expect(await resolve()).toEqual({ kind: 'not-human', userId: OTHER });
  });
  it("ResponseSource = 'Conversation' written by the client changes nothing", async () => {
    db['MJ: AI Agent Requests'][0].ResponseSource = 'Conversation';
    expect(await resolve()).toMatchObject({ requestId: Q1, approvedBy: { kind: 'human', userId: PERSON } });
    db['MJ: Record Changes'][1] = change('Update', OTHER, { ...APPROVED, ResponseByUserID: OTHER, ResponseSource: 'Conversation' }, '2026-11-26T09:05:00Z');
    expect(await resolve()).toEqual({ kind: 'not-human', userId: OTHER });
  });
});

describe('attack 4 (rule 4): the responder may build', () => {
  it('without CanCreate on MJ: ML Models → responder-not-permitted', async () => {
    perms['MJ: ML Models'].CanCreate = false;
    expect(await resolve()).toEqual({ kind: 'responder-not-permitted', userId: PERSON, entity: 'MJ: ML Models' });
  });
  it('without CanCreate on MJ: ML Training Pipelines → responder-not-permitted', async () => {
    perms['MJ: ML Training Pipelines'].CanCreate = false;
    expect(await resolve()).toEqual({ kind: 'responder-not-permitted', userId: PERSON, entity: 'MJ: ML Training Pipelines' });
  });
});

describe('attacks 5, 14, 20 (rule 5): the plan is the one approved', () => {
  it('attack 5: the payload changed after the approval → plan-changed', async () => {
    const changed = AgentControlPath.PlanHash({ ...PAYLOAD, TargetDefinition: { ...PAYLOAD.TargetDefinition, TargetVariable: 'Lapsed' } });
    expect(await BuildApprovalResolver.Resolve(run, changed, provider, caller)).toEqual({ kind: 'plan-changed', approvedHash: HASH, currentHash: changed });
  });
  it('attack 5: a new approval of the new hash builds', async () => {
    const newPayload = { ...PAYLOAD, TargetDefinition: { ...PAYLOAD.TargetDefinition, TargetVariable: 'Lapsed' } };
    const newHash = AgentControlPath.PlanHash(newPayload);
    db['MJ: AI Agent Runs'][1].FinalPayload = JSON.stringify({ ...newPayload, PlanHash: newHash, PlanId: 'P2' });
    expect(await BuildApprovalResolver.Resolve(run, newHash, provider, caller)).toMatchObject({ planHash: newHash, requestId: Q1 });
  });
  it('a presenting run with no stored PlanHash → plan-changed', async () => {
    db['MJ: AI Agent Runs'][1].FinalPayload = JSON.stringify(PAYLOAD);
    expect(await resolve()).toEqual({ kind: 'plan-changed', approvedHash: '', currentHash: HASH });
  });
  it('attack 14: an edited plan field with Approve → plan-edited', async () => {
    db['MJ: Record Changes'][1] = change('Update', PERSON, { ...APPROVED, ResponseData: JSON.stringify({ plan: `${PLAN_TEXT}\nand also Salary`, decision: 'approve' }) }, '2026-11-26T09:05:00Z');
    expect(await resolve()).toEqual({ kind: 'plan-edited', requestId: Q1 });
  });
  it('attack 20: RespondToAgentRequest with {"decision":"approve"} (no plan echoed) builds', async () => {
    db['MJ: Record Changes'][1] = change('Update', PERSON, { ...APPROVED, ResponseData: '{"decision":"approve"}' }, '2026-11-26T09:05:00Z');
    expect(await resolve()).toMatchObject({ requestId: Q1, planHash: HASH });
  });
});

describe('attack 7 (consumption): a claimed approval is consumed whatever the build did', () => {
  it.each(['claimed', 'built', 'failed'])('a claim row (%s) → consumed', async (outcome) => {
    db['MJ: ML Build Approval Claims'] = [{ ID: 'CL1', AgentRequestID: Q1, Outcome: outcome, ClaimingAgentRunID: R1, PlanHash: HASH }];
    expect(await resolve()).toEqual({ kind: 'consumed', claimId: 'CL1' });
  });
});

describe('attack 10: the approval is read from the answering save, not the current row', () => {
  it('a later save changing ResponseData or ResponseByUserID on the row does not change the approval', async () => {
    db['MJ: AI Agent Requests'][0].ResponseByUserID = OTHER;
    db['MJ: AI Agent Requests'][0].ResponseData = JSON.stringify({ plan: 'something else', decision: 'approve' });
    db['MJ: AI Agent Requests'][0].ResumingAgentRunID = R2;
    db['MJ: Record Changes'].push(change('Update', OTHER, { ...APPROVED, ResponseByUserID: OTHER }, '2026-11-26T09:09:00Z'));
    expect(await resolve()).toMatchObject({ requestId: Q1, approvedBy: { kind: 'human', userId: PERSON } });
  });
  it('a request flipped Approved → Requested → Approved is answered by the newest transition to Approved', async () => {
    db['MJ: Record Changes'].push(change('Update', PERSON, REQUESTED, '2026-11-26T09:06:00Z'));
    db['MJ: Record Changes'].push(change('Update', OTHER, { ...APPROVED, ResponseByUserID: OTHER }, '2026-11-26T09:07:00Z'));
    expect(await resolve()).toEqual({ kind: 'not-human', userId: OTHER });
  });
});

describe('attack 3 (a–c): the answering-save hook records a non-person answer to the agent\'s request as nobody\'s', () => {
  function requestEntity(over: { user: UserInfo; status?: string }): MJAIAgentRequestEntity {
    const e = Object.create(MJAIAgentRequestEntity.prototype) as MJAIAgentRequestEntity;
    const state = { AgentID: MDA, Status: over.status ?? 'Approved', ResponseByUserID: over.user.ID as string | null, OriginatingTaskID: null };
    Object.defineProperty(e, 'EntityInfo', { get: () => ({ Name: 'MJ: AI Agent Requests' }) });
    Object.defineProperty(e, 'AgentID', { get: () => state.AgentID });
    Object.defineProperty(e, 'Status', { get: () => state.Status });
    Object.defineProperty(e, 'OriginatingTaskID', { get: () => state.OriginatingTaskID });
    Object.defineProperty(e, 'ResponseByUserID', { get: () => state.ResponseByUserID, set: (v: string | null) => { state.ResponseByUserID = v; } });
    Object.defineProperty(e, 'ContextCurrentUser', { get: () => over.user });
    Object.defineProperty(e, 'IsSaved', { get: () => true });
    Object.defineProperty(e, 'GetFieldByName', { value: (n: string) => (n === 'Status' ? { OldValue: 'Requested', Value: state.Status } : undefined) });
    return e;
  }
  beforeEach(() => vi.spyOn(BuildApprovalResolver, 'IsOrchestratorAgent').mockImplementation((id: string) => id === MDA));

  it("a person's own client save keeps the responder", async () => {
    const e = requestEntity({ user: caller });
    const ok = await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => BuildApprovalResolver.CheckAnsweringSave(e as unknown as BaseEntity));
    expect(ok).toBe(true);
    expect(e.ResponseByUserID).toBe(PERSON);
  });
  it('(c) server code answering as the person (an agent run calling Update Record) → no responder', async () => {
    const e = requestEntity({ user: caller });
    expect(await BuildApprovalResolver.CheckAnsweringSave(e as unknown as BaseEntity)).toBe(true);
    expect(e.ResponseByUserID).toBeNull();
  });
  it('(a) an API-key session (its user carries the key\'s row-filter bindings) → no responder', async () => {
    const keyUser = { ...caller, APIKeyRowFilters: [] } as unknown as UserInfo;
    const e = requestEntity({ user: keyUser });
    await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => BuildApprovalResolver.CheckAnsweringSave(e as unknown as BaseEntity));
    expect(e.ResponseByUserID).toBeNull();
  });
  it('(b) the MJ system user → no responder', async () => {
    const e = requestEntity({ user: users.get(SYSTEM) as UserInfo });
    await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(() => BuildApprovalResolver.CheckAnsweringSave(e as unknown as BaseEntity));
    expect(e.ResponseByUserID).toBeNull();
  });
  it("another agent's request is not touched", async () => {
    vi.spyOn(BuildApprovalResolver, 'IsOrchestratorAgent').mockReturnValue(false);
    const e = requestEntity({ user: caller });
    await BuildApprovalResolver.CheckAnsweringSave(e as unknown as BaseEntity);
    expect(e.ResponseByUserID).toBe(PERSON);
  });
});
