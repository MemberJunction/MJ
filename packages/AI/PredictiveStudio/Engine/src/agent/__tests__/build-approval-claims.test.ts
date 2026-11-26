/**
 * A2 attack list — the approval claim (`BuildApprovalClaims`, D5-23) and its write guard: attacks 15 and 17.
 *
 * The claim table is an in-memory fake with the migration's unique index on `AgentRequestID`; each fake row's `Save()`
 * runs the registered guard's `CheckSave` first (as `BaseEntity.Save` runs `PreSave` hooks), then the index. Test doubles:
 * the claim entity (`Object.create` on the generated class, so the guard's `instanceof` holds, with its fields as
 * plain properties), the provider (`GetEntityObject`) and `RunView` (spied); each is cast where it is handed over.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, UserInfo, type BaseEntity, type IMetadataProvider } from '@memberjunction/core';
import { MJMLBuildApprovalClaimEntity } from '@memberjunction/core-entities';
import { BuildApprovalClaims } from '../build-approval-claims';
import { BuildApprovalClaimWriteAuthorisations } from '../build-approval-claim-write-authorisations';

type Outcome = MJMLBuildApprovalClaimEntity['Outcome'];
interface Stored { ID: string; AgentRequestID: string; ClaimingAgentRunID: string; PlanHash: string; Outcome: Outcome; MLTrainingPipelineID: string | null }

let table: Stored[];
let nextId: number;
const user = { ID: 'U1', Type: 'User' } as unknown as UserInfo;

/** A claim row double: the generated class's prototype, its fields, dirty tracking and a Save through the guard. */
function claimRow(stored: Stored | null): MJMLBuildApprovalClaimEntity {
  const e = Object.create(MJMLBuildApprovalClaimEntity.prototype) as MJMLBuildApprovalClaimEntity;
  const values: Stored = stored ? { ...stored } : { ID: '', AgentRequestID: '', ClaimingAgentRunID: '', PlanHash: '', Outcome: 'claimed', MLTrainingPipelineID: null };
  const old: Stored = { ...values };
  let saved = stored !== null;
  const fields = Object.keys(values) as (keyof Stored)[];
  for (const f of fields) {
    Object.defineProperty(e, f, { get: () => values[f], set: (v: never) => { values[f] = v; }, configurable: true });
  }
  Object.defineProperty(e, 'EntityInfo', { get: () => ({ Name: 'MJ: ML Build Approval Claims' }) });
  Object.defineProperty(e, 'IsSaved', { get: () => saved });
  Object.defineProperty(e, 'Fields', { get: () => fields.map((f) => ({ Name: f, Dirty: values[f] !== old[f], OldValue: old[f] })) });
  Object.defineProperty(e, 'GetFieldByName', { value: (n: keyof Stored) => ({ Name: n, Dirty: values[n] !== old[n], OldValue: old[n], Value: values[n] }) });
  Object.defineProperty(e, 'NewRecord', { value: () => true });
  Object.defineProperty(e, 'LatestResult', { get: () => ({ CompleteMessage: lastMessage }) });
  let lastMessage = '';
  Object.defineProperty(e, 'Save', {
    value: async () => {
      await Promise.resolve(); // a save is asynchronous: other work interleaves before it reaches the hook
      const verdict = BuildApprovalClaims.CheckSave(e as unknown as BaseEntity);
      if (verdict !== true) { lastMessage = String(verdict); return false; }
      if (!saved) {
        if (table.some((r) => r.AgentRequestID === values.AgentRequestID)) { lastMessage = 'Cannot insert duplicate key row (UQ_MLBuildApprovalClaim_AgentRequestID)'; return false; }
        values.ID = `CL${nextId++}`;
        table.push({ ...values });
        saved = true;
      } else {
        const i = table.findIndex((r) => r.ID === values.ID);
        table[i] = { ...values };
      }
      Object.assign(old, values);
      return true;
    },
  });
  Object.defineProperty(e, 'Load', { value: async (id: string) => { const r = table.find((x) => x.ID === id); if (!r) return false; Object.assign(values, r); Object.assign(old, r); saved = true; return true; } });
  return e;
}

const provider = {
  GetEntityObject: vi.fn(async () => claimRow(null)),
} as unknown as IMetadataProvider;

beforeEach(() => {
  table = [];
  nextId = 1;
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
    RunView: vi.fn(async (p: { ExtraFilter?: string }) => {
      const id = /AgentRequestID\s*=\s*'([^']+)'/i.exec(p.ExtraFilter ?? '')?.[1];
      return { Success: true, Results: table.filter((r) => r.AgentRequestID === id) };
    }),
  } as unknown as RunView);
});
afterEach(() => vi.restoreAllMocks());

describe('BuildApprovalClaims.Claim', () => {
  it('claims an unclaimed approval once, Outcome claimed', async () => {
    const r = await BuildApprovalClaims.Claim('REQ1', 'RUN1', 'a'.repeat(64), provider, user);
    expect(r).toEqual({ Claimed: true, ClaimID: 'CL1' });
    expect(table).toEqual([{ ID: 'CL1', AgentRequestID: 'REQ1', ClaimingAgentRunID: 'RUN1', PlanHash: 'a'.repeat(64), Outcome: 'claimed', MLTrainingPipelineID: null }]);
  });

  it('a second claim of the same request → consumed, naming the first claim', async () => {
    await BuildApprovalClaims.Claim('REQ1', 'RUN1', 'a'.repeat(64), provider, user);
    expect(await BuildApprovalClaims.Claim('REQ1', 'RUN2', 'a'.repeat(64), provider, user)).toEqual({ kind: 'consumed', claimId: 'CL1' });
    expect(table).toHaveLength(1);
  });

  it('attack 15: two concurrent claims of one Approved request → exactly one claim row, one Claimed, one consumed', async () => {
    const [a, b] = await Promise.all([
      BuildApprovalClaims.Claim('REQ1', 'RUN1', 'a'.repeat(64), provider, user),
      BuildApprovalClaims.Claim('REQ1', 'RUN2', 'a'.repeat(64), provider, user),
    ]);
    const claimed = [a, b].filter((x) => 'Claimed' in x);
    const consumed = [a, b].filter((x) => 'kind' in x && x.kind === 'consumed');
    expect(claimed).toHaveLength(1);
    expect(consumed).toHaveLength(1);
    expect(table).toHaveLength(1);
  });
});

describe('BuildApprovalClaims.Settle', () => {
  it('records built or failed and the pipeline, once', async () => {
    const c = await BuildApprovalClaims.Claim('REQ1', 'RUN1', 'a'.repeat(64), provider, user);
    if (!('Claimed' in c)) throw new Error('not claimed');
    await BuildApprovalClaims.Settle(c.ClaimID, 'failed', null, provider, user);
    expect(table[0].Outcome).toBe('failed');
    await expect(BuildApprovalClaims.Settle(c.ClaimID, 'built', 'P1', provider, user)).rejects.toThrow();
    expect(table[0].Outcome).toBe('failed');
  });
});

describe('attack 17: every other writer of a claim row is refused by the guard', () => {
  beforeEach(async () => {
    await BuildApprovalClaims.Claim('REQ1', 'RUN1', 'a'.repeat(64), provider, user);
  });

  it('a create outside Claim (GraphQL create, an Update Record action, any server save) is refused', async () => {
    const row = claimRow(null);
    row.AgentRequestID = 'REQ2';
    row.ClaimingAgentRunID = 'RUN9';
    row.PlanHash = 'b'.repeat(64);
    expect(await row.Save()).toBe(false);
    expect(row.LatestResult.CompleteMessage).toMatch(/build approval claim/i);
    expect(table).toHaveLength(1);
  });

  it('an update of Outcome outside Settle (a GraphQL update, a loaded row saved by server code) is refused', async () => {
    const row = claimRow(table[0]);
    row.Outcome = 'built';
    expect(await row.Save()).toBe(false);
    expect(table[0].Outcome).toBe('claimed');
  });

  it('a delete is refused', () => {
    const row = claimRow(table[0]);
    expect(BuildApprovalClaims.CheckDelete(row as unknown as BaseEntity)).not.toBe(true);
  });

  it('Settle cannot change anything but Outcome and the pipeline', () => {
    const row = claimRow(table[0]);
    BuildApprovalClaimWriteAuthorisations.Instance.AuthoriseSettle(row);
    row.PlanHash = 'c'.repeat(64);
    row.Outcome = 'built';
    expect(BuildApprovalClaims.CheckSave(row as unknown as BaseEntity)).not.toBe(true);
  });

  it('a client save interleaved with a Claim in flight (same process) is still refused: the authorisation is the instance', async () => {
    const intruder = claimRow(null);
    intruder.AgentRequestID = 'REQ3';
    intruder.ClaimingAgentRunID = 'RUN9';
    intruder.PlanHash = 'b'.repeat(64);
    const [claim, intruded] = await Promise.all([
      BuildApprovalClaims.Claim('REQ4', 'RUN4', 'a'.repeat(64), provider, user),
      intruder.Save(),
    ]);
    expect(claim).toMatchObject({ Claimed: true });
    expect(intruded).toBe(false);
    expect(table.map((r) => r.AgentRequestID).sort()).toEqual(['REQ1', 'REQ4']);
  });

  it('another entity is never checked', () => {
    const other = { EntityInfo: { Name: 'MJ: ML Models' } } as unknown as BaseEntity;
    expect(BuildApprovalClaims.CheckSave(other)).toBe(true);
    expect(BuildApprovalClaims.CheckDelete(other)).toBe(true);
  });
});
