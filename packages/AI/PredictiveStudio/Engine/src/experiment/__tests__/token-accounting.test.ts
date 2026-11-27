/**
 * A6 attack 3 (the token half): an experiment iteration's `TokensUsed` is the sum of the `MJ: AI Prompt Runs` attributed
 * to it — the prompt runs of the agent run tree that made calls for it (`AIAgentRunID`: a strategist's or a derivation's
 * run), reached through that tree's `Prompt` run steps (D5-A6-1). An iteration no agent run made calls for used 0.
 *
 * `RunView` is spied (`RunView.FromMetadataProvider`), answering each entity's read from in-memory tables; the provider
 * is a stand-in that is never called. Each double is cast where it is handed over.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunView, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { AgentRunTree, ExperimentTokenAccounting } from '../token-accounting';

interface ViewParams { readonly EntityName?: string; readonly ExtraFilter?: string }
interface Tables {
  iterations: Array<{ ID: string; AIAgentRunID: string | null }>;
  runs: Array<{ ID: string; ParentRunID: string | null }>;
  steps: Array<{ AgentRunID: string; StepType: string; TargetLogID: string | null }>;
  prompts: Array<{ ID: string; TokensUsed: number | null }>;
}

let tables: Tables;
let failEntity: string | null;
const user = new UserInfo(null, { ID: 'U1', Name: 'person', Type: 'Owner' });
const provider = {} as unknown as IMetadataProvider;

/** The quoted IDs of an `IN (...)` or `= '...'` predicate on `field`. */
function idsOf(filter: string, field: string): string[] {
  const inList = new RegExp(`${field}\\s+IN\\s*\\(([^)]*)\\)`, 'i').exec(filter)?.[1];
  if (inList !== undefined) return inList.split(',').map((s) => s.trim().replace(/'/g, ''));
  const one = new RegExp(`${field}\\s*=\\s*'([^']+)'`, 'i').exec(filter)?.[1];
  return one === undefined ? [] : [one];
}

function answer(p: ViewParams): { Success: boolean; ErrorMessage?: string; Results: object[] } {
  const filter = p.ExtraFilter ?? '';
  if (p.EntityName === failEntity) return { Success: false, ErrorMessage: `forced read failure on ${failEntity}`, Results: [] };
  switch (p.EntityName) {
    case 'MJ: Experiment Session Iterations': return { Success: true, Results: tables.iterations.filter((r) => idsOf(filter, 'ID').includes(r.ID)) };
    case 'MJ: AI Agent Runs': return { Success: true, Results: tables.runs.filter((r) => r.ParentRunID !== null && idsOf(filter, 'ParentRunID').includes(r.ParentRunID)) };
    case 'MJ: AI Agent Run Steps': {
      const runs = idsOf(filter, 'AgentRunID');
      return { Success: true, Results: tables.steps.filter((s) => runs.includes(s.AgentRunID) && s.StepType === 'Prompt' && s.TargetLogID !== null) };
    }
    case 'MJ: AI Prompt Runs': return { Success: true, Results: tables.prompts.filter((r) => idsOf(filter, 'ID').includes(r.ID)) };
    default: return { Success: true, Results: [] };
  }
}

beforeEach(() => {
  failEntity = null;
  tables = {
    iterations: [{ ID: 'IT1', AIAgentRunID: 'STRAT' }, { ID: 'IT2', AIAgentRunID: null }, { ID: 'IT3', AIAgentRunID: 'LONE' }],
    runs: [{ ID: 'STRAT', ParentRunID: null }, { ID: 'DERIVE', ParentRunID: 'STRAT' }, { ID: 'DEEP', ParentRunID: 'DERIVE' }, { ID: 'OTHER', ParentRunID: null }, { ID: 'LONE', ParentRunID: null }],
    steps: [
      { AgentRunID: 'STRAT', StepType: 'Prompt', TargetLogID: 'P1' },
      { AgentRunID: 'DERIVE', StepType: 'Prompt', TargetLogID: 'P2' },
      { AgentRunID: 'DEEP', StepType: 'Prompt', TargetLogID: 'P3' },
      { AgentRunID: 'DEEP', StepType: 'Actions', TargetLogID: 'A1' },
      { AgentRunID: 'OTHER', StepType: 'Prompt', TargetLogID: 'P9' },
    ],
    prompts: [{ ID: 'P1', TokensUsed: 1200 }, { ID: 'P2', TokensUsed: 800 }, { ID: 'P3', TokensUsed: null }, { ID: 'P9', TokensUsed: 50_000 }],
  };
  const view = { RunView: vi.fn(async (p: ViewParams) => answer(p)), RunViews: vi.fn(async (ps: ViewParams[]) => ps.map((p) => answer(p))) };
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(view as unknown as RunView);
});
afterEach(() => vi.restoreAllMocks());

describe('A6 attack 3: ExperimentTokenAccounting.TokensFor', () => {
  it("sums the prompt runs of the iteration's agent run tree (every depth), and nothing outside it", async () => {
    expect(await ExperimentTokenAccounting.TokensFor('IT1', provider, user)).toBe(2000);
  });

  it('is 0 for an iteration no agent run made calls for, and 0 for a tree with no prompt step', async () => {
    expect(await ExperimentTokenAccounting.TokensFor('IT2', provider, user)).toBe(0);
    expect(await ExperimentTokenAccounting.TokensFor('IT3', provider, user)).toBe(0);
  });

  it('refuses an iteration that does not exist, and a failed read (never a silent 0)', async () => {
    await expect(ExperimentTokenAccounting.TokensFor('NOPE', provider, user)).rejects.toThrow(/NOPE/);
    failEntity = 'MJ: AI Prompt Runs';
    await expect(ExperimentTokenAccounting.TokensFor('IT1', provider, user)).rejects.toThrow(/forced read failure/);
  });
});

describe('AgentRunTree.Ids', () => {
  it('is the run and every descendant, once each', async () => {
    expect([...(await AgentRunTree.Ids('STRAT', provider, user))].sort()).toEqual(['DEEP', 'DERIVE', 'STRAT']);
    expect(await AgentRunTree.Ids('OTHER', provider, user)).toEqual(['OTHER']);
  });
});

describe('ExperimentTokenAccounting.IsAttributed', () => {
  it('recognises a strategist that names the agent run making its calls', () => {
    expect(ExperimentTokenAccounting.IsAttributed({ CurrentAgentRunID: 'STRAT', proposeNextWave: () => [] })).toBe(true);
    expect(ExperimentTokenAccounting.IsAttributed({ proposeNextWave: () => [] })).toBe(false);
  });
});
