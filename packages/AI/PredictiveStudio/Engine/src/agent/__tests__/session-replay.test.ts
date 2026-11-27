/**
 * A4 attacks 4 (a session across the approval boundary), 5 (replay), 7 (the small-data decline), 8 (a crash between
 * Append and effect) and 11 (liveness before recovery), driven through the orchestrator's control path.
 *
 * The orchestrator runs on its real control path and its real decision log; the framework (`BaseAgent.executeNextStep`)
 * is spied: it plays the prompt (a first turn ends with the plan as text), executes the code steps (the draft and
 * profile Actions return their recorded outputs, the Plan step ends the run awaiting the person, the Pipeline Builder
 * returns a built result). The log table is an in-memory fake with the migration's unique (`SessionRunID`, `Step`)
 * index, whose rows save through the guard; `RunView` answers the log, the prompt-run and the run reads from fakes.
 * Spied seams: the approval resolver (`Resolve`, `SessionRuns`), the claim (`Claim`, `Settle`), the plan validator and
 * the session lock's transaction and lock Query. Casts: the agent params, the run entity, the step bags and the fakes,
 * where they are handed over (their full types need a live agent run).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseAgent } from '@memberjunction/ai-agents';
import { EntityInfo, RunView, UserInfo, type BaseEntity, type IMetadataProvider } from '@memberjunction/core';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { MJAgentDecisionLogEntity, type MJAIAgentRunEntityExtended } from '@memberjunction/core-entities';
import type { AgentConfiguration, BaseAgentNextStep, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import type { BuildApproval, HoldoutSplit, ModelingPlanSpec, ProfileResult, ProtocolDraftMembers, UnitDraft } from '@memberjunction/predictive-studio-core';

import { PredictiveStudioModelDevAgent } from '../model-dev-orchestrator-agent';
import { AgentControlPath } from '../control-path';
import { AgentDecisionLog } from '../decision-log';
import { AgentSessionReplay, type ReplayResult } from '../session-replay';
import { AgentSessionLease } from '../agent-session-lease';
import { BuildApprovalClaims } from '../build-approval-claims';
import { BuildApprovalResolver } from '../build-approval-resolver';
import { PlanMetadataValidator } from '../plan-metadata-validator';
import { AgentReadScope } from '../agent-read-scope';
import { PublishLocks } from '../../registry/publish-locks';
import { ProviderTransactions } from '../../registry/provider-transactions';
import { DraftPredictionUnitAction } from '../../actions/draft-prediction-unit.action';
import { DraftEvaluationProtocolAction } from '../../actions/draft-evaluation-protocol.action';
import { TableDataAccess } from '../../__tests__/fakes/table-data-access';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import type { PredictiveStudioBuilderPayload } from '../pipeline-builder-agent';

// ---------------------------------------------------------------------------------------------------------------------
// The world: the years entity, a complete plan with the Goal Analyst's unit proposal, and its recorded drafts
// ---------------------------------------------------------------------------------------------------------------------

const YEARS = new EntityInfo({
  ID: '6A1D2E3F-0000-4000-8000-0000000A4401', Name: 'Years', SchemaName: 'pstest', BaseTable: 'Years', BaseView: 'vwYears',
  Fields: [
    { ID: '6A1D2E3F-0000-4000-8000-0000000A4411', Name: 'ID', Type: 'nvarchar', Length: 50, IsPrimaryKey: true, Sequence: 1 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A4412', Name: 'PersonID', Type: 'nvarchar', Length: 50, Sequence: 2 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A4413', Name: 'StartDate', Type: 'date', Sequence: 3 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A4414', Name: 'EventsAttended', Type: 'int', Sequence: 4 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A4415', Name: 'Region', Type: 'nvarchar', Length: 50, Sequence: 5 },
    { ID: '6A1D2E3F-0000-4000-8000-0000000A4416', Name: 'Renewed', Type: 'bit', Sequence: 6 },
  ],
});
const USER = new UserInfo(null, { ID: '6A1D2E3F-0000-4000-8000-0000000A4421', Name: 'person', Type: 'Owner' });
const NOW = new Date('2026-11-27T00:00:00Z');

const PROPOSAL: NonNullable<ModelingPlanSpec['TargetDefinition']['Unit']> = {
  DecisionDateColumn: 'StartDate', DecisionDateOffsetDays: 334, LabelWindowDays: 31, LabelGapDays: 0,
  Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'corpus-end', entity: 'Years', field: 'StartDate' } },
  TaskType: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 },
};

function plan(goal = 'Predict renewal of yearly memberships'): ModelingPlanSpec {
  return {
    Goal: goal,
    TargetDefinition: { EntityName: 'Years', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC', Unit: PROPOSAL, Protocol: { seed: 7 } },
    CandidateSources: [{ Kind: 'Entity', Ref: 'Years', Why: 'the rows' }],
    CandidateFeatures: [{ Name: 'EventsAttended', SourceRef: 'Years', Kind: 'numeric', Why: 'engagement' }],
    LeakageNotes: [],
    ProposedExperiments: [{ Label: 'lr', AlgorithmName: 'logistic_regression', FeatureSet: ['EventsAttended'], Rationale: 'baseline', Priority: 1 }],
    ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 }, ProposedBudget: {},
  };
}

let unitDraft: UnitDraft;
let protocolDraft: ProtocolDraftMembers;

async function recordDrafts(): Promise<void> {
  const unit = await DraftPredictionUnitAction.Draft(plan().TargetDefinition, {
    Provider: new EntitiesOnlyProvider([YEARS], USER),
    ReadDevelopmentRows: (d) => AgentReadScope.DevelopmentRowsWith(d, { DataAccess: new TableDataAccess(UnitYearsWorld.Tables()), Metadata: UnitYearsWorld.Metadata(), Now: NOW }),
  });
  if (unit.Kind !== 'draft') throw new Error(`the years unit does not draft: ${JSON.stringify(unit.Refusal)}`);
  unitDraft = unit.Draft;
  const holdout: HoldoutSplit = { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2025-12-01', holdoutEnd: null, newEntityReport: null };
  const protocol = await DraftEvaluationProtocolAction.Draft({ seed: 7 }, unitDraft, { DefaultHoldout: async () => holdout });
  if (protocol.Kind !== 'draft') throw new Error(`the years protocol does not draft: ${JSON.stringify(protocol.Refusal)}`);
  protocolDraft = protocol.Draft;
}

/** The profile the Action records: enough rows and signal (W1-like), or W7-small-imbalanced s42's counts. */
function profileResult(kind: 'signal' | 'w7-small'): ProfileResult {
  const glm = { metric: 'log-loss' as const, value: 0.08, interval: { level: 0.95, lower: 0.05, upper: 0.11 }, n: 2400 };
  if (kind === 'signal') {
    return {
      resolvedRows: 2400, minorityRows: 480, classCounts: { '0': 480, '1': 1920 },
      fields: [{ name: 'EventsAttended', improvement: glm, nearUnique: false, leakSuspect: false }], leakSuspects: [],
      glmVsDummy: glm, computeSeconds: 1.5, holdoutRowsRead: 0, holdoutRowsExcluded: 600, verdict: null,
    };
  }
  return {
    resolvedRows: 301, minorityRows: 24, classCounts: { '0': 277, '1': 24 }, fields: [], leakSuspects: [],
    glmVsDummy: null, computeSeconds: 0, holdoutRowsRead: 0, holdoutRowsExcluded: 75,
    verdict: { kind: 'small-data', resolvedRows: 301, minorityRows: 24, minResolved: 200, minMinority: 50 },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The fakes: the log table, prompt runs, claims and runs
// ---------------------------------------------------------------------------------------------------------------------

type Decision = MJAgentDecisionLogEntity['Decision'];
interface Stored {
  ID: string; SessionRunID: string; AgentRunID: string; AgentRunStepID: string | null; Step: number; Decision: Decision;
  PromptRunID: string | null; ToolCalls: string; PayloadHash: string; ResultingPayloadHash: string; Rationale: string; Replay: string;
  BuildApprovalRequestID: string | null;
}
interface PromptRunRow { ID: string; PromptID: string; Messages: string; Temperature: number | null; Seed: number | null; ModelID: string; VendorID: string; RunAt: string }
interface RunRow { ID: string; ParentRunID: string | null; Status: string; StartedAt: string; LastHeartbeatAt: string | null; LastRunID: string | null; Agent: string; FinalPayload: string | null }
interface ClaimRow { ID: string; AgentRequestID: string; ClaimingAgentRunID: string; PlanHash: string; Outcome: 'claimed' | 'built' | 'failed'; MLTrainingPipelineID: string | null; ClaimedAt: Date }

let table: Stored[];
let promptRuns: PromptRunRow[];
let runs: RunRow[];
let claims: ClaimRow[];
let nextId: number;
let builds: number;

function logRow(): MJAgentDecisionLogEntity {
  const e = Object.create(MJAgentDecisionLogEntity.prototype) as MJAgentDecisionLogEntity;
  const values: Stored = {
    ID: '', SessionRunID: '', AgentRunID: '', AgentRunStepID: null, Step: 0, Decision: 'report', PromptRunID: null,
    ToolCalls: '[]', PayloadHash: '', ResultingPayloadHash: '', Rationale: '', Replay: '{}', BuildApprovalRequestID: null,
  };
  let saved = false;
  let lastMessage = '';
  for (const f of Object.keys(values) as (keyof Stored)[]) {
    Object.defineProperty(e, f, { get: () => values[f], set: (v: never) => { values[f] = v; }, configurable: true });
  }
  Object.defineProperty(e, 'EntityInfo', { get: () => ({ Name: 'MJ: Agent Decision Log' }) });
  Object.defineProperty(e, 'IsSaved', { get: () => saved });
  Object.defineProperty(e, 'NewRecord', { value: () => true });
  Object.defineProperty(e, 'LatestResult', { get: () => ({ CompleteMessage: lastMessage }) });
  Object.defineProperty(e, 'Save', {
    value: async () => {
      const verdict = AgentDecisionLog.CheckSave(e as unknown as BaseEntity);
      if (verdict !== true) { lastMessage = String(verdict); return false; }
      if (table.some((r) => r.SessionRunID === values.SessionRunID && r.Step === values.Step)) { lastMessage = 'duplicate (SessionRunID, Step)'; return false; }
      values.ID = `DL${nextId++}`;
      table.push({ ...values });
      saved = true;
      return true;
    },
  });
  return e;
}

function claimRow(): { Load: (id: string) => Promise<boolean> } & Partial<ClaimRow> {
  const holder: { Load: (id: string) => Promise<boolean> } & Partial<ClaimRow> = {
    Load: async (id: string) => {
      const c = claims.find((x) => x.ID === id);
      if (!c) return false;
      Object.assign(holder, c);
      return true;
    },
  };
  return holder;
}

const provider = {
  GetEntityObject: vi.fn(async (name: string) => (name === AgentDecisionLog.EntityName ? logRow() : claimRow())),
  Entities: [YEARS],
  EntityByName: (n: string) => (n.toLowerCase() === 'years' ? YEARS : undefined),
} as unknown as IMetadataProvider;

type ViewParams = { EntityName?: string; ExtraFilter?: string; OrderBy?: string; MaxRows?: number };

function idsIn(filter: string, column: string): string[] | undefined {
  const m = new RegExp(`${column}\\s+IN\\s*\\(([^)]*)\\)`, 'i').exec(filter);
  return m?.[1].split(',').map((s) => s.trim().replace(/'/g, '').toUpperCase());
}
function eq(filter: string, column: string): string | undefined {
  return new RegExp(`(?:^|[^A-Za-z])${column}\\s*=\\s*'([^']+)'`, 'i').exec(filter)?.[1]?.toUpperCase();
}

/** Every read the orchestrator, the log and replay make, answered from the fakes. */
function answer(p: ViewParams): { Success: boolean; Results: object[]; ErrorMessage?: string } {
  const f = p.ExtraFilter ?? '';
  switch (p.EntityName) {
    case 'MJ: Agent Decision Log': {
      const session = eq(f, 'SessionRunID');
      const byRuns = idsIn(f, 'AgentRunID');
      let rows = table.filter((r) => (session === undefined || r.SessionRunID === session) && (byRuns === undefined || byRuns.includes(r.AgentRunID)));
      rows = [...rows].sort((a, b) => (/DESC/i.test(p.OrderBy ?? '') ? b.Step - a.Step : a.Step - b.Step));
      return { Success: true, Results: p.MaxRows ? rows.slice(0, p.MaxRows) : rows };
    }
    case 'MJ: AI Prompt Runs': {
      const ids = idsIn(f, 'ID') ?? (eq(f, 'ID') ? [eq(f, 'ID') ?? ''] : undefined);
      return { Success: true, Results: promptRuns.filter((r) => ids === undefined || ids.some((id) => id.toUpperCase() === r.ID.toUpperCase())) };
    }
    case 'MJ: AI Agent Run Steps': {
      const ids = idsIn(f, 'AgentRunID') ?? [];
      return { Success: true, Results: promptRuns.filter((r) => ids.includes(runOfPrompt(r.ID))).map((r) => ({ StepType: 'Prompt', TargetLogID: r.ID, StartedAt: r.RunAt, AgentRunID: runOfPrompt(r.ID) })) };
    }
    case 'MJ: AI Agent Runs': {
      const parents = idsIn(f, 'ParentRunID');
      if (parents) return { Success: true, Results: runs.filter((r) => r.ParentRunID !== null && parents.includes(r.ParentRunID)) };
      const running = /Status\s*=\s*'Running'/i.test(f);
      const ids = idsIn(f, 'ID') ?? [];
      const id = eq(f, 'ID');
      const parent = eq(f, 'ParentRunID');
      const rows = runs.filter((r) => (!running || r.Status === 'Running') && (ids.includes(r.ID) || (r.LastRunID !== null && ids.includes(r.LastRunID)) || r.ID === id || (parent !== undefined && r.ParentRunID === parent)));
      return { Success: true, Results: rows };
    }
    case 'MJ: AI Model Vendors':
      return { Success: true, Results: [{ APIName: 'gemini-4-hydrogen' }] };
    default:
      return { Success: true, Results: [] };
  }
}

/** Which run a prompt run belongs to: `PR-<run>-<n>`. */
function runOfPrompt(promptRunId: string): string {
  return promptRunId.split('-')[1] ?? '';
}

// ---------------------------------------------------------------------------------------------------------------------
// The orchestrator under test and the framework that executes its steps
// ---------------------------------------------------------------------------------------------------------------------

class TestOrchestrator extends PredictiveStudioModelDevAgent {
  constructor(private readonly runRow: { ID: string; LastRunID: string | null }) {
    super();
  }
  public override get AgentRun(): MJAIAgentRunEntityExtended | null {
    return { ID: this.runRow.ID, LastRunID: this.runRow.LastRunID, Status: 'Running', StartedAt: NOW } as unknown as MJAIAgentRunEntityExtended;
  }
  protected override get CurrentRunID(): string {
    return this.runRow.ID;
  }
  protected override get ProviderToUse(): IMetadataProvider {
    return provider;
  }
  protected override async CancelPromptRaisedRequests(): Promise<void> {
    /* no requests in the fake */
  }
  public Next(params: ExecuteAgentParams, previous: BaseAgentNextStep | null): Promise<BaseAgentNextStep> {
    return this.executeNextStep(params, {} as AgentConfiguration, previous, 1);
  }
}

/** The profile output the fake framework returns for the Profile Prediction Target Action. */
let profileOutput: ProfileResult;
/** Called with each step the framework executes; returning false stops the run there (a crash). */
let crashBefore: ((step: BaseAgentNextStep) => boolean) | null;

function actionResult(name: string): object {
  const p = (Name: string, Value: string): object => ({ Name, Value });
  if (name === 'Draft Prediction Unit') return { actionName: name, success: true, message: 'drafted', params: [p('UnitDraft', JSON.stringify(unitDraft)), p('HoldoutRowsRead', '0')] };
  if (name === 'Draft Evaluation Protocol') return { actionName: name, success: true, message: 'drafted', params: [p('ProtocolDraft', JSON.stringify(protocolDraft)), p('HoldoutRowsRead', '0')] };
  if (name === 'Profile Prediction Target') {
    const params = [p('ProfileResult', JSON.stringify(profileOutput)), p('HoldoutRowsRead', '0')];
    if (profileOutput.verdict) params.push(p('Refusal', JSON.stringify(profileOutput.verdict)));
    return { actionName: name, success: true, message: 'profiled', params };
  }
  return { actionName: name, success: false, message: 'unknown action', params: [] };
}

function payloadOf(step: BaseAgentNextStep | null, params: ExecuteAgentParams): PredictiveStudioBuilderPayload {
  return (step?.newPayload ?? step?.previousPayload ?? params.payload) as PredictiveStudioBuilderPayload;
}

/** The framework: the prompt of a first or Retry turn, and each code step's execution. */
function framework(params: ExecuteAgentParams, step: BaseAgentNextStep | null, resumed: boolean): BaseAgentNextStep {
  const payload = payloadOf(step, params);
  if (step === null) return resumed ? { step: 'Retry', terminate: false, newPayload: payload } as BaseAgentNextStep : { step: 'Success', terminate: true, message: 'Here is the plan.', newPayload: payload } as BaseAgentNextStep;
  if (step.step === 'Actions') return { step: 'Retry', terminate: false, previousPayload: payload, newPayload: payload, priorStepResult: [actionResult(step.actions?.[0]?.name ?? '')] } as BaseAgentNextStep;
  if (String(step.step) === 'Plan') return { step: 'Chat', terminate: true, message: step.message, newPayload: payload } as BaseAgentNextStep;
  if (step.step === 'Sub-Agent' && step.subAgent?.name === 'Pipeline Builder') {
    builds++;
    return { step: 'Retry', terminate: false, newPayload: { ...payload, BuildResult: { success: true, pipelineId: 'PL1' } } } as BaseAgentNextStep;
  }
  if (step.step === 'Retry') return { step: 'Success', terminate: true, message: 'The build finished; see the results.', newPayload: payload } as BaseAgentNextStep;
  return { step: 'Chat', terminate: true, message: 'framework', newPayload: payload } as BaseAgentNextStep;
}

function params(payload: PredictiveStudioBuilderPayload): ExecuteAgentParams {
  return { payload, conversationMessages: [{ role: 'user', content: 'go' }], contextUser: USER, agent: { ID: 'MDA', Name: 'Model Development Agent' } } as unknown as ExecuteAgentParams;
}

interface RunOutcome {
  readonly Final: BaseAgentNextStep;
  /** The payload the run saved: its last step's (the step before a crash, when it crashed). */
  readonly Saved: PredictiveStudioBuilderPayload;
  readonly Crashed: boolean;
}

let superNext: ReturnType<typeof vi.spyOn>;
let resumedRun = false;

/** Drives one run to its terminal step (or to a crash), as the framework's loop does. */
async function drive(runId: string, lastRunId: string | null, payload: PredictiveStudioBuilderPayload): Promise<RunOutcome> {
  runs.push({ ID: runId, ParentRunID: null, Status: 'Running', StartedAt: NOW.toISOString(), LastHeartbeatAt: null, LastRunID: lastRunId, Agent: 'Model Development Agent', FinalPayload: null });
  promptRuns.push({ ID: `PR-${runId}-1`, PromptID: 'PROMPT-ORCH', Messages: `[{"role":"user","content":"turn of ${runId}"}]`, Temperature: 0.2, Seed: 7, ModelID: 'M1', VendorID: 'V1', RunAt: NOW.toISOString() });
  resumedRun = lastRunId !== null && payload.PlanHash !== undefined;
  const o = new TestOrchestrator({ ID: runId, LastRunID: lastRunId });
  const p = params(payload);
  let saved = payload;
  let step = await o.Next(p, null);
  for (let i = 0; i < 40 && !step.terminate; i++) {
    if (crashBefore && !crashBefore(step)) {
      const row = runs.find((r) => r.ID === runId);
      if (row) row.Status = 'Failed';
      return { Final: step, Saved: saved, Crashed: true };
    }
    saved = payloadOf(step, p);
    step = await o.Next(p, step);
  }
  const row = runs.find((r) => r.ID === runId);
  if (row) { row.Status = 'Completed'; row.FinalPayload = JSON.stringify(payloadOf(step, p)); }
  return { Final: step, Saved: payloadOf(step, p), Crashed: false };
}

const sessionChain = (runId: string): string[] => {
  const chain = [runId];
  let next = runs.find((r) => r.ID === runId)?.LastRunID ?? null;
  while (next) { chain.push(next); next = runs.find((r) => r.ID === next)?.LastRunID ?? null; }
  return chain;
};

let approval: BuildApproval | null;

beforeEach(async () => {
  table = []; promptRuns = []; runs = []; claims = []; nextId = 1; builds = 0; crashBefore = null; approval = null;
  profileOutput = profileResult('signal');
  await recordDrafts();
  AgentDecisionLog.Register();
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
    RunView: vi.fn(async (p: ViewParams) => answer(p)),
    RunViews: vi.fn(async (ps: ViewParams[]) => ps.map((p) => answer(p))),
  } as unknown as RunView);
  superNext = vi.spyOn(BaseAgent.prototype as unknown as { executeNextStep: (...a: unknown[]) => Promise<BaseAgentNextStep> }, 'executeNextStep')
    .mockImplementation(async (...a: unknown[]) => framework(a[0] as ExecuteAgentParams, a[2] as BaseAgentNextStep | null, resumedRun));
  vi.spyOn(BaseAgent.prototype as unknown as { checkTreeBudgetLimit: () => { exceeded: boolean } }, 'checkTreeBudgetLimit').mockReturnValue({ exceeded: false });
  vi.spyOn(BuildApprovalResolver, 'SessionRuns').mockImplementation(async (r) => sessionChain(r.ID).map((id) => ({ ID: id }) as never));
  vi.spyOn(BuildApprovalResolver, 'Resolve').mockImplementation(async (r, hash) => {
    if (!r.LastRunID) return { kind: 'no-request' };
    const consumed = claims[0];
    if (consumed) return { kind: 'consumed', claimId: consumed.ID };
    return approval && approval.planHash === hash ? approval : { kind: 'no-request' };
  });
  vi.spyOn(BuildApprovalClaims, 'Claim').mockImplementation(async (requestId, runId, planHash) => {
    const c: ClaimRow = { ID: `CL${claims.length + 1}`, AgentRequestID: requestId, ClaimingAgentRunID: runId, PlanHash: planHash, Outcome: 'claimed', MLTrainingPipelineID: null, ClaimedAt: NOW };
    claims.push(c);
    return { Claimed: true, ClaimID: c.ID };
  });
  vi.spyOn(BuildApprovalClaims, 'Settle').mockImplementation(async (id, outcome, pipeline) => {
    const c = claims.find((x) => x.ID === id);
    if (c) { c.Outcome = outcome; c.MLTrainingPipelineID = pipeline; }
  });
  vi.spyOn(PlanMetadataValidator, 'Validate').mockReturnValue([]);
  vi.spyOn(PlanMetadataValidator, 'ValidateFeaturePipelines').mockResolvedValue([]);
  vi.spyOn(ProviderTransactions, 'Run').mockImplementation(async (_ctx, _op, work) => work());
  vi.spyOn(PublishLocks, 'Acquire').mockResolvedValue({ Acquired: true, Rows: [{ DbNow: NOW.toISOString() }] } as never);
});
afterEach(() => vi.restoreAllMocks());

const decisions = (): string[] => table.map((r) => `${r.Step}:${r.Decision}`);
const approve = (presented: PredictiveStudioBuilderPayload): void => {
  approval = { planId: presented.PlanId ?? 'P1', planHash: AgentControlPath.PlanHash(presented), approvedBy: { kind: 'human', userId: USER.ID }, conversationDetailId: null, approvedAt: NOW.toISOString(), requestId: 'REQ1' };
};

/** Run 1 presents the plan; the person approves; run 2 (resumed) builds and reports. */
async function sessionAcrossApproval(): Promise<{ run1: RunOutcome; run2: RunOutcome }> {
  const run1 = await drive('RUN1', null, plan());
  approve(run1.Saved);
  const run2 = await drive('RUN2', 'RUN1', run1.Saved);
  return { run1, run2 };
}

// ---------------------------------------------------------------------------------------------------------------------

describe('A4 attack 4: one C1 session spanning the approval boundary', () => {
  it('every control-path transition writes one row, all with run 1\'s SessionRunID, Step 1…n contiguous, each PayloadHash the previous ResultingPayloadHash', async () => {
    const { run1, run2 } = await sessionAcrossApproval();
    expect(String(run1.Final.step)).toBe('Chat');
    expect(builds).toBe(1);
    expect(run2.Final.terminate).toBe(true);
    expect(decisions()).toEqual(['1:draft-unit', '2:profile', '3:draft-protocol', '4:present-plan', '5:request-build', '6:report']);
    expect(new Set(table.map((r) => r.SessionRunID))).toEqual(new Set(['RUN1']));
    expect(table.filter((r) => r.AgentRunID === 'RUN2').map((r) => r.Decision)).toEqual(['request-build', 'report']);
    for (let i = 1; i < table.length; i++) expect(table[i].PayloadHash).toBe(table[i - 1].ResultingPayloadHash);
  });

  it('the present-plan row carries the presented plan hash and the request-build row the claim and the approved request', async () => {
    const { run1 } = await sessionAcrossApproval();
    const present = table.find((r) => r.Decision === 'present-plan');
    expect(present?.ResultingPayloadHash).toBe(run1.Saved.PlanHash);
    const build = table.find((r) => r.Decision === 'request-build');
    expect(build?.BuildApprovalRequestID).toBe('REQ1');
    expect(build?.ToolCalls).toContain('CL1');
  });

  it('each row is appended before its effect: the build is dispatched only after the request-build row exists', async () => {
    let rowsAtDispatch = -1;
    superNext.mockImplementation(async (...a: unknown[]) => {
      const step = a[2] as BaseAgentNextStep | null;
      if (step?.step === 'Sub-Agent') rowsAtDispatch = table.filter((r) => r.Decision === 'request-build').length;
      return framework(a[0] as ExecuteAgentParams, step, resumedRun);
    });
    await sessionAcrossApproval();
    expect(rowsAtDispatch).toBe(1);
  });

  it('a new modeling request after report in the same conversation starts a new SessionRunID', async () => {
    const { run2 } = await sessionAcrossApproval();
    await drive('RUN3', 'RUN2', { ...plan('Predict event attendance next year'), PlanHash: run2.Saved.PlanHash });
    const run3Rows = table.filter((r) => r.AgentRunID === 'RUN3');
    expect(run3Rows.length).toBeGreaterThan(0);
    expect(new Set(run3Rows.map((r) => r.SessionRunID))).toEqual(new Set(['RUN3']));
    expect(run3Rows[0].Step).toBe(1);
  });
});

describe('A4 attack 5: AgentSessionReplay.Replay re-executes a session from the log with no LLM call', () => {
  it('reproduces the last ResultingPayloadHash with 0 new prompt runs and no framework call', async () => {
    await sessionAcrossApproval();
    const promptRunsBefore = promptRuns.length;
    const calls = superNext.mock.calls.length;
    const replayed: ReplayResult = await AgentSessionReplay.Replay('RUN1', provider, USER);
    expect(replayed).toEqual({ planHash: table[table.length - 1].ResultingPayloadHash, steps: table.length });
    expect(promptRuns.length).toBe(promptRunsBefore);
    expect(superNext.mock.calls.length).toBe(calls);
  });

  it('the first row records the prompt result the plan came from (its PromptRunID)', async () => {
    await sessionAcrossApproval();
    expect(table[0].PromptRunID).toBe('PR-RUN1-1');
  });

  it('with one logged PromptRunID deleted from a copy → replay-incomplete naming it', async () => {
    await sessionAcrossApproval();
    const rows = await AgentDecisionLog.Rows('RUN1', provider, USER);
    promptRuns = promptRuns.filter((r) => r.ID !== 'PR-RUN1-1');
    expect(await AgentSessionReplay.ReplayRows(rows, provider, USER)).toEqual({ kind: 'replay-incomplete', missingPromptRunIds: ['PR-RUN1-1'] });
  });

  it('a copy whose recorded tool result no longer reproduces the logged hash → replay-incomplete (the hash is compared at every step)', async () => {
    await sessionAcrossApproval();
    const rows = await AgentDecisionLog.Rows('RUN1', provider, USER);
    const tampered = rows.map((r) => (r.Decision === 'draft-unit'
      ? { ...r, ToolCalls: r.ToolCalls.map((c) => (c.action === 'Draft Prediction Unit' ? { ...c, result: { UnitDraft: { ...unitDraft, Name: 'edited after the fact' } } } : c)) }
      : r));
    const result = await AgentSessionReplay.ReplayRows(tampered, provider, USER);
    expect('kind' in result && result.kind).toBe('replay-incomplete');
  });

  it('Rebuild returns the payload the log reproduces: the drafts, their input hashes and the presented plan hash', async () => {
    const { run1 } = await sessionAcrossApproval();
    const rebuilt = await AgentSessionReplay.Rebuild('RUN1', provider, USER);
    if ('kind' in rebuilt) throw new Error(`rebuild refused: ${JSON.stringify(rebuilt)}`);
    expect(rebuilt.Payload.UnitDraft).toEqual(run1.Saved.UnitDraft);
    expect(rebuilt.Payload.ProtocolDraft).toEqual(run1.Saved.ProtocolDraft);
    expect(rebuilt.Payload.DraftInputs).toEqual(run1.Saved.DraftInputs);
    expect(rebuilt.Payload.PlanHash).toBe(run1.Saved.PlanHash);
    expect(rebuilt.PlanHash).toBe(table[table.length - 1].ResultingPayloadHash);
  });
});

describe('A4 attack 7: a W7 s42 session ends decline-small-data (the fixed refusal)', () => {
  it('ends decline-small-data with the counts on the decision row; no plan presented, no build', async () => {
    profileOutput = profileResult('w7-small');
    const r = await drive('RUN1', null, plan());
    expect(decisions()).toEqual(['1:draft-unit', '2:profile', '3:decline-small-data']);
    const decline = table[2];
    expect(decline.ToolCalls).toContain('"resolvedRows":301');
    expect(decline.ToolCalls).toContain('"minorityRows":24');
    expect(decline.Rationale).toMatch(/301/);
    expect(r.Final.terminate).toBe(true);
    expect(String(r.Final.step)).not.toBe('Plan');
    expect(r.Final.message).toMatch(/301/);
    expect(r.Final.message).toMatch(/24/);
    expect(superNext.mock.calls.some((c) => String((c[2] as BaseAgentNextStep | null)?.step) === 'Plan')).toBe(false);
    expect(BuildApprovalClaims.Claim).not.toHaveBeenCalled();
    expect(builds).toBe(0);
  });

  it('a no-usable-signal verdict ends decline-no-signal with the improvement on the row', async () => {
    const improvement = { metric: 'log-loss' as const, value: 0.004, interval: { level: 0.95, lower: -0.01, upper: 0.02 }, n: 2400 };
    profileOutput = { ...profileResult('signal'), glmVsDummy: improvement, verdict: { kind: 'no-usable-signal', improvement } };
    await drive('RUN1', null, plan());
    expect(decisions()).toEqual(['1:draft-unit', '2:profile', '3:decline-no-signal']);
    expect(table[2].ToolCalls).toContain('"lower":-0.01');
  });
});

describe('A4 attack 8: a crash between Append and its effect (F-014, F-020)', () => {
  it('killed after the draft-protocol row, before the payload was saved: the next turn rebuilds it by replay and continues at validate-plan', async () => {
    crashBefore = (step) => !(step.step === 'Retry' && table.some((r) => r.Decision === 'draft-protocol'));
    const crashed = await drive('RUN1', null, plan());
    expect(crashed.Crashed).toBe(true);
    expect(crashed.Saved.ProtocolDraft).toBeUndefined();
    crashBefore = null;
    const rebuild = vi.spyOn(AgentSessionReplay, 'Rebuild');
    await drive('RUN2', 'RUN1', crashed.Saved);
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(decisions()).toEqual(['1:draft-unit', '2:profile', '3:draft-protocol', '4:present-plan']);
    expect(new Set(table.map((r) => r.SessionRunID))).toEqual(new Set(['RUN1']));
    for (let i = 1; i < table.length; i++) expect(table[i].PayloadHash).toBe(table[i - 1].ResultingPayloadHash);
  });

  it('killed after a request-build row and its claim, before the builder settles → the next turn reports an unfinished build, 0 builds', async () => {
    const run1 = await drive('RUN1', null, plan());
    approve(run1.Saved);
    crashBefore = (step) => !(step.step === 'Sub-Agent' && step.subAgent?.name === 'Pipeline Builder');
    const crashed = await drive('RUN2', 'RUN1', run1.Saved);
    expect(crashed.Crashed).toBe(true);
    expect(builds).toBe(0);
    crashBefore = null;
    const after = await drive('RUN3', 'RUN2', crashed.Saved);
    expect(after.Final.message).toMatch(/did not finish/);
    expect(builds).toBe(0);
    expect(BuildApprovalClaims.Claim).toHaveBeenCalledTimes(1);
    expect(decisions()).toEqual(['1:draft-unit', '2:profile', '3:draft-protocol', '4:present-plan', '5:request-build', '6:report']);
    expect(table[5].Rationale).toMatch(/did not finish/);
  });

  it('killed after the claim and before the request-build row → a report row "the build did not start", 0 builds, never a second claim', async () => {
    const run1 = await drive('RUN1', null, plan());
    approve(run1.Saved);
    const append = AgentDecisionLog.Append.bind(AgentDecisionLog);
    vi.spyOn(AgentDecisionLog, 'Append').mockImplementation(async (entry, p, u) => {
      if (entry.decision === 'request-build') throw new Error('MJAPI was killed');
      return append(entry, p, u);
    });
    await drive('RUN2', 'RUN1', run1.Saved).catch(() => undefined);
    const row = runs.find((r) => r.ID === 'RUN2');
    if (row) row.Status = 'Failed';
    vi.mocked(AgentDecisionLog.Append).mockRestore();
    const after = await drive('RUN3', 'RUN2', run1.Saved);
    expect(after.Final.message).toMatch(/did not start/);
    expect(builds).toBe(0);
    expect(BuildApprovalClaims.Claim).toHaveBeenCalledTimes(1);
    expect(decisions()).toEqual(['1:draft-unit', '2:profile', '3:draft-protocol', '4:present-plan', '5:report']);
    expect(table[4].Rationale).toMatch(/did not start/);
  });
});

describe('A4 attack 11: liveness before recovery (D5-38, D5-43)', () => {
  async function crashedAfterProtocol(): Promise<PredictiveStudioBuilderPayload> {
    crashBefore = (step) => !(step.step === 'Retry' && table.some((r) => r.Decision === 'draft-protocol'));
    const crashed = await drive('RUN1', null, plan());
    crashBefore = null;
    return crashed.Saved;
  }

  beforeEach(() => {
    // The real session lock: its transaction and lock Query are faked, liveness is AgentSessionLease's own.
    vi.mocked(ProviderTransactions.Run).mockImplementation(async (_ctx, _op, work) => work());
  });

  it("a run continuing a session whose other run is live (heartbeat 30 s old) never rebuilds the payload", async () => {
    const stale = await crashedAfterProtocol();
    const heartbeat = new Date(NOW.getTime() - 30_000).toISOString();
    runs.push({ ID: 'RUN1B', ParentRunID: null, Status: 'Running', StartedAt: new Date(NOW.getTime() - 60_000).toISOString(), LastHeartbeatAt: heartbeat, LastRunID: 'RUN1', Agent: 'Model Development Agent', FinalPayload: null });
    const rebuild = vi.spyOn(AgentSessionReplay, 'Rebuild');
    const busy = await drive('RUN2', 'RUN1', stale);
    expect(rebuild).not.toHaveBeenCalled();
    expect(busy.Final.message).toMatch(/RUN1B/);
    expect(decisions()).toEqual(['1:draft-unit', '2:profile', '3:draft-protocol']);
  });

  it("one whose other run's heartbeat is 11 min old and Failed does rebuild it", async () => {
    const stale = await crashedAfterProtocol();
    const heartbeat = new Date(NOW.getTime() - 11 * 60_000).toISOString();
    runs.push({ ID: 'RUN1B', ParentRunID: null, Status: 'Failed', StartedAt: new Date(NOW.getTime() - 12 * 60_000).toISOString(), LastHeartbeatAt: heartbeat, LastRunID: 'RUN1', Agent: 'Model Development Agent', FinalPayload: null });
    const rebuild = vi.spyOn(AgentSessionReplay, 'Rebuild');
    await drive('RUN2', 'RUN1', stale);
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(decisions()).toEqual(['1:draft-unit', '2:profile', '3:draft-protocol', '4:present-plan']);
  });

  it('after a refused interleaved append, replay still reproduces the chain', async () => {
    await sessionAcrossApproval();
    const before = await AgentSessionReplay.Replay('RUN1', provider, USER);
    const refused = await AgentDecisionLog.Append({
      sessionRunId: 'RUN1', agentRunId: 'RUN9', agentRunStepId: null, step: table.length + 1, decision: 'present-plan',
      inputs: { promptRunId: null, toolCalls: [], payloadHash: 'f'.repeat(64) }, resultingPayloadHash: 'f'.repeat(64),
      rationale: 'a run that read another payload', replay: { promptId: null, promptVersionHash: null, parameters: null }, buildApprovalRequestId: null,
    }, provider, USER);
    expect(refused).toEqual({ kind: 'log-diverged', newestStep: 6 });
    expect(await AgentSessionReplay.Replay('RUN1', provider, USER)).toEqual(before);
  });
});
