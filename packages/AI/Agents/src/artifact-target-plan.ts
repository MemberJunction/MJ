/**
 * @fileoverview Pure decision function for artifact targeting: maps an agent's per-step
 * {@link ArtifactDirective} plus the run's `sourceArtifactId` onto a single
 * {@link ArtifactTargetPlan} that `AgentRunner.ProcessAgentArtifacts` executes.
 *
 * Kept separate from the runner so the decision table is unit-testable without a DB,
 * a provider, or an agent run. No I/O, no state, no imports beyond the directive type.
 *
 * @module @memberjunction/ai-agents
 */
import type { ArtifactDirective } from '@memberjunction/ai-core-plus';

/**
 * Who named the artifact a `version` plan points at.
 *
 * This is carried explicitly rather than re-derived by comparing the planned id against
 * `directive.targetArtifactId`, because those two values can legitimately be EQUAL — an agent
 * echoing the run's own `sourceArtifactId` back as its target is natural model behavior. A
 * value comparison then mistakes a caller-supplied id for model output (subjecting a trusted id
 * to the model-output guards) and, worse, lets an id the guards just rejected reappear through
 * the fallback and be treated as vetted. Provenance is a property of where the value CAME FROM,
 * so it is recorded at the point the decision is made.
 *
 * - `directive`: the agent named it. Model output — untrusted, and validated before use.
 * - `caller`: it came from the run's `sourceArtifactId` (a server-side argument).
 */
export type ArtifactTargetSource = 'directive' | 'caller';

/** Where the payload of a completed agent step should be persisted. */
export type ArtifactTargetPlan =
    | { kind: 'suppress' }
    | { kind: 'create-new' }
    /**
     * Version an existing artifact.
     *
     * `artifactId` is typed `string` for callers' convenience, but when `source` is `'directive'`
     * the value is unvalidated model output that arrived as parsed JSON: it may be any JSON type,
     * may carry surrounding whitespace, and may not be UUID-shaped at all. The runner validates
     * it before it reaches a query. Do not interpolate it into SQL on the strength of this type.
     */
    | { kind: 'version'; artifactId: string; source: ArtifactTargetSource }
    | { kind: 'legacy' };

/** The behaviors {@link planArtifactTarget} recognizes. Anything else is treated as no directive. */
export const ARTIFACT_DIRECTIVE_BEHAVIORS: ReadonlyArray<ArtifactDirective['behavior']> = [
    'create-new',
    'version-source',
    'suppress',
];

/**
 * True when `behavior` is one of the behaviors this module implements.
 *
 * Directives arrive as parsed model output, so the `behavior` field is not guaranteed to hold one
 * of its declared literals — it can be a typo (`'createNew'`), a renamed wire value, a value from
 * a newer producer, or not a string at all. Callers use this to LOG the mismatch; the mapping
 * itself degrades silently so an unrecognized behavior is never worse than no directive.
 */
export function IsKnownArtifactBehavior(behavior: unknown): behavior is ArtifactDirective['behavior'] {
    return typeof behavior === 'string' && (ARTIFACT_DIRECTIVE_BEHAVIORS as ReadonlyArray<string>).includes(behavior);
}

/**
 * Maps the agent's per-step directive plus the run's sourceArtifactId onto a target plan.
 * Pure — no I/O. Absent directive reproduces AgentRunner's historical behavior exactly:
 * a sourceArtifactId is versioned, otherwise the legacy chain (previous artifact on the
 * message, else a new artifact) applies.
 *
 * An UNRECOGNIZED behavior resolves exactly like an absent directive. It deliberately does not
 * fall straight through to `'legacy'`: 'legacy' means "previous artifact on this message, else a
 * new one", and on a fresh agent-response detail there is no previous artifact — so dropping the
 * run's `sourceArtifactId` on the floor would make a garbled directive STRICTER than no directive
 * at all, silently starting a new artifact where the continuity signal said to add a version.
 * The caller logs the mismatch (see {@link IsKnownArtifactBehavior}); this function stays pure.
 *
 * @param directive - The step's artifact directive, or undefined when the agent asked for nothing.
 * @param sourceArtifactId - The artifact the run was launched against, if any.
 * @returns The plan to execute: suppress, create-new, version a specific artifact, or legacy chain.
 */
export function planArtifactTarget(
    directive: ArtifactDirective | undefined,
    sourceArtifactId: string | undefined
): ArtifactTargetPlan {
    /** The historical chain: version the caller's artifact when there is one, else look behind the message. */
    const withoutDirective = (): ArtifactTargetPlan =>
        sourceArtifactId ? { kind: 'version', artifactId: sourceArtifactId, source: 'caller' } : { kind: 'legacy' };

    if (!directive || !IsKnownArtifactBehavior(directive.behavior)) {
        return withoutDirective();
    }

    switch (directive.behavior) {
        case 'suppress':
            return { kind: 'suppress' };
        case 'create-new':
            return { kind: 'create-new' };
        case 'version-source':
            return directive.targetArtifactId
                ? { kind: 'version', artifactId: directive.targetArtifactId, source: 'directive' }
                : withoutDirective();
        default:
            // Unreachable while ARTIFACT_DIRECTIVE_BEHAVIORS and the union agree; kept so adding a
            // behavior to the type without handling it here degrades instead of returning undefined.
            return withoutDirective();
    }
}
