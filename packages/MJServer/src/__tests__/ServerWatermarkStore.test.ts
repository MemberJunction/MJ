/**
 * Memory-leak audit Round 23: `ArtifactCollaborationServer` kept one server watermark per
 * collaboration room for the life of the process, and each watermark holds the artifact's full text.
 * `ServerWatermarkStore` bounds both the number of watermarks and the text they hold.
 */
import { describe, expect, it } from 'vitest';
import { ServerWatermarkStore, type ServerPersistedWatermark } from '../collaboration/ServerWatermarkStore.js';

function watermark(text: string, versionNumber = 1): ServerPersistedWatermark {
    return {
        BaseVersionID: `version-${versionNumber}`,
        BaseVersionNumber: versionNumber,
        BaseVersionText: text,
        LastAppliedRestoreVersionID: null,
        LastAppliedRestoreVersionNumber: 0,
        UpdatedAtMs: 0,
    };
}

describe('ServerWatermarkStore', () => {
    it('returns what was recorded and undefined for an unknown room', () => {
        const store = new ServerWatermarkStore();
        store.Set('room-a', watermark('alpha', 3));

        expect(store.Get('room-a')?.BaseVersionNumber).toBe(3);
        expect(store.Get('room-b')).toBeUndefined();
        expect(store.Size).toBe(1);
        expect(store.TotalTextLength).toBe(5);
    });

    it('evicts the least recently used watermark past the entry cap', () => {
        const store = new ServerWatermarkStore({ MaxEntries: 3 });
        store.Set('a', watermark('a'));
        store.Set('b', watermark('b'));
        store.Set('c', watermark('c'));
        store.Set('d', watermark('d'));

        expect(store.Size).toBe(3);
        expect(store.Get('a')).toBeUndefined();
        expect(store.Get('d')).toBeDefined();
    });

    it('treats a read as use, so an active room keeps its watermark', () => {
        const store = new ServerWatermarkStore({ MaxEntries: 2 });
        store.Set('active', watermark('x'));
        store.Set('idle', watermark('y'));

        store.Get('active');
        store.Set('new', watermark('z'));

        expect(store.Get('active')).toBeDefined();
        expect(store.Get('idle')).toBeUndefined();
    });

    it('evicts oldest watermarks until the held text fits the budget', () => {
        const store = new ServerWatermarkStore({ MaxEntries: 100, MaxTextLength: 10 });
        store.Set('a', watermark('aaaa'));
        store.Set('b', watermark('bbbb'));
        store.Set('c', watermark('cccc'));

        expect(store.Get('a')).toBeUndefined();
        expect(store.Size).toBe(2);
        expect(store.TotalTextLength).toBe(8);
    });

    it('keeps the newest watermark even when it alone exceeds the text budget', () => {
        const store = new ServerWatermarkStore({ MaxTextLength: 4 });
        store.Set('small', watermark('ab'));
        store.Set('huge', watermark('0123456789'));

        expect(store.Size).toBe(1);
        expect(store.Get('huge')?.BaseVersionText).toBe('0123456789');
        expect(store.TotalTextLength).toBe(10);
    });

    it('replacing a room watermark does not double count its text', () => {
        const store = new ServerWatermarkStore();
        store.Set('room', watermark('12345', 1));
        store.Set('room', watermark('123', 2));

        expect(store.Size).toBe(1);
        expect(store.TotalTextLength).toBe(3);
        expect(store.Get('room')?.BaseVersionNumber).toBe(2);
    });

    it('Clear empties the store and resets the text total', () => {
        const store = new ServerWatermarkStore();
        store.Set('a', watermark('aaaa'));
        store.Clear();

        expect(store.Size).toBe(0);
        expect(store.TotalTextLength).toBe(0);
        expect(store.Get('a')).toBeUndefined();
    });

    it('falls back to the defaults for limits that are not positive numbers', () => {
        const store = new ServerWatermarkStore({ MaxEntries: 0, MaxTextLength: Number.NaN });
        for (let i = 0; i < ServerWatermarkStore.DEFAULT_MAX_ENTRIES + 25; i++) {
            store.Set(`room-${i}`, watermark('t'));
        }

        expect(store.Size).toBe(ServerWatermarkStore.DEFAULT_MAX_ENTRIES);
    });
});
