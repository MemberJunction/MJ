import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the portable half of attachment persistence.
 *
 * This module is deliberately free of any Expo import — reading bytes off a device is the capture
 * layer's job — which is what lets it be exercised here under Node, and against a live server in
 * `integration/attachments.itest.ts`. These tests cover the modality lookup, the one piece with
 * state of its own.
 */
const state = vi.hoisted(() => ({
    /** Every `RunView` the code under test issued, so caching can be asserted rather than assumed. */
    queries: [] as Array<{ EntityName: string; ExtraFilter?: string }>,
    success: true,
    modalities: [
        { ID: 'mod-image', Name: 'Image' },
        { ID: 'mod-audio', Name: 'Audio' },
        { ID: 'mod-file', Name: 'File' },
    ] as Array<{ ID: string; Name: string }>,
}));

vi.mock('@memberjunction/core', () => {
    class RunView {
        async RunView(params: { EntityName: string; ExtraFilter?: string }) {
            state.queries.push(params);
            return { Success: state.success, Results: state.modalities };
        }
    }
    class Metadata {
        CurrentUser = { ID: 'user-1' };
        async GetEntityObject() {
            throw new Error('not needed for these tests');
        }
    }
    return { RunView, Metadata };
});

vi.mock('@memberjunction/ai-core-plus', () => ({
    ConversationUtility: { ShouldStoreInline: () => true, GetAttachmentTypeFromMime: () => 'Image' },
    DEFAULT_INLINE_STORAGE_THRESHOLD_BYTES: 1_048_576,
}));

import { ResolveModalityIdForTest, ResetModalityCache } from '@/data/services/attachment-storage';

const user = { ID: 'user-1' } as never;

beforeEach(() => {
    state.queries = [];
    state.success = true;
    ResetModalityCache();
});

describe('modality resolution', () => {
    it('resolves a modality id by name', async () => {
        expect(await ResolveModalityIdForTest('Image', user)).toBe('mod-image');
    });

    it('reads the table once and serves later lookups from memory', async () => {
        // A filtered query per attachment costs a round trip on the path the user is actively
        // waiting on — they just took a photo — for a table of four unchanging rows.
        await ResolveModalityIdForTest('Image', user);
        await ResolveModalityIdForTest('Audio', user);
        await ResolveModalityIdForTest('File', user);
        expect(state.queries).toHaveLength(1);
        expect(state.queries[0].EntityName).toBe('MJ: AI Modalities');
    });

    it('interpolates no name into SQL — the whole table is read unfiltered', async () => {
        // The previous shape built `Name='...'` with a hand-rolled quote escape, which the repo's
        // data-access rule forbids outright. Reading the table removes the question.
        await ResolveModalityIdForTest('Image', user);
        expect(state.queries[0].ExtraFilter).toBeUndefined();
    });

    it('matches case-insensitively, since the name is a code-side constant', async () => {
        expect(await ResolveModalityIdForTest('image', user)).toBe('mod-image');
    });

    it('returns null for a modality this deployment does not define', async () => {
        expect(await ResolveModalityIdForTest('Hologram', user)).toBeNull();
    });

    it('does NOT cache a failed load — a network blip must not poison the session', async () => {
        state.success = false;
        expect(await ResolveModalityIdForTest('Image', user)).toBeNull();

        state.success = true;
        expect(await ResolveModalityIdForTest('Image', user)).toBe('mod-image');
        expect(state.queries).toHaveLength(2);
    });
});
