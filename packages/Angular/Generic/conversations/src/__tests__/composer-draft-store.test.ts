/**
 * Unit tests for ComposerDraftStore — the UserInfoEngine-backed persistence for
 * in-progress composer drafts. UserInfoEngine is mocked to a settings spy; the
 * store's contracts under test: single lazy load, key normalization ('new'
 * sentinel + lowercased conversation ids), debounced set vs immediate
 * clear/flush, empty-draft deletion, unchanged-skip, LRU eviction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const settings = new Map<string, string>();
const setDebounced = vi.fn((key: string, value: string) => { settings.set(key, value); });
const setImmediate = vi.fn(async (key: string, value: string) => { settings.set(key, value); return true; });
const getSetting = vi.fn((key: string) => settings.get(key));

vi.mock('@memberjunction/core-entities', () => ({
    UserInfoEngine: {
        get Instance() {
            return {
                GetSetting: getSetting,
                SetSettingDebounced: setDebounced,
                SetSetting: setImmediate,
            };
        },
    },
}));

import { ComposerDraftStore } from '../lib/services/composer-draft-store';

const KEY = ComposerDraftStore.COMPOSER_DRAFTS_SETTING;

function storedMap(): Record<string, string> {
    return JSON.parse(settings.get(KEY) ?? '{}');
}

describe('ComposerDraftStore', () => {
    beforeEach(() => {
        settings.clear();
        setDebounced.mockClear();
        setImmediate.mockClear();
        getSetting.mockClear();
    });

    it('KeyFor: null/undefined → the new-conversation sentinel; ids lowercase-normalized', () => {
        expect(ComposerDraftStore.KeyFor(null)).toBe('new');
        expect(ComposerDraftStore.KeyFor(undefined)).toBe('new');
        expect(ComposerDraftStore.KeyFor(' ABC-DEF ')).toBe('abc-def');
    });

    it('round-trips a draft and persists via the debounced writer', () => {
        const store = new ComposerDraftStore();
        store.SetDraft('CONVO-1', 'hello @{"type":"agent","id":"a1","name":"Sage"} ');
        expect(store.GetDraft('convo-1')).toContain('Sage');
        expect(setDebounced).toHaveBeenCalledTimes(1);
        expect(storedMap()['convo-1']).toContain('Sage');
    });

    it('loads the persisted map exactly once per instance', () => {
        settings.set(KEY, JSON.stringify({ new: 'draft in progress' }));
        const store = new ComposerDraftStore();
        expect(store.GetDraft(null)).toBe('draft in progress');
        store.GetDraft(null);
        store.GetDraft('x');
        expect(getSetting).toHaveBeenCalledTimes(1);
    });

    it('empty text deletes the entry; a no-op empty set skips the write entirely', () => {
        const store = new ComposerDraftStore();
        store.SetDraft('c1', 'something');
        setDebounced.mockClear();
        store.SetDraft('c1', '   ');
        expect(store.GetDraft('c1')).toBeNull();
        expect(setDebounced).toHaveBeenCalledTimes(1);
        store.SetDraft('c2', '');
        expect(setDebounced).toHaveBeenCalledTimes(1); // nothing stored for c2 — no write
    });

    it('skips the write when the draft is unchanged', () => {
        const store = new ComposerDraftStore();
        store.SetDraft('c1', 'same');
        store.SetDraft('c1', 'same');
        expect(setDebounced).toHaveBeenCalledTimes(1);
    });

    it('ClearDraft deletes the key and persists IMMEDIATELY (send path)', () => {
        const store = new ComposerDraftStore();
        store.SetDraft('c1', 'to be sent');
        store.ClearDraft('C1');
        expect(store.GetDraft('c1')).toBeNull();
        expect(setImmediate).toHaveBeenCalledTimes(1);
        expect(storedMap()['c1']).toBeUndefined();
    });

    it('evicts the least-recently-updated draft beyond the cap', () => {
        const store = new ComposerDraftStore();
        for (let i = 0; i < ComposerDraftStore.MAX_DRAFTS; i++) {
            store.SetDraft(`c${i}`, `draft ${i}`);
        }
        store.SetDraft('c0', 'refreshed'); // c0 becomes most-recent
        store.SetDraft('overflow', 'one more');
        expect(store.GetDraft('c0')).toBe('refreshed');
        expect(store.GetDraft('c1')).toBeNull(); // oldest evicted
        expect(store.GetDraft('overflow')).toBe('one more');
    });

    it('caps per-draft length', () => {
        const store = new ComposerDraftStore();
        store.SetDraft('c1', 'x'.repeat(ComposerDraftStore.MAX_DRAFT_LENGTH + 500));
        expect(store.GetDraft('c1')!.length).toBe(ComposerDraftStore.MAX_DRAFT_LENGTH);
    });

    it('recovers from a corrupt persisted payload', () => {
        settings.set(KEY, '{not json');
        const store = new ComposerDraftStore();
        expect(store.GetDraft(null)).toBeNull();
        store.SetDraft(null, 'fresh start');
        expect(storedMap()['new']).toBe('fresh start');
    });

    it('Flush persists immediately once anything has loaded', () => {
        const store = new ComposerDraftStore();
        store.Flush(); // never loaded — no write
        expect(setImmediate).not.toHaveBeenCalled();
        store.SetDraft('c1', 'text');
        store.Flush();
        expect(setImmediate).toHaveBeenCalledTimes(1);
    });
});
