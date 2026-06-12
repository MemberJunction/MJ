import { IMetadataProvider } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

/**
 * The narrow read-only projection of an `MJ: AI Agent Co Agents` row the voice UI consumes
 * (loaded via {@link LoadCoAgentPairings} from {@link AIEngineBase}'s cached `AgentCoAgents`;
 * only **Active** rows of relationship **Type `'CoAgent'`** with a specific agent target —
 * type-level rows express the resolution-chain default, not a target restriction, and
 * reserved relationship types are ignored until their features ship). Pairing semantics: a
 * co-agent with ZERO such rows is **universal** (it can front any target agent — the
 * zero-config default); a co-agent WITH rows may front exactly the listed targets, with the
 * `IsDefault` row as its preselected target.
 */
export interface VoicePairedAgentRow {
  /** The pairing row id. */
  ID: string;
  /** The Realtime-type co-agent the pairing belongs to. */
  CoAgentID: string;
  /** The target agent this co-agent may front. */
  TargetAgentID: string;
  /** Denormalized target-agent display name (from the base view). */
  TargetAgent: string | null;
  /** When true, this target is the co-agent's default (at most one per co-agent). */
  IsDefault: boolean;
  /** Display/list ordering of the pairing rows. */
  Sequence: number | null;
}

/** Minimal agent shape the pure pairing/co-agent helpers operate on. */
export interface VoiceAgentLike {
  ID: string;
}

/**
 * Loads the pairing rows for one co-agent from {@link AIEngineBase}'s cached
 * `MJ: AI Agent Co Agents` metadata (provider-scoped engine instance, lazy `Config`),
 * in `Sequence` order. The engine's BaseEntity-event reactivity keeps the cache fresh —
 * no per-call RunView round-trip.
 *
 * Tolerant by design: any failure degrades to an EMPTY list — i.e. "no pairing
 * constraint". The client gate is pure disclosure; the server independently validates
 * the co-agent/target pairing at session mint.
 */
export async function LoadCoAgentPairings(provider: IMetadataProvider, coAgentId: string): Promise<VoicePairedAgentRow[]> {
  const id = coAgentId?.trim() ?? '';
  if (id.length === 0) {
    return [];
  }
  try {
    const engine = AIEngineBase.GetProviderInstance<AIEngineBase>(provider, AIEngineBase) as AIEngineBase;
    await engine.Config(false, undefined, provider);
    const rows = (engine.AgentCoAgents ?? [])
      .filter(p =>
        p.Type === 'CoAgent' &&
        p.Status === 'Active' &&
        p.TargetAgentID != null &&
        UUIDsEqual(p.CoAgentID, id))
      .map<VoicePairedAgentRow>(p => ({
        ID: p.ID,
        CoAgentID: p.CoAgentID,
        TargetAgentID: p.TargetAgentID!,
        TargetAgent: p.TargetAgent ?? null,
        IsDefault: p.IsDefault,
        Sequence: p.Sequence ?? null
      }));
    return SortPairings(rows);
  } catch (error) {
    console.warn('[VoicePairing] Co-agent pairing lookup unavailable — treating co-agent as universal:', error);
    return [];
  }
}

/**
 * Returns the pairing rows in canonical display order: `Sequence` ascending (null/missing
 * sequences last), ties broken by target-agent name. Pure; never mutates the input.
 */
export function SortPairings(pairings: readonly VoicePairedAgentRow[]): VoicePairedAgentRow[] {
  return [...pairings].sort((a, b) => {
    const aSeq = a.Sequence ?? Number.MAX_SAFE_INTEGER;
    const bSeq = b.Sequence ?? Number.MAX_SAFE_INTEGER;
    if (aSeq !== bSeq) {
      return aSeq - bSeq;
    }
    return (a.TargetAgent ?? '').localeCompare(b.TargetAgent ?? '');
  });
}

/**
 * Applies the pairing constraint to a candidate target-agent list:
 * - ZERO pairing rows → the co-agent is universal; the candidates are returned unchanged
 *   (today's flow untouched).
 * - One or more rows → only candidates that appear among the pairing targets are
 *   returned, ordered by the pairings' `Sequence`. Paired targets the user can't see /
 *   run (absent from `agents`) are silently dropped.
 *
 * Pure and UUID-casing safe (`NormalizeUUID` keys).
 */
export function ConstrainTargetsToPairings<T extends VoiceAgentLike>(
  agents: readonly T[],
  pairings: readonly VoicePairedAgentRow[]
): T[] {
  if (!pairings || pairings.length === 0) {
    return [...agents];
  }
  const agentsById = new Map<string, T>();
  for (const agent of agents) {
    agentsById.set(NormalizeUUID(agent.ID), agent);
  }
  const constrained: T[] = [];
  const seen = new Set<string>();
  for (const pairing of SortPairings(pairings)) {
    const key = NormalizeUUID(pairing.TargetAgentID);
    const agent = agentsById.get(key);
    if (agent && !seen.has(key)) {
      seen.add(key);
      constrained.push(agent);
    }
  }
  return constrained;
}

/**
 * The co-agent's default target from its pairing rows — the first `IsDefault` row in
 * `Sequence` order (server enforces at most one, but the helper stays deterministic
 * regardless). `null` when there are no rows or none is marked default.
 */
export function DefaultPairedTargetId(pairings: readonly VoicePairedAgentRow[]): string | null {
  for (const pairing of SortPairings(pairings ?? [])) {
    if (pairing.IsDefault) {
      return pairing.TargetAgentID;
    }
  }
  return null;
}

/**
 * Whether the pairing rows permit `targetAgentId` as a target. ZERO rows means the
 * co-agent is universal (always allowed); otherwise the target must appear among the
 * rows. Missing/empty target id is never allowed against a constrained co-agent.
 */
export function PairingsAllowTarget(pairings: readonly VoicePairedAgentRow[], targetAgentId: string | null | undefined): boolean {
  if (!pairings || pairings.length === 0) {
    return true;
  }
  if (!targetAgentId) {
    return false;
  }
  return pairings.some(p => UUIDsEqual(p.TargetAgentID, targetAgentId));
}

/**
 * Filters an agent list down to ACTIVE Realtime-type **co-agent** candidates. The input
 * is expected to already be the run-permission-filtered active-agent set the host uses
 * for routing/@mentions, so this only applies the agent-TYPE cut (trim +
 * case-insensitive match on the denormalized `Type` name).
 */
export function FilterRealtimeCoAgents<T extends { Type: string | null }>(agents: readonly T[]): T[] {
  return agents.filter(a => (a.Type ?? '').trim().toLowerCase() === 'realtime');
}

/**
 * A selectable realtime model option in the voice picker (narrow read-only projection of
 * `MJ: AI Models` — only the fields the dropdown renders).
 */
export interface VoiceModelOption {
  /** The `MJ: AI Models` row id. */
  ID: string;
  /** The model's display name. */
  Name: string;
}

/**
 * The minimal `MJ: AI Models` row shape {@link BuildVoiceModelOptions} consumes —
 * structurally satisfied by `AIEngineBase`'s cached `Models` entities.
 */
export interface VoiceModelCandidate {
  /** The `MJ: AI Models` row id. */
  ID: string;
  /** The model's display name. */
  Name: string;
  /** Denormalized model-type name (e.g. 'LLM', 'Realtime'). */
  AIModelType: string | null;
  /** Whether the model is active and selectable. */
  IsActive: boolean;
}

/**
 * Builds the "Voice model" dropdown options from a cached model list: ACTIVE models whose
 * type is `Realtime` (trim + case-insensitive — SQL-collation parity with the previous
 * `IsActive = 1 AND AIModelType = 'Realtime'` filter), projected to {@link VoiceModelOption}
 * and sorted by Name. Pure; never mutates the input.
 */
export function BuildVoiceModelOptions(models: ReadonlyArray<VoiceModelCandidate>): VoiceModelOption[] {
  return models
    .filter(m => m.IsActive && (m.AIModelType ?? '').trim().toLowerCase() === 'realtime')
    .map<VoiceModelOption>(m => ({ ID: m.ID, Name: m.Name }))
    .sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''));
}

/**
 * Builds the `configOverridesJson` payload for the `StartRealtimeClientSession` mint from
 * what the (authorization-gated) pickers chose. Currently the only override is the
 * explicit realtime model preference; the envelope shape —
 * `{"realtime":{"modelPreference":"<id>"}}` — is the pinned server contract and is
 * structured so future overrides ride alongside without reshaping.
 *
 * @returns The JSON string, or `null` when nothing was overridden (the common case —
 *   `null` keeps the mint identical to today's behavior).
 */
export function BuildRealtimeConfigOverridesJson(preferredModelId: string | null | undefined): string | null {
  const modelId = preferredModelId?.trim() ?? '';
  if (modelId.length === 0) {
    return null;
  }
  return JSON.stringify({ realtime: { modelPreference: modelId } });
}
