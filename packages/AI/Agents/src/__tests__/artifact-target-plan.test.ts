/**
 * Unit tests for {@link planArtifactTarget} — the pure mapping from an agent's per-step
 * {@link ArtifactDirective} plus the run's `sourceArtifactId` onto an artifact target plan.
 *
 * Covers every branch of the decision table: absent directive (legacy behavior preserved),
 * each of the three directive behaviors, and the three `version-source` resolutions
 * (explicit target, run source, neither). Pure function — no DB, no mocks, no I/O.
 */
import { describe, it, expect } from 'vitest';
import { planArtifactTarget } from '../artifact-target-plan';

describe('planArtifactTarget', () => {
    it('no directive + sourceArtifactId → version the source (legacy behavior preserved)', () => {
        expect(planArtifactTarget(undefined, 'src-1')).toEqual({ kind: 'version', artifactId: 'src-1' });
    });

    it('no directive + no source → legacy chain (previous-on-message, else new)', () => {
        expect(planArtifactTarget(undefined, undefined)).toEqual({ kind: 'legacy' });
    });

    it("'suppress' wins regardless of source", () => {
        expect(planArtifactTarget({ behavior: 'suppress' }, 'src-1')).toEqual({ kind: 'suppress' });
    });

    it("'create-new' ignores the source", () => {
        expect(planArtifactTarget({ behavior: 'create-new', name: 'X' }, 'src-1')).toEqual({ kind: 'create-new' });
    });

    it("'version-source' prefers targetArtifactId over the run's source", () => {
        expect(planArtifactTarget({ behavior: 'version-source', targetArtifactId: 'art-A' }, 'art-B'))
            .toEqual({ kind: 'version', artifactId: 'art-A' });
    });

    it("'version-source' without a target uses the run's source", () => {
        expect(planArtifactTarget({ behavior: 'version-source' }, 'art-B')).toEqual({ kind: 'version', artifactId: 'art-B' });
    });

    it("'version-source' with neither target nor source falls back to legacy", () => {
        expect(planArtifactTarget({ behavior: 'version-source' }, undefined)).toEqual({ kind: 'legacy' });
    });
});
