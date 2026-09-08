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

/** Where the payload of a completed agent step should be persisted. */
export type ArtifactTargetPlan =
    | { kind: 'suppress' }
    | { kind: 'create-new' }
    | { kind: 'version'; artifactId: string }
    | { kind: 'legacy' };

/**
 * Maps the agent's per-step directive plus the run's sourceArtifactId onto a target plan.
 * Pure — no I/O. Absent directive reproduces AgentRunner's historical behavior exactly:
 * a sourceArtifactId is versioned, otherwise the legacy chain (previous artifact on the
 * message, else a new artifact) applies.
 *
 * @param directive - The step's artifact directive, or undefined when the agent asked for nothing.
 * @param sourceArtifactId - The artifact the run was launched against, if any.
 * @returns The plan to execute: suppress, create-new, version a specific artifact, or legacy chain.
 */
export function planArtifactTarget(
    directive: ArtifactDirective | undefined,
    sourceArtifactId: string | undefined
): ArtifactTargetPlan {
    if (!directive) {
        return sourceArtifactId ? { kind: 'version', artifactId: sourceArtifactId } : { kind: 'legacy' };
    }
    switch (directive.behavior) {
        case 'suppress':
            return { kind: 'suppress' };
        case 'create-new':
            return { kind: 'create-new' };
        case 'version-source': {
            const target = directive.targetArtifactId || sourceArtifactId;
            return target ? { kind: 'version', artifactId: target } : { kind: 'legacy' };
        }
        default:
            // Unreachable for a well-typed directive; directives arrive from model output, so an
            // unrecognized behavior degrades to the historical chain rather than throwing.
            return { kind: 'legacy' };
    }
}
