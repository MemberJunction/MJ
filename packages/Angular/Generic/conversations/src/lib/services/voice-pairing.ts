import { IMetadataProvider, RunView } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

/**
 * The narrow read-only projection of an `MJ: AI Agent Paired Agents` row the voice UI
 * consumes (loaded via {@link LoadCoAgentPairings} — `ResultType: 'simple'`, narrowed
 * fields). Pairing semantics: a co-agent with ZERO rows is **universal** (it can front
 * any target agent — the zero-config default); a co-agent WITH rows may front exactly
 * the listed targets, with the `IsDefault` row as its preselected target.
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
 * Loads the pairing rows for one co-agent from `MJ: AI Agent Paired Agents`, in
 * `Sequence` order (read-only lookup: `ResultType: 'simple'`, narrowed fields).
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
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<VoicePairedAgentRow>({
      EntityName: 'MJ: AI Agent Paired Agents',
      ExtraFilter: `CoAgentID='${id.replace(/'/g, "''")}'`,
      Fields: ['ID', 'CoAgentID', 'TargetAgentID', 'TargetAgent', 'IsDefault', 'Sequence'],
      OrderBy: 'Sequence, TargetAgent',
      ResultType: 'simple'
    });
    if (!result.Success) {
      console.warn('[VoicePairing] Failed to load co-agent pairings:', result.ErrorMessage);
      return [];
    }
    return SortPairings(result.Results ?? []);
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
