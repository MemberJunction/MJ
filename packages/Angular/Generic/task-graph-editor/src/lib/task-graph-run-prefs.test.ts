import { describe, expect, it } from 'vitest';
import {
    DEFAULT_TASK_GRAPH_RUN_PREFS,
    ParseTaskGraphRunPrefs,
    TASK_GRAPH_RUN_PREFS_KEY,
    TaskGraphRunPrefsStore,
} from './task-graph-run-prefs';

describe('ParseTaskGraphRunPrefs', () => {
    it('returns defaults when nothing is stored', () => {
        const prefs = ParseTaskGraphRunPrefs(undefined);
        expect(prefs.InvocationOpen).toBe(false);
        expect(prefs.InvocationSplit).toEqual(DEFAULT_TASK_GRAPH_RUN_PREFS.InvocationSplit);
    });

    it('keeps a saved open state and split', () => {
        const prefs = ParseTaskGraphRunPrefs(JSON.stringify({
            InvocationOpen: true,
            InvocationSplit: [30, 70],
        }));
        expect(prefs.InvocationOpen).toBe(true);
        expect(prefs.InvocationSplit).toEqual([30, 70]);
    });

    it('fills missing fields from defaults so a later field can be added', () => {
        const prefs = ParseTaskGraphRunPrefs(JSON.stringify({ InvocationOpen: true }));
        expect(prefs.InvocationOpen).toBe(true);
        expect(prefs.InvocationSplit).toEqual(DEFAULT_TASK_GRAPH_RUN_PREFS.InvocationSplit);
    });

    it('ignores a split that would hide a pane', () => {
        const prefs = ParseTaskGraphRunPrefs(JSON.stringify({
            InvocationOpen: true,
            InvocationSplit: [0, 100],
        }));
        expect(prefs.InvocationSplit).toEqual(DEFAULT_TASK_GRAPH_RUN_PREFS.InvocationSplit);
    });

    it('ignores unreadable JSON', () => {
        expect(ParseTaskGraphRunPrefs('not json').InvocationOpen).toBe(false);
        expect(ParseTaskGraphRunPrefs('[]').InvocationOpen).toBe(false);
    });
});

describe('TaskGraphRunPrefsStore', () => {
    it('restores and writes one JSON object under the shared key', () => {
        const settings = new Map<string, string>();
        const store = new TaskGraphRunPrefsStore({
            Get: (key) => settings.get(key),
            Set: (key, value) => { settings.set(key, value); },
        });
        store.Restore();
        expect(store.Value.InvocationOpen).toBe(false);

        store.SetInvocationOpen(true);
        store.SetInvocationSplit([28, 72]);
        expect(settings.has(TASK_GRAPH_RUN_PREFS_KEY)).toBe(true);

        const again = new TaskGraphRunPrefsStore({
            Get: (key) => settings.get(key),
            Set: (key, value) => { settings.set(key, value); },
        });
        again.Restore();
        expect(again.Value.InvocationOpen).toBe(true);
        expect(again.Value.InvocationSplit).toEqual([28, 72]);
    });

    it('keeps the last dragged width when the pane is minimized and reopened', () => {
        const settings = new Map<string, string>();
        const store = new TaskGraphRunPrefsStore({
            Get: (key) => settings.get(key),
            Set: (key, value) => { settings.set(key, value); },
        });
        store.SetInvocationSplit([18, 82]);
        store.SetInvocationOpen(false);
        store.SetInvocationOpen(true);
        expect(store.Value.InvocationSplit).toEqual([18, 82]);
    });
});
