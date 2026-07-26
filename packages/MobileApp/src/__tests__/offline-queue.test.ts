import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for the offline mutation queue (P3.2) and its replay engine.
 *
 * The queue persists through the in-memory `react-native-mmkv` stub from setup.ts.
 * The replay engine (`offline-sync`) talks to the MJ object model, so we mock
 * `@memberjunction/core` with a `FakeEntity` whose per-entry behavior — `'ok'`,
 * `'business'` (Save returns false), `'network'` (Save throws), or `'notfound'`
 * (InnerLoad returns false) — is scripted through `state.behaviors`, consumed one
 * per replayed mutation in FIFO order.
 */
type Behavior = 'ok' | 'business' | 'network' | 'notfound';

const state = vi.hoisted(() => ({
    behaviors: [] as Behavior[],
    index: 0,
    saved: [] as Array<{ entityName: string; pk: string | null; fields: Record<string, unknown> }>,
}));

vi.mock('@memberjunction/core', () => {
    class FakeEntity {
        entityName = '';
        loadedPk: string | null = null;
        behavior: Behavior = 'ok';
        LatestResult = { CompleteMessage: 'business rule violation' };
        private fields: Record<string, unknown> = {};
        NewRecord(): boolean {
            return true;
        }
        Set(field: string, value: unknown): void {
            this.fields[field] = value;
        }
        Get(field: string): unknown {
            return this.fields[field];
        }
        async InnerLoad(key: { id: string }): Promise<boolean> {
            this.loadedPk = key.id;
            return this.behavior !== 'notfound';
        }
        async Save(): Promise<boolean> {
            if (this.behavior === 'network') throw new Error('Network request failed');
            if (this.behavior === 'business') return false;
            state.saved.push({ entityName: this.entityName, pk: this.loadedPk, fields: { ...this.fields } });
            return true;
        }
    }
    class Metadata {
        async GetEntityObject<T = FakeEntity>(name: string): Promise<T> {
            const entity = new FakeEntity();
            entity.entityName = name;
            entity.behavior = state.behaviors[state.index] ?? 'ok';
            state.index += 1;
            return entity as unknown as T;
        }
    }
    const CompositeKey = { FromID: (id: string) => ({ id }) };
    class BaseEntity {}
    return { Metadata, CompositeKey, BaseEntity };
});

import { enqueue, list, remove, count, clear, subscribe, type OfflineMutationInput } from '@/data/offline-queue';
import { replayQueue } from '@/data/offline-sync';

/** Build an update mutation input with overridable fields. */
function mutation(overrides: Partial<OfflineMutationInput> = {}): OfflineMutationInput {
    return {
        entityName: 'Users',
        primaryKey: 'r1',
        changedFields: { Name: 'Ada' },
        op: 'update',
        ...overrides,
    };
}

beforeEach(() => {
    clear();
    state.behaviors = [];
    state.index = 0;
    state.saved = [];
});

describe('offline-queue', () => {
    it('enqueues and lists in FIFO order', () => {
        enqueue(mutation({ primaryKey: 'a' }));
        enqueue(mutation({ primaryKey: 'b' }));
        enqueue(mutation({ primaryKey: 'c' }));
        expect(list().map((e) => e.primaryKey)).toEqual(['a', 'b', 'c']);
    });

    it('assigns a unique id and a queuedAt timestamp', () => {
        const a = enqueue(mutation());
        const b = enqueue(mutation());
        expect(a.id).not.toBe(b.id);
        expect(typeof a.queuedAt).toBe('number');
    });

    it('counts and clears', () => {
        enqueue(mutation());
        enqueue(mutation());
        expect(count()).toBe(2);
        clear();
        expect(count()).toBe(0);
        expect(list()).toEqual([]);
    });

    it('removes a single entry by id (no-op for unknown id)', () => {
        const a = enqueue(mutation({ primaryKey: 'a' }));
        enqueue(mutation({ primaryKey: 'b' }));
        remove('does-not-exist');
        expect(count()).toBe(2);
        remove(a.id);
        expect(list().map((e) => e.primaryKey)).toEqual(['b']);
    });

    it('survives a JSON persistence round-trip with scalar types intact', () => {
        enqueue(mutation({ changedFields: { Name: 'Ada', Age: 42, Active: true, Note: null } }));
        const [entry] = list();
        expect(entry.changedFields).toEqual({ Name: 'Ada', Age: 42, Active: true, Note: null });
        expect(typeof entry.changedFields.Age).toBe('number');
        expect(typeof entry.changedFields.Active).toBe('boolean');
    });

    it('notifies subscribers with the new count on change', () => {
        const seen: number[] = [];
        const unsub = subscribe((n) => seen.push(n));
        enqueue(mutation());
        enqueue(mutation());
        remove(list()[0].id);
        clear();
        unsub();
        enqueue(mutation()); // after unsubscribe — should not be recorded
        expect(seen).toEqual([1, 2, 1, 0]);
    });
});

describe('replayQueue', () => {
    it('syncs every entry on the happy path and applies changed fields', async () => {
        enqueue(mutation({ primaryKey: 'r1', changedFields: { Name: 'Bob', Age: 30 } }));
        enqueue(mutation({ primaryKey: 'r2', changedFields: { Name: 'Cy' } }));
        state.behaviors = ['ok', 'ok'];

        const result = await replayQueue();

        expect(result).toEqual({ synced: 2, failed: 0 });
        expect(count()).toBe(0);
        expect(state.saved[0]).toEqual({ entityName: 'Users', pk: 'r1', fields: { Name: 'Bob', Age: 30 } });
    });

    it('drops a business failure (Save returns false) but continues the pass', async () => {
        enqueue(mutation({ primaryKey: 'bad' }));
        enqueue(mutation({ primaryKey: 'good' }));
        state.behaviors = ['business', 'ok'];

        const result = await replayQueue();

        expect(result).toEqual({ synced: 1, failed: 1 });
        expect(count()).toBe(0); // both removed: one synced, one dropped
        expect(state.saved.map((s) => s.pk)).toEqual(['good']);
    });

    it('drops an entry whose record no longer exists (InnerLoad false)', async () => {
        enqueue(mutation({ primaryKey: 'gone' }));
        state.behaviors = ['notfound'];

        const result = await replayQueue();

        expect(result).toEqual({ synced: 0, failed: 1 });
        expect(count()).toBe(0);
    });

    it('stops on a network throw, leaving that and later entries queued', async () => {
        enqueue(mutation({ primaryKey: 'first' }));
        enqueue(mutation({ primaryKey: 'second' }));
        enqueue(mutation({ primaryKey: 'third' }));
        state.behaviors = ['ok', 'network', 'ok'];

        const result = await replayQueue();

        expect(result).toEqual({ synced: 1, failed: 0 });
        // first synced+removed; second (network) and third remain queued.
        expect(list().map((e) => e.primaryKey)).toEqual(['second', 'third']);
        expect(list()[0].lastError).toMatch(/network/i);
    });

    it('is safe to call repeatedly (idempotent)', async () => {
        enqueue(mutation({ primaryKey: 'r1' }));
        state.behaviors = ['ok'];
        await replayQueue();
        const second = await replayQueue();
        expect(second).toEqual({ synced: 0, failed: 0 });
        expect(count()).toBe(0);
    });
});
