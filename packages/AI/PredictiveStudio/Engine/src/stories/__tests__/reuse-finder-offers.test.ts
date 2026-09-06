import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * What the finder OFFERS must be loadable.
 *
 * `IsTrained` and `ArtifactFileID` are two different facts, and the graph loader
 * (`train-graph-seam.ts`) requires both — it refuses a component that is "marked trained but has no
 * stored artifact" by name. Offering candidates on `IsTrained` alone therefore advertises rows that
 * are guaranteed to fail the moment a caller accepts one, and the failure lands at the point of use
 * rather than at the point of choice.
 *
 * This is not hypothetical: bagging exposes an unfitted template rather than its bags, so a bagged
 * base estimator is legitimately `IsTrained` with no artifact. It exists in real data, and it must
 * never be offered.
 */
const mockRunView = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: Object.assign(
            class {
                RunView = (...args: unknown[]) => mockRunView(...args);
            },
            { FromMetadataProvider: () => ({ RunView: (...args: unknown[]) => mockRunView(...args) }) },
        ),
    };
});

import { ReuseFinder } from '../reuse-finder';

/** The ExtraFilter the finder sent for its candidate read. */
function filterSent(): string {
    expect(mockRunView).toHaveBeenCalled();
    const params = mockRunView.mock.calls[0][0] as { ExtraFilter?: string };
    return params.ExtraFilter ?? '';
}

describe('ReuseFinder — never offers what the loader will refuse', () => {
    beforeEach(() => {
        // Braces matter: an arrow body would RETURN the mock, and vitest calls a beforeEach's
        // return value as a teardown hook.
        mockRunView.mockReset();
        mockRunView.mockResolvedValue({ Success: true, Results: [] });
    });

    it('requires a stored artifact, not merely IsTrained, when asking for trained components', async () => {
        await new ReuseFinder().find({ QueryVector: [1, 0] });

        const filter = filterSent();
        expect(filter).toContain('IsTrained = 1');
        // The half that was missing: without it the finder offers bagged base estimators and every
        // other fitted-but-unserialisable node, and the graph loader then refuses them.
        expect(filter).toContain('ArtifactFileID IS NOT NULL');
    });

    it('drops both requirements together when the caller asks for untrained components too', async () => {
        await new ReuseFinder().find({ QueryVector: [1, 0], TrainedOnly: false });

        const filter = filterSent();
        expect(filter).not.toContain('IsTrained = 1');
        // Asking for untrained components means the artifact requirement is not applicable either —
        // it must not silently survive and filter out the very rows that were asked for.
        expect(filter).not.toContain('ArtifactFileID IS NOT NULL');
    });

    it('always requires an embedded story, since an unembedded row cannot be ranked at all', async () => {
        await new ReuseFinder().find({ QueryVector: [1, 0], TrainedOnly: false });
        expect(filterSent()).toContain('StoryVector IS NOT NULL');
    });
});
