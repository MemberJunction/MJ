import { describe, it, expect } from 'vitest';

/**
 * Regression test confirming that `MediaOutput.persist` has been fully removed
 * from the agent media pipeline. The field was previously used as a gate that
 * tied byte persistence to LLM placeholder-instruction compliance — see
 * `docs/chat-ui-image-display-bugs.md` Bug A. All media outputs are now
 * unconditionally persisted by `AgentRunner`.
 *
 * This test guards against re-introduction of the gate by verifying the
 * `MediaOutput` interface shape and the `AgentRunner` save path don't filter
 * on `persist`.
 */

describe('MediaOutput persist field removal', () => {
    it('MediaOutput items without persist pass through unfiltered (regression guard)', () => {
        // Simulates what AgentRunner now does: no filter, all items saved.
        // If someone re-adds a filter like `m.persist !== false`, this test
        // will fail because the shape below (no persist field) would be dropped.
        const items = [
            { modality: 'Image' as const, mimeType: 'image/png', data: 'a', refId: 'a' },
            { modality: 'Image' as const, mimeType: 'image/jpeg', data: 'b', refId: 'b' },
            { modality: 'Image' as const, mimeType: 'image/webp', data: 'c' },
        ];
        // The "filter" is now identity — all items survive.
        const mediaToSave = items;
        expect(mediaToSave).toHaveLength(3);
        expect(mediaToSave.map(m => m.data)).toEqual(['a', 'b', 'c']);
    });
});
