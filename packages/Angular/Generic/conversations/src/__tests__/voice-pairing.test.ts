import { describe, it, expect, vi } from 'vitest';
import { IMetadataProvider, RunViewParams } from '@memberjunction/core';
import {
  BuildRealtimeConfigOverridesJson,
  ConstrainTargetsToPairings,
  DefaultPairedTargetId,
  FilterRealtimeCoAgents,
  LoadCoAgentPairings,
  PairingsAllowTarget,
  SortPairings,
  VoicePairedAgentRow,
} from '../lib/services/voice-pairing';

/**
 * Pure co-agent pairing helpers — the client side of the `MJ: AI Agent Paired Agents`
 * semantics: a co-agent with ZERO rows is universal (today's flow untouched); with rows,
 * its allowed targets are exactly those rows (Sequence order, IsDefault preselected).
 * Also covers the pinned `configOverridesJson` envelope builder and the Realtime-type
 * co-agent filter.
 */

const CO_AGENT = 'C0000000-0000-0000-0000-000000000001';

function pairing(overrides: Partial<VoicePairedAgentRow> & { TargetAgentID: string }): VoicePairedAgentRow {
  return {
    ID: `P-${overrides.TargetAgentID}`,
    CoAgentID: CO_AGENT,
    TargetAgent: null,
    IsDefault: false,
    Sequence: 0,
    ...overrides,
  };
}

const TARGET_A = 'A0000000-0000-0000-0000-00000000000A';
const TARGET_B = 'B0000000-0000-0000-0000-00000000000B';
const TARGET_C = 'D0000000-0000-0000-0000-00000000000D';

interface FakeAgent { ID: string; Name: string }
const agents: FakeAgent[] = [
  { ID: TARGET_A, Name: 'Alpha' },
  { ID: TARGET_B, Name: 'Beta' },
  { ID: TARGET_C, Name: 'Gamma' },
];

describe('ConstrainTargetsToPairings', () => {
  it('returns the candidates unchanged when there are zero pairing rows (universal co-agent)', () => {
    const result = ConstrainTargetsToPairings(agents, []);
    expect(result.map(a => a.ID)).toEqual([TARGET_A, TARGET_B, TARGET_C]);
  });

  it('constrains to exactly the paired targets, in pairing Sequence order', () => {
    const pairings = [
      pairing({ TargetAgentID: TARGET_C, Sequence: 2 }),
      pairing({ TargetAgentID: TARGET_B, Sequence: 1 }),
    ];
    const result = ConstrainTargetsToPairings(agents, pairings);
    expect(result.map(a => a.Name)).toEqual(['Beta', 'Gamma']);
  });

  it('silently drops paired targets the user cannot see/run (absent from the candidate list)', () => {
    const pairings = [
      pairing({ TargetAgentID: 'F0000000-0000-0000-0000-0000000000FF', Sequence: 1 }),
      pairing({ TargetAgentID: TARGET_A, Sequence: 2 }),
    ];
    const result = ConstrainTargetsToPairings(agents, pairings);
    expect(result.map(a => a.ID)).toEqual([TARGET_A]);
  });

  it('matches target ids across UUID casing and de-duplicates repeated targets', () => {
    const pairings = [
      pairing({ TargetAgentID: TARGET_B.toLowerCase(), Sequence: 1 }),
      pairing({ TargetAgentID: TARGET_B.toUpperCase(), Sequence: 2 }),
    ];
    const result = ConstrainTargetsToPairings(agents, pairings);
    expect(result.map(a => a.ID)).toEqual([TARGET_B]);
  });
});

describe('SortPairings', () => {
  it('orders by Sequence ascending with null sequences last, ties by target name', () => {
    const rows = [
      pairing({ TargetAgentID: TARGET_A, Sequence: null, TargetAgent: 'Alpha' }),
      pairing({ TargetAgentID: TARGET_C, Sequence: 1, TargetAgent: 'Gamma' }),
      pairing({ TargetAgentID: TARGET_B, Sequence: 1, TargetAgent: 'Beta' }),
    ];
    expect(SortPairings(rows).map(r => r.TargetAgentID)).toEqual([TARGET_B, TARGET_C, TARGET_A]);
  });

  it('does not mutate the input array', () => {
    const rows = [pairing({ TargetAgentID: TARGET_B, Sequence: 2 }), pairing({ TargetAgentID: TARGET_A, Sequence: 1 })];
    SortPairings(rows);
    expect(rows[0].TargetAgentID).toBe(TARGET_B);
  });
});

describe('DefaultPairedTargetId', () => {
  it('returns the IsDefault row target', () => {
    const pairings = [
      pairing({ TargetAgentID: TARGET_A, Sequence: 1 }),
      pairing({ TargetAgentID: TARGET_B, Sequence: 2, IsDefault: true }),
    ];
    expect(DefaultPairedTargetId(pairings)).toBe(TARGET_B);
  });

  it('returns the FIRST default in Sequence order when (defensively) more than one exists', () => {
    const pairings = [
      pairing({ TargetAgentID: TARGET_B, Sequence: 2, IsDefault: true }),
      pairing({ TargetAgentID: TARGET_A, Sequence: 1, IsDefault: true }),
    ];
    expect(DefaultPairedTargetId(pairings)).toBe(TARGET_A);
  });

  it('returns null when no row is marked default or there are no rows', () => {
    expect(DefaultPairedTargetId([pairing({ TargetAgentID: TARGET_A })])).toBeNull();
    expect(DefaultPairedTargetId([])).toBeNull();
  });
});

describe('PairingsAllowTarget', () => {
  it('always allows when there are zero rows (universal co-agent)', () => {
    expect(PairingsAllowTarget([], TARGET_A)).toBe(true);
    expect(PairingsAllowTarget([], null)).toBe(true);
  });

  it('allows only the paired targets when rows exist (UUID-casing safe)', () => {
    const pairings = [pairing({ TargetAgentID: TARGET_A })];
    expect(PairingsAllowTarget(pairings, TARGET_A.toLowerCase())).toBe(true);
    expect(PairingsAllowTarget(pairings, TARGET_B)).toBe(false);
  });

  it('never allows a missing target against a constrained co-agent', () => {
    expect(PairingsAllowTarget([pairing({ TargetAgentID: TARGET_A })], null)).toBe(false);
    expect(PairingsAllowTarget([pairing({ TargetAgentID: TARGET_A })], '')).toBe(false);
  });
});

describe('FilterRealtimeCoAgents', () => {
  it('keeps only agents whose Type is Realtime (trim + case-insensitive)', () => {
    const candidates = [
      { ID: '1', Type: 'Realtime' },
      { ID: '2', Type: ' realtime ' },
      { ID: '3', Type: 'Loop' },
      { ID: '4', Type: null },
    ];
    expect(FilterRealtimeCoAgents(candidates).map(a => a.ID)).toEqual(['1', '2']);
  });
});

describe('LoadCoAgentPairings', () => {
  /** Fake provider whose RunView returns canned rows — the only surface the loader touches. */
  function providerReturning(rows: VoicePairedAgentRow[] | Error): { provider: IMetadataProvider; runView: ReturnType<typeof vi.fn> } {
    const runView = vi.fn(async (_params: RunViewParams) => {
      if (rows instanceof Error) {
        throw rows;
      }
      return { Success: true, Results: rows };
    });
    return { provider: { RunView: runView } as unknown as IMetadataProvider, runView };
  }

  it('loads via a narrow simple-result RunView filtered to the co-agent and returns Sequence order', async () => {
    const { provider, runView } = providerReturning([
      pairing({ TargetAgentID: TARGET_B, Sequence: 2 }),
      pairing({ TargetAgentID: TARGET_A, Sequence: 1 }),
    ]);
    const rows = await LoadCoAgentPairings(provider, CO_AGENT);
    expect(rows.map(r => r.TargetAgentID)).toEqual([TARGET_A, TARGET_B]);
    const params = runView.mock.calls[0][0] as RunViewParams;
    expect(params.EntityName).toBe('MJ: AI Agent Paired Agents');
    expect(params.ExtraFilter).toBe(`CoAgentID='${CO_AGENT}'`);
    expect(params.ResultType).toBe('simple');
    expect(params.Fields).toEqual(['ID', 'CoAgentID', 'TargetAgentID', 'TargetAgent', 'IsDefault', 'Sequence']);
  });

  it('degrades to an empty list (no constraint) when the lookup throws', async () => {
    const { provider } = providerReturning(new Error('offline'));
    await expect(LoadCoAgentPairings(provider, CO_AGENT)).resolves.toEqual([]);
  });

  it('returns an empty list without querying when the co-agent id is blank', async () => {
    const { provider, runView } = providerReturning([]);
    await expect(LoadCoAgentPairings(provider, '  ')).resolves.toEqual([]);
    expect(runView).not.toHaveBeenCalled();
  });
});

describe('BuildRealtimeConfigOverridesJson', () => {
  it('returns null when nothing was overridden', () => {
    expect(BuildRealtimeConfigOverridesJson(null)).toBeNull();
    expect(BuildRealtimeConfigOverridesJson(undefined)).toBeNull();
    expect(BuildRealtimeConfigOverridesJson('   ')).toBeNull();
  });

  it('emits the pinned override envelope for an explicit model pick', () => {
    const json = BuildRealtimeConfigOverridesJson('model-77');
    expect(json).toBe('{"realtime":{"modelPreference":"model-77"}}');
    expect(JSON.parse(json as string)).toEqual({ realtime: { modelPreference: 'model-77' } });
  });
});
