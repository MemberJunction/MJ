/**
 * Unit tests for {@link planArtifactTarget} — the pure mapping from an agent's per-step
 * {@link ArtifactDirective} plus the run's `sourceArtifactId` onto an artifact target plan.
 *
 * Covers every branch of the decision table: absent directive (legacy behavior preserved),
 * each of the three directive behaviors, the three `version-source` resolutions (explicit target,
 * run source, neither), and an unrecognized behavior. Pure function — no DB, no mocks, no I/O.
 */
import { describe, it, expect } from 'vitest';
import type { ArtifactDirective } from '@memberjunction/ai-core-plus';
import { planArtifactTarget, IsKnownArtifactBehavior, ARTIFACT_DIRECTIVE_BEHAVIORS } from '../artifact-target-plan';

describe('planArtifactTarget', () => {
    it('no directive + sourceArtifactId → version the source (legacy behavior preserved)', () => {
        expect(planArtifactTarget(undefined, 'src-1')).toEqual({ kind: 'version', artifactId: 'src-1', source: 'caller' });
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
            .toEqual({ kind: 'version', artifactId: 'art-A', source: 'directive' });
    });

    it("'version-source' without a target uses the run's source", () => {
        expect(planArtifactTarget({ behavior: 'version-source' }, 'art-B'))
            .toEqual({ kind: 'version', artifactId: 'art-B', source: 'caller' });
    });

    it("'version-source' with neither target nor source falls back to legacy", () => {
        expect(planArtifactTarget({ behavior: 'version-source' }, undefined)).toEqual({ kind: 'legacy' });
    });

    /**
     * Provenance has to be carried, not re-derived by comparing the planned id against
     * `directive.targetArtifactId`: the two values can legitimately be EQUAL, because an agent
     * echoing the run's own source id back as its target is natural model behavior. A value
     * comparison then treats a caller-supplied id as model output — and lets an id the guards just
     * rejected reappear through the fallback wearing "already vetted".
     */
    it('records the agent as the source even when it echoes the run\'s own sourceArtifactId', () => {
        expect(planArtifactTarget({ behavior: 'version-source', targetArtifactId: 'same-id' }, 'same-id'))
            .toEqual({ kind: 'version', artifactId: 'same-id', source: 'directive' });
    });

    /**
     * An unrecognized behavior must be no WORSE than no directive at all. Returning 'legacy' here
     * would be stricter: 'legacy' means "previous artifact on this message, else a new one", and on
     * a fresh agent-response detail there is no previous artifact — so a typo in the wire value
     * would silently start a new artifact where the run's continuity signal said to add a version.
     */
    describe('an unrecognized behavior resolves exactly like no directive', () => {
        const garbled = ['createNew', 'create_new', 'Suppress', '', 'version_source'];

        for (const behavior of garbled) {
            it(`'${behavior}' + a source → still versions the source`, () => {
                const directive = { behavior } as unknown as ArtifactDirective;
                expect(planArtifactTarget(directive, 'src-1'))
                    .toEqual({ kind: 'version', artifactId: 'src-1', source: 'caller' });
            });
        }

        it('a non-string behavior + a source → still versions the source', () => {
            expect(planArtifactTarget({ behavior: null as unknown as 'suppress' }, 'src-1'))
                .toEqual({ kind: 'version', artifactId: 'src-1', source: 'caller' });
            expect(planArtifactTarget({ behavior: 7 as unknown as 'suppress' }, 'src-1'))
                .toEqual({ kind: 'version', artifactId: 'src-1', source: 'caller' });
        });

        it('with no source → legacy chain, same as no directive', () => {
            const directive = { behavior: 'createNew' } as unknown as ArtifactDirective;
            expect(planArtifactTarget(directive, undefined)).toEqual({ kind: 'legacy' });
        });

        it('ignores a targetArtifactId it cannot interpret the behavior for', () => {
            // Without a recognized behavior there is no instruction to version anything, so the
            // named target carries no authority — the caller's own id is used instead.
            const directive = { behavior: 'version_source', targetArtifactId: 'art-A' } as unknown as ArtifactDirective;
            expect(planArtifactTarget(directive, 'art-B'))
                .toEqual({ kind: 'version', artifactId: 'art-B', source: 'caller' });
        });
    });

    describe("'version-source' with a targetArtifactId that is not a string", () => {
        // Model output arrives as parsed JSON, so the field can hold any JSON type. Only a string can
        // name an artifact; anything else is discarded HERE, at the boundary that introduces it, so
        // the runner never has to reason about a non-string id.
        it('a number + a source → versions the run source, as if no target were named', () => {
            const d = { behavior: 'version-source', targetArtifactId: 5 as unknown as string } as ArtifactDirective;
            expect(planArtifactTarget(d, 'src-1')).toEqual({ kind: 'version', artifactId: 'src-1', source: 'caller' });
        });

        it('an object + a source → versions the run source', () => {
            const d = { behavior: 'version-source', targetArtifactId: { id: 'x' } as unknown as string } as ArtifactDirective;
            expect(planArtifactTarget(d, 'src-1')).toEqual({ kind: 'version', artifactId: 'src-1', source: 'caller' });
        });

        it('a number + no source → legacy chain', () => {
            const d = { behavior: 'version-source', targetArtifactId: 5 as unknown as string } as ArtifactDirective;
            expect(planArtifactTarget(d, undefined)).toEqual({ kind: 'legacy' });
        });

        it("a string is passed through untouched — shape, existence and authorization are the runner's job", () => {
            expect(planArtifactTarget({ behavior: 'version-source', targetArtifactId: ' not-a-uuid ' }, 'src-1'))
                .toEqual({ kind: 'version', artifactId: ' not-a-uuid ', source: 'directive' });
        });
    });
});

describe('IsKnownArtifactBehavior', () => {
    it('accepts every behavior the type declares', () => {
        expect(ARTIFACT_DIRECTIVE_BEHAVIORS).toEqual(['create-new', 'version-source', 'suppress']);
        for (const behavior of ARTIFACT_DIRECTIVE_BEHAVIORS) {
            expect(IsKnownArtifactBehavior(behavior)).toBe(true);
        }
    });

    it('rejects near-misses and non-strings', () => {
        for (const value of ['createNew', 'CREATE-NEW', '', null, undefined, 7, {}, ['suppress']]) {
            expect(IsKnownArtifactBehavior(value)).toBe(false);
        }
    });
});
