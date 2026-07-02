/**
 * Pure parsing of the serialized realtime tool result (`ResultJson`) the server's
 * `RealtimeToolBroker` produces — `{ success, output, runId?, artifacts? }` on success or
 * `{ success: false, error }` on failure. Kept framework-free (no Angular / GraphQL
 * imports) so it is unit-testable in isolation and the {@link RealtimeSessionService}
 * stays focused on session orchestration.
 */

/**
 * One artifact a delegated run produced, as reported in the tool ResultJson
 * (`artifacts: [{ artifactId, artifactVersionId, name }]`). The call overlay opens each
 * in its own artifact tab on the tabbed surface panel.
 */
export interface ParsedDelegationArtifact {
  /** The `MJ: Artifacts` row id. */
  ArtifactID: string;
  /** The `MJ: Artifact Versions` row id of the version the run produced. */
  ArtifactVersionID: string;
  /** The artifact's display name (used as the tab title). */
  Name: string;
}

/** The normalized shape a tool ResultJson parses into. */
export interface ParsedDelegationResult {
  /** Whether the delegated work succeeded (`success !== false`; non-JSON payloads default to true). */
  Success: boolean;
  /** The result text — the agent's output, or the structured error message on failure. */
  Output: string;
  /**
   * ID of the delegated agent run (`MJ: AI Agent Runs`) when the server reported one
   * (`runId` in the JSON). Lets developer tooling link straight to the run record.
   */
  RunID?: string;
  /**
   * Artifacts the delegated run produced, when the server reported any (`artifacts` in
   * the JSON). Drives the overlay's auto-opened artifact tabs. `undefined` when absent,
   * empty, or malformed.
   */
  Artifacts?: ParsedDelegationArtifact[];
}

/** The raw camelCase artifact entry shape the broker serializes. */
interface RawDelegationArtifact {
  artifactId?: unknown;
  artifactVersionId?: unknown;
  name?: unknown;
}

/**
 * Parses the broker's `{success, output, runId, artifacts}` | `{success:false, error}` ResultJson.
 * If the payload isn't JSON, the raw string is surfaced as the output (success assumed) —
 * mirroring the spoken path, which feeds whatever came back to the model verbatim.
 */
export function ParseDelegationResultJson(resultJson: string): ParsedDelegationResult {
  try {
    const parsed = JSON.parse(resultJson) as {
      success?: boolean;
      output?: string;
      error?: string;
      runId?: string;
      artifacts?: unknown;
    };
    return {
      Success: parsed.success !== false,
      Output: parsed.output ?? parsed.error ?? '',
      RunID: typeof parsed.runId === 'string' && parsed.runId.length > 0 ? parsed.runId : undefined,
      Artifacts: parseArtifacts(parsed.artifacts)
    };
  } catch {
    return { Success: true, Output: resultJson };
  }
}

/**
 * Normalizes the raw `artifacts` array: entries must carry non-empty `artifactId` and
 * `artifactVersionId` strings (malformed entries are dropped); a missing/blank `name`
 * falls back to `"Artifact"`. Returns `undefined` when nothing valid remains.
 */
function parseArtifacts(raw: unknown): ParsedDelegationArtifact[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const artifacts: ParsedDelegationArtifact[] = [];
  for (const entry of raw as RawDelegationArtifact[]) {
    const artifactId = typeof entry?.artifactId === 'string' ? entry.artifactId : '';
    const versionId = typeof entry?.artifactVersionId === 'string' ? entry.artifactVersionId : '';
    if (artifactId.length === 0 || versionId.length === 0) {
      continue;
    }
    const name = typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name.trim() : 'Artifact';
    artifacts.push({ ArtifactID: artifactId, ArtifactVersionID: versionId, Name: name });
  }
  return artifacts.length > 0 ? artifacts : undefined;
}
