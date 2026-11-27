/**
 * A4 attacks 3, 4 (the session rule), 9 and 11 (compare-and-append) — `MJ: Agent Decision Logs` (§5.1.6, D5-24, D5-38).
 *
 * The log table is an in-memory fake with the migration's unique (`SessionRunID`, `Step`) index; each fake row's
 * `Save()` runs the registered guard's `CheckSave` first (as `BaseEntity.Save` runs `PreSave` hooks), then the index,
 * and `Delete()` runs `CheckDelete`. Test doubles: the log entity (`Object.create` on the generated class, so the guard's
 * `instanceof` holds, with its fields as plain properties), the provider (`GetEntityObject`), `RunView` (spied, answering
 * the log's reads from the table), the session walk (`BuildApprovalResolver.SessionRuns`) and the session lock
 * (`AgentSessionLease.WithSessionLock`, which runs the work: the test seam that admits two runs at once). Each is cast
 * where it is handed over.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunView, UserInfo, type BaseEntity, type IMetadataProvider } from '@memberjunction/core';
import { MJAgentDecisionLogEntity, type MJAIAgentRunEntity } from '@memberjunction/core-entities';
import type { AgentDecisionLogEntry } from '@memberjunction/predictive-studio-core';
import { PreSaveHookRegistration } from '../../registry/pre-save-hook-registration';
import { AgentDecisionLog } from '../decision-log';
import { AgentDecisionLogWriteAuthorisations } from '../decision-log-write-authorisations';
import { AgentSessionLease } from '../agent-session-lease';
import { BuildApprovalResolver } from '../build-approval-resolver';

type Decision = MJAgentDecisionLogEntity['Decision'];
interface Stored {
  ID: string; SessionRunID: string; AgentRunID: string; AgentRunStepID: string | null; Step: number; Decision: Decision;
  PromptRunID: string | null; ToolCalls: string; PayloadHash: string; ResultingPayloadHash: string; Rationale: string; Replay: string;
  BuildApprovalRequestID: string | null;
}

let table: Stored[];
let nextId: number;
/** Called at the start of every fake save, before the guard (attack 9 interleaves a client save there). */
let onSaveStart: ((row: MJAgentDecisionLogEntity) => Promise<void>) | null;
const user = new UserInfo(null, { ID: 'U1', Name: 'person', Type: 'Owner' });

const h = (c: string): string => c.repeat(64);

/** A decision-log row double: the generated class's prototype, its fields, and a Save/Delete through the guard. */
function logRow(stored: Stored | null): MJAgentDecisionLogEntity {
  const e = Object.create(MJAgentDecisionLogEntity.prototype) as MJAgentDecisionLogEntity;
  const values: Stored = stored ? { ...stored } : {
    ID: '', SessionRunID: '', AgentRunID: '', AgentRunStepID: null, Step: 0, Decision: 'report', PromptRunID: null,
    ToolCalls: '[]', PayloadHash: '', ResultingPayloadHash: '', Rationale: '', Replay: '{}', BuildApprovalRequestID: null,
  };
  let saved = stored !== null;
  let lastMessage = '';
  for (const f of Object.keys(values) as (keyof Stored)[]) {
    Object.defineProperty(e, f, { get: () => values[f], set: (v: never) => { values[f] = v; }, configurable: true });
  }
  Object.defineProperty(e, 'EntityInfo', { get: () => ({ Name: 'MJ: Agent Decision Logs' }) });
  Object.defineProperty(e, 'IsSaved', { get: () => saved });
  Object.defineProperty(e, 'NewRecord', { value: () => true });
  Object.defineProperty(e, 'LatestResult', { get: () => ({ CompleteMessage: lastMessage }) });
  Object.defineProperty(e, 'Save', {
    value: async () => {
      await Promise.resolve();
      if (onSaveStart) await onSaveStart(e);
      const verdict = AgentDecisionLog.CheckSave(e as unknown as BaseEntity);
      if (verdict !== true) { lastMessage = String(verdict); return false; }
      if (!saved) {
        if (table.some((r) => r.SessionRunID === values.SessionRunID && r.Step === values.Step)) { lastMessage = 'Cannot insert duplicate key row (UQ_AgentDecisionLog_SessionRunID_Step)'; return false; }
        values.ID = `DL${nextId++}`;
        table.push({ ...values });
        saved = true;
      } else {
        const i = table.findIndex((r) => r.ID === values.ID);
        table[i] = { ...values };
      }
      return true;
    },
  });
  Object.defineProperty(e, 'Delete', {
    value: async () => {
      const verdict = AgentDecisionLog.CheckDelete(e as unknown as BaseEntity);
      if (verdict !== true) { lastMessage = String(verdict); return false; }
      table = table.filter((r) => r.ID !== values.ID);
      return true;
    },
  });
  Object.defineProperty(e, 'Load', { value: async (id: string) => { const r = table.find((x) => x.ID === id); if (!r) return false; Object.assign(values, r); saved = true; return true; } });
  return e;
}

const provider = { GetEntityObject: vi.fn(async () => logRow(null)) } as unknown as IMetadataProvider;

/** The log's reads answered from the table: by session, or by the runs that wrote rows. */
function answer(p: { EntityName?: string; ExtraFilter?: string; OrderBy?: string; MaxRows?: number }): { Success: boolean; Results: Stored[] } {
  if (p.EntityName !== 'MJ: Agent Decision Logs') return { Success: true, Results: [] };
  const filter = p.ExtraFilter ?? '';
  const session = /SessionRunID\s*=\s*'([^']+)'/i.exec(filter)?.[1];
  const runs = /AgentRunID\s+IN\s*\(([^)]*)\)/i.exec(filter)?.[1]?.split(',').map((s) => s.trim().replace(/'/g, ''));
  let rows = table.filter((r) => (session === undefined || r.SessionRunID === session) && (runs === undefined || runs.includes(r.AgentRunID)));
  rows = [...rows].sort((a, b) => (/DESC/i.test(p.OrderBy ?? '') ? b.Step - a.Step : a.Step - b.Step));
  return { Success: true, Results: p.MaxRows ? rows.slice(0, p.MaxRows) : rows };
}

function run(id: string, lastRunId: string | null = null): MJAIAgentRunEntity {
  return { ID: id, LastRunID: lastRunId } as unknown as MJAIAgentRunEntity;
}

/** The session walk: each run's `LastRunID` chain, from the runs the test declares. */
let chains: Record<string, string[]>;

function entry(over: Partial<AgentDecisionLogEntry> & Pick<AgentDecisionLogEntry, 'step' | 'decision'>): AgentDecisionLogEntry {
  return {
    sessionRunId: 'RUN1', agentRunId: 'RUN1', agentRunStepId: null, rationale: 'code rule', resultingPayloadHash: h('b'),
    inputs: { promptRunId: null, toolCalls: [], payloadHash: h('a') },
    replay: { promptId: null, promptVersionHash: null, parameters: null }, buildApprovalRequestId: null,
    ...over,
  };
}

function seed(rows: Array<Pick<Stored, 'SessionRunID' | 'AgentRunID' | 'Step' | 'Decision' | 'PayloadHash' | 'ResultingPayloadHash'>>): void {
  for (const r of rows) {
    table.push({ ID: `DL${nextId++}`, AgentRunStepID: null, PromptRunID: null, ToolCalls: '[]', Rationale: 'seed', Replay: '{}', BuildApprovalRequestID: null, ...r });
  }
}

beforeEach(() => {
  table = [];
  nextId = 1;
  onSaveStart = null;
  chains = {};
  AgentDecisionLog.Register();
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: vi.fn(async (p) => answer(p)) } as unknown as RunView);
  vi.spyOn(AgentSessionLease, 'WithSessionLock').mockImplementation(async (_id, work) => work(new Date('2026-11-27T12:00:00Z')));
  vi.spyOn(BuildApprovalResolver, 'SessionRuns').mockImplementation(async (r) => (chains[r.ID] ?? [r.ID]).map((id) => ({ ID: id }) as never));
});
afterEach(() => vi.restoreAllMocks());

describe('A4 attack 3: no writer but Append changes the log', () => {
  async function savedRow(): Promise<MJAgentDecisionLogEntity> {
    const r = await AgentDecisionLog.Append(entry({ step: 1, decision: 'draft-unit' }), provider, user);
    expect(typeof r).toBe('string');
    const row = logRow(null);
    expect(await row.Load(String(r))).toBe(true);
    return row;
  }

  it('Append writes the row (the positive control)', async () => {
    const id = await AgentDecisionLog.Append(entry({ step: 1, decision: 'draft-unit' }), provider, user);
    expect(id).toBe('DL1');
    expect(table).toHaveLength(1);
    expect(table[0]).toMatchObject({ SessionRunID: 'RUN1', AgentRunID: 'RUN1', Step: 1, Decision: 'draft-unit', PayloadHash: h('a'), ResultingPayloadHash: h('b') });
  });

  it('a GraphQL update of a saved row (the resolver loads it and saves the change) is refused', async () => {
    const row = await savedRow();
    row.Rationale = 'edited by a client';
    expect(await row.Save()).toBe(false);
    expect(row.LatestResult?.CompleteMessage).toMatch(/refused/i);
    expect(table[0].Rationale).toBe('code rule');
  });

  it('a GraphQL delete of a saved row is refused', async () => {
    const row = await savedRow();
    expect(await row.Delete()).toBe(false);
    expect(row.LatestResult?.CompleteMessage).toMatch(/refused/i);
    expect(table).toHaveLength(1);
  });

  it('an Update Record Action run by the agent (a server-side save of the loaded row) is refused', async () => {
    const row = await savedRow();
    row.ResultingPayloadHash = h('f');
    expect(await row.Save()).toBe(false);
    expect(table[0].ResultingPayloadHash).toBe(h('b'));
  });

  it('a server-side Save() of a loaded row, even with nothing changed, is refused', async () => {
    const row = await savedRow();
    expect(await row.Save()).toBe(false);
  });

  it("a client create naming the session's run is refused (only Append writes)", async () => {
    const row = logRow(null);
    row.SessionRunID = 'RUN1'; row.AgentRunID = 'RUN1'; row.Step = 1; row.Decision = 'request-build';
    row.PayloadHash = h('a'); row.ResultingPayloadHash = h('a'); row.ToolCalls = '[]'; row.Rationale = 'forged'; row.Replay = '{}';
    expect(await row.Save()).toBe(false);
    expect(table).toHaveLength(0);
  });

  it('Register() installs the PreSave and PreDelete guards once per process', () => {
    const save = vi.spyOn(PreSaveHookRegistration, 'RegisterOnce');
    const del = vi.spyOn(PreSaveHookRegistration, 'RegisterPreDeleteOnce');
    AgentDecisionLog.Unregister();
    AgentDecisionLog.Register();
    AgentDecisionLog.Register();
    expect(save).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe(AgentDecisionLog.HookMark);
    expect(del.mock.calls[0][0]).toBe(AgentDecisionLog.DeleteHookMark);
  });

  it('other entities pass the guard untouched', () => {
    const other = { EntityInfo: { Name: 'MJ: AI Agent Runs' }, IsSaved: true } as unknown as BaseEntity;
    expect(AgentDecisionLog.CheckSave(other)).toBe(true);
    expect(AgentDecisionLog.CheckDelete(other)).toBe(true);
  });
});

describe("A4 attack 4 (the session rule): SessionRunID is the session's first run, continued along LastRunID", () => {
  it('a run with no LastRunID starts its own session', async () => {
    expect(await AgentDecisionLog.SessionOf(run('RUN1'), provider, user)).toBe('RUN1');
  });

  it("the resumed run continues its LastRunID run's session while that session's newest row is not terminal", async () => {
    seed([
      { SessionRunID: 'RUN1', AgentRunID: 'RUN1', Step: 1, Decision: 'draft-unit', PayloadHash: h('a'), ResultingPayloadHash: h('b') },
      { SessionRunID: 'RUN1', AgentRunID: 'RUN1', Step: 2, Decision: 'present-plan', PayloadHash: h('b'), ResultingPayloadHash: h('b') },
    ]);
    chains = { RUN2: ['RUN2', 'RUN1'] };
    expect(await AgentDecisionLog.SessionOf(run('RUN2', 'RUN1'), provider, user)).toBe('RUN1');
  });

  it('a run continuing a run that wrote no row continues the session of the nearest run in the chain that did', async () => {
    seed([{ SessionRunID: 'RUN1', AgentRunID: 'RUN1', Step: 1, Decision: 'present-plan', PayloadHash: h('a'), ResultingPayloadHash: h('a') }]);
    chains = { RUN3: ['RUN3', 'RUN2', 'RUN1'] };
    expect(await AgentDecisionLog.SessionOf(run('RUN3', 'RUN2'), provider, user)).toBe('RUN1');
  });

  it.each(['report', 'decline-no-signal', 'decline-small-data', 'decline-unresolved-reference'] as const)(
    'after a terminal %s row, a new request in the same conversation starts a new session', async (terminal) => {
      seed([
        { SessionRunID: 'RUN1', AgentRunID: 'RUN1', Step: 1, Decision: 'present-plan', PayloadHash: h('a'), ResultingPayloadHash: h('a') },
        { SessionRunID: 'RUN1', AgentRunID: 'RUN2', Step: 2, Decision: terminal, PayloadHash: h('a'), ResultingPayloadHash: h('a') },
      ]);
      chains = { RUN3: ['RUN3', 'RUN2', 'RUN1'] };
      expect(await AgentDecisionLog.SessionOf(run('RUN3', 'RUN2'), provider, user)).toBe('RUN3');
    });

  it("Rows reads a session's rows in Step order across every run of the session", async () => {
    seed([
      { SessionRunID: 'RUN1', AgentRunID: 'RUN2', Step: 2, Decision: 'request-build', PayloadHash: h('b'), ResultingPayloadHash: h('b') },
      { SessionRunID: 'RUN1', AgentRunID: 'RUN1', Step: 1, Decision: 'present-plan', PayloadHash: h('b'), ResultingPayloadHash: h('b') },
      { SessionRunID: 'RUN9', AgentRunID: 'RUN9', Step: 1, Decision: 'draft-unit', PayloadHash: h('c'), ResultingPayloadHash: h('d') },
    ]);
    const rows = await AgentDecisionLog.Rows('RUN1', provider, user);
    expect(rows.map((r) => [r.AgentRunID, r.Step, r.Decision])).toEqual([['RUN1', 1, 'present-plan'], ['RUN2', 2, 'request-build']]);
  });
});

describe('A4 attack 9: a client create interleaved with Append in the same process is refused', () => {
  it("the authorisation is keyed by Append's own instance: a create saved while Append awaits its save is refused, Append's is kept", async () => {
    let interleaved: boolean | null = null;
    onSaveStart = async (row) => {
      if (interleaved !== null || row.Rationale === 'forged') return;
      const forged = logRow(null);
      forged.SessionRunID = 'RUN1'; forged.AgentRunID = 'RUN1'; forged.Step = 7; forged.Decision = 'request-build';
      forged.PayloadHash = h('a'); forged.ResultingPayloadHash = h('a'); forged.ToolCalls = '[]'; forged.Rationale = 'forged'; forged.Replay = '{}';
      interleaved = await forged.Save();
    };
    const id = await AgentDecisionLog.Append(entry({ step: 1, decision: 'draft-unit' }), provider, user);
    expect(interleaved).toBe(false);
    expect(id).toBe('DL1');
    expect(table.map((r) => r.Rationale)).toEqual(['code rule']);
  });

  it('an authorisation never outlives the save it was issued for', async () => {
    await AgentDecisionLog.Append(entry({ step: 1, decision: 'draft-unit' }), provider, user);
    const row = logRow(null);
    expect(AgentDecisionLogWriteAuthorisations.Instance.Take(row)).toBeNull();
  });
});

describe('A4 attack 11: compare-and-append (D5-38)', () => {
  beforeEach(() => {
    seed([1, 2, 3, 4].map((step) => ({ SessionRunID: 'RUN1', AgentRunID: 'RUN1', Step: step, Decision: 'draft-unit' as Decision, PayloadHash: h(String(step - 1)), ResultingPayloadHash: h(String(step)) })));
  });

  it('two runs of one session both past the busy check append steps 5 and 6 from different payloads → the second is refused log-diverged, nothing written', async () => {
    const first = await AgentDecisionLog.Append(entry({ agentRunId: 'RUN2', step: 5, decision: 'draft-protocol', inputs: { promptRunId: null, toolCalls: [], payloadHash: h('4') }, resultingPayloadHash: h('5') }), provider, user);
    expect(typeof first).toBe('string');
    const second = await AgentDecisionLog.Append(entry({ agentRunId: 'RUN3', step: 6, decision: 'present-plan', inputs: { promptRunId: null, toolCalls: [], payloadHash: h('4') }, resultingPayloadHash: h('e') }), provider, user);
    expect(second).toEqual({ kind: 'log-diverged', newestStep: 5 });
    expect(table).toHaveLength(5);
    expect(table.map((r) => r.Step)).toEqual([1, 2, 3, 4, 5]);
  });

  it('a step that is not newest + 1 is refused even from the newest hash', async () => {
    const r = await AgentDecisionLog.Append(entry({ step: 6, decision: 'present-plan', inputs: { promptRunId: null, toolCalls: [], payloadHash: h('4') }, resultingPayloadHash: h('4') }), provider, user);
    expect(r).toEqual({ kind: 'log-diverged', newestStep: 4 });
    expect(table).toHaveLength(4);
  });

  it('the first row of a session must be Step 1', async () => {
    const r = await AgentDecisionLog.Append(entry({ sessionRunId: 'RUN7', agentRunId: 'RUN7', step: 2, decision: 'draft-unit' }), provider, user);
    expect(r).toEqual({ kind: 'log-diverged', newestStep: 0 });
  });

  it('a live sibling under the lock → session-busy, nothing written', async () => {
    vi.mocked(AgentSessionLease.WithSessionLock).mockResolvedValueOnce({ kind: 'session-busy', liveRunId: 'RUN2' });
    const r = await AgentDecisionLog.Append(entry({ step: 5, decision: 'draft-protocol', inputs: { promptRunId: null, toolCalls: [], payloadHash: h('4') } }), provider, user);
    expect(r).toEqual({ kind: 'session-busy', liveRunId: 'RUN2' });
    expect(table).toHaveLength(4);
  });

  it('Append takes the session lock of the entry\'s session, naming every run that wrote to it', async () => {
    await AgentDecisionLog.Append(entry({ agentRunId: 'RUN2', step: 5, decision: 'draft-protocol', inputs: { promptRunId: null, toolCalls: [], payloadHash: h('4') } }), provider, user);
    const call = vi.mocked(AgentSessionLease.WithSessionLock).mock.calls[0];
    expect(call[0]).toBe('RUN1');
    expect(call[3].CurrentRunID).toBe('RUN2');
    expect([...call[3].SessionRunIDs].sort()).toEqual(['RUN1', 'RUN2']);
  });
});
