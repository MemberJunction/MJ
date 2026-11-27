/**
 * A6 attack 3 (the report half): `RunCostReport.Of(agentRunId)` is the session's real `RunCost` (§3.3, §5.1.7) — tokens
 * = the agent run tree's `TotalTokensUsed` (the root row's: it already holds its sub-agents') + the tokens its training
 * runs recorded; usd = the tree's prompt `Cost` + the compute cost its training runs recorded; computeSeconds the runs'
 * seconds; budget the session's (the agent's token cap, the protocol's compute and candidate bounds, D5-A6-2);
 * stoppedByBudget when a run step tripped a guardrail or a trainer stopped on its budget. A session's training runs are
 * those of the pipelines its build claims named and of the iterations of the experiment sessions it ran.
 *
 * `RunView` is spied, answering each entity's read from in-memory tables; the provider is a stand-in never called.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunView, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { RunCostReport } from '../run-cost';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';
import { ProtocolRowFixture } from '../../training/__tests__/fixtures/protocol-row';

interface ViewParams { readonly EntityName?: string; readonly ExtraFilter?: string }
interface AgentRunRow { ID: string; AgentID: string; ParentRunID: string | null; TotalTokensUsed: number | null; TotalCost: number | null }
interface TrainingRunRow { ID: string; PipelineID: string; ExperimentSessionIterationID: string | null; ComputeSeconds: number | null; ComputeCost: number | null; TokensUsed: number | null; ValidationResults: string | null }
interface Tables {
  runs: AgentRunRow[];
  agents: Array<{ ID: string; MaxTokensPerRun: number | null }>;
  steps: Array<{ AgentRunID: string; OutputData: string | null }>;
  claims: Array<{ ClaimingAgentRunID: string; MLTrainingPipelineID: string | null }>;
  sessions: Array<{ ID: string; AgentRunID: string | null }>;
  iterations: Array<{ ID: string; ExperimentSessionID: string }>;
  training: TrainingRunRow[];
}

let tables: Tables;
const user = new UserInfo(null, { ID: 'U1', Name: 'person', Type: 'Owner' });
const provider = {} as unknown as IMetadataProvider;
const completed = TrainerResultFixtures.ValidationResultsFor(TrainerResultFixtures.CannedCompleted('TR1', ProtocolRowFixture.Spec()));
const stopped = TrainerResultFixtures.ValidationResultsFor((() => {
  const c = TrainerResultFixtures.CannedCompleted('TR3', ProtocolRowFixture.Spec());
  return { ...c, cost: { ...c.cost, stoppedByBudget: true } };
})());

function idsOf(filter: string, field: string): string[] {
  const inList = new RegExp(`\\b${field}\\s+IN\\s*\\(([^)]*)\\)`, 'i').exec(filter)?.[1];
  if (inList !== undefined) return inList.split(',').map((s) => s.trim().replace(/'/g, ''));
  const one = new RegExp(`\\b${field}\\s*=\\s*'([^']+)'`, 'i').exec(filter)?.[1];
  return one === undefined ? [] : [one];
}

function answer(p: ViewParams): { Success: boolean; Results: object[] } {
  const f = p.ExtraFilter ?? '';
  const ok = (rows: object[]): { Success: boolean; Results: object[] } => ({ Success: true, Results: rows });
  switch (p.EntityName) {
    case 'MJ: AI Agent Runs': {
      const parents = idsOf(f, 'ParentRunID');
      if (parents.length > 0) return ok(tables.runs.filter((r) => r.ParentRunID !== null && parents.includes(r.ParentRunID)));
      return ok(tables.runs.filter((r) => idsOf(f, 'ID').includes(r.ID)));
    }
    case 'MJ: AI Agents': return ok(tables.agents.filter((a) => idsOf(f, 'ID').includes(a.ID)));
    case 'MJ: AI Agent Run Steps': return ok(tables.steps.filter((s) => idsOf(f, 'AgentRunID').includes(s.AgentRunID) && (s.OutputData || '').includes('guardrailExceeded')));
    case 'MJ: ML Build Approval Claims': return ok(tables.claims.filter((c) => idsOf(f, 'ClaimingAgentRunID').includes(c.ClaimingAgentRunID)));
    case 'MJ: Experiment Sessions': return ok(tables.sessions.filter((s) => s.AgentRunID !== null && idsOf(f, 'AgentRunID').includes(s.AgentRunID)));
    case 'MJ: Experiment Session Iterations': return ok(tables.iterations.filter((i) => idsOf(f, 'ExperimentSessionID').includes(i.ExperimentSessionID)));
    case 'MJ: ML Training Runs': {
      const pipelines = idsOf(f, 'PipelineID');
      const iterations = idsOf(f, 'ExperimentSessionIterationID');
      return ok(tables.training.filter((t) => pipelines.includes(t.PipelineID) || (t.ExperimentSessionIterationID !== null && iterations.includes(t.ExperimentSessionIterationID))));
    }
    default: return ok([]);
  }
}

beforeEach(() => {
  tables = {
    runs: [
      { ID: 'ROOT', AgentID: 'MDA', ParentRunID: null, TotalTokensUsed: 31_235, TotalCost: 0.016398, },
      { ID: 'PB', AgentID: 'PBA', ParentRunID: 'ROOT', TotalTokensUsed: 0, TotalCost: 0 },
      { ID: 'ELSE', AgentID: 'MDA', ParentRunID: null, TotalTokensUsed: 999, TotalCost: 9 },
    ],
    agents: [{ ID: 'MDA', MaxTokensPerRun: 893_480 }],
    steps: [{ AgentRunID: 'ROOT', OutputData: '{"note":"fine"}' }],
    claims: [{ ClaimingAgentRunID: 'ROOT', MLTrainingPipelineID: 'PIPE1' }, { ClaimingAgentRunID: 'ELSE', MLTrainingPipelineID: 'PIPE9' }],
    sessions: [{ ID: 'S1', AgentRunID: 'PB' }],
    iterations: [{ ID: 'IT1', ExperimentSessionID: 'S1' }],
    training: [
      { ID: 'TR1', PipelineID: 'PIPE1', ExperimentSessionIterationID: null, ComputeSeconds: 12.5, ComputeCost: 0.125, TokensUsed: 0, ValidationResults: completed },
      { ID: 'TR2', PipelineID: 'PIPE2', ExperimentSessionIterationID: 'IT1', ComputeSeconds: 2.25, ComputeCost: 0.0225, TokensUsed: 2000, ValidationResults: null },
      { ID: 'TR9', PipelineID: 'PIPE9', ExperimentSessionIterationID: null, ComputeSeconds: 99, ComputeCost: 99, TokensUsed: 99, ValidationResults: completed },
    ],
  };
  const view = { RunView: vi.fn(async (p: ViewParams) => answer(p)), RunViews: vi.fn(async (ps: ViewParams[]) => ps.map((p) => answer(p))) };
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(view as unknown as RunView);
});
afterEach(() => vi.restoreAllMocks());

describe('A6 attack 3: RunCostReport.Of equals the stored sums', () => {
  it("adds the tree's prompt tokens and cost to its training runs' tokens, seconds and compute cost", async () => {
    const cost = await RunCostReport.Of('ROOT', provider, user);
    expect(cost.tokens).toBe(31_235 + 0 + 2000);
    expect(cost.computeSeconds).toBeCloseTo(12.5 + 2.25, 9);
    expect(cost.usd).toBeCloseTo(0.016398 + 0.125 + 0.0225, 9);
    expect(cost.stoppedByBudget).toBe(false);
  });

  it("states the session's budget: the agent's token cap with the protocol's compute and candidate bounds", async () => {
    const cost = await RunCostReport.Of('ROOT', provider, user);
    const protocol = ProtocolRowFixture.Spec().budgets;
    expect(cost.budget).toEqual({ maxComputeSeconds: protocol.maxComputeSeconds, maxTokens: 893_480, maxCandidates: protocol.maxCandidates, hardStop: true });
  });

  it('is stopped by budget when a run step tripped a guardrail, or a trainer stopped on its budget', async () => {
    tables.steps.push({ AgentRunID: 'PB', OutputData: '{"guardrailExceeded":{"type":"tokens","limit":40000,"current":41200}}' });
    expect((await RunCostReport.Of('ROOT', provider, user)).stoppedByBudget).toBe(true);
    tables.steps.pop();
    tables.training[0].ValidationResults = stopped;
    expect((await RunCostReport.Of('ROOT', provider, user)).stoppedByBudget).toBe(true);
  });

  it('breaks the cost into its stored parts (what the report row records)', async () => {
    const parts = await RunCostReport.Breakdown('ROOT', provider, user);
    expect([parts.PromptTokens, parts.IterationTokens, parts.PromptUsd, parts.ComputeUsd]).toEqual([31_235, 2000, 0.016398, 0.1475]);
    expect([...parts.TrainingRunIDs].sort()).toEqual(['TR1', 'TR2']);
  });

  it('takes the in-memory root totals when the caller holds them (a run still writing its own row)', async () => {
    const cost = await RunCostReport.Of('ROOT', provider, user, { TotalTokensUsed: 40_000, TotalCost: 0.02 });
    expect(cost.tokens).toBe(42_000);
    expect(cost.usd).toBeCloseTo(0.02 + 0.1475, 9);
  });

  it('refuses a run that does not exist', async () => {
    await expect(RunCostReport.Of('NOPE', provider, user)).rejects.toThrow(/NOPE/);
  });
});
