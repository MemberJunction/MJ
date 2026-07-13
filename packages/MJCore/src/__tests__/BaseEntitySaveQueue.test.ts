import { describe, it, expect, vi } from 'vitest';
import { BaseEntitySaveQueue } from '../generic/BaseEntitySaveQueue';
import type { BaseEntity } from '../generic/baseEntity';

/**
 * A fake entity whose Save records each call's options + resolution order, optionally returning false /
 * throwing to exercise the failure paths. Mirrors the AgentRunStepSaveQueue race test that this queue
 * subsumes.
 */
function fakeEntity(opts: { result?: boolean; throws?: boolean } = {}) {
    const calls: { ignoreDirtyState: boolean | undefined }[] = [];
    const entity = {
        ID: 'e-1',
        calls,
        EntityInfo: { Name: 'Fake' },
        LatestResult: { CompleteMessage: 'save failed' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Save: vi.fn(async (saveOptions?: any) => {
            calls.push({ ignoreDirtyState: saveOptions?.IgnoreDirtyState });
            if (opts.throws) {
                throw new Error('db exploded');
            }
            return opts.result ?? true;
        }),
    } as unknown as BaseEntity & { calls: { ignoreDirtyState: boolean | undefined }[] };
    return entity;
}

describe('BaseEntitySaveQueue', () => {
    it('Insert fires a normal (non-forced) save, awaited by Flush', async () => {
        const q = new BaseEntitySaveQueue();
        const e = fakeEntity();
        q.Insert(e);
        const result = await q.Flush();
        expect((e as unknown as { calls: { ignoreDirtyState: boolean | undefined }[] }).calls).toHaveLength(1);
        expect((e as unknown as { calls: { ignoreDirtyState: boolean | undefined }[] }).calls[0].ignoreDirtyState).toBeUndefined();
        expect(result.failures).toBe(0);
    });

    it('Update force-persists (IgnoreDirtyState) and runs AFTER the INSERT', async () => {
        const q = new BaseEntitySaveQueue();
        const e = fakeEntity();
        q.Insert(e);
        q.Update(e);
        await q.Flush();
        const calls = (e as unknown as { calls: { ignoreDirtyState: boolean | undefined }[] }).calls;
        expect(calls).toHaveLength(2);
        expect(calls[0].ignoreDirtyState).toBeUndefined();
        expect(calls[1].ignoreDirtyState).toBe(true);
    });

    it('Flush reports failures for saves that resolve false (not rejections)', async () => {
        const q = new BaseEntitySaveQueue();
        q.Insert(fakeEntity({ result: false }));
        const result = await q.Flush();
        expect(result.failures).toBe(1);
        expect(result.rejections).toBe(0);
    });

    it('swallows a throwing Save (logged, never propagated) and counts it as a failure', async () => {
        const q = new BaseEntitySaveQueue();
        q.Insert(fakeEntity({ throws: true }));
        const result = await q.Flush();
        expect(result.failures).toBe(1);
        expect(result.rejections).toBe(0);
    });

    it('Flush drains — a second Flush after no new work reports nothing', async () => {
        const q = new BaseEntitySaveQueue();
        q.Insert(fakeEntity());
        await q.Flush();
        expect((await q.Flush()).failures).toBe(0);
    });

    it('serializes successive updates to the same entity in order', async () => {
        const q = new BaseEntitySaveQueue();
        const e = fakeEntity();
        q.Insert(e);
        q.Update(e);
        q.Update(e);
        await q.Flush();
        expect((e as unknown as { Save: { mock: { calls: unknown[] } } }).Save.mock.calls).toHaveLength(3);
    });

    it('Update(applyMutation) applies the mutation AFTER the INSERT, so the INSERT reload cannot revert it (race fix)', async () => {
        const q = new BaseEntitySaveQueue();
        const persisted: string[] = [];
        let releaseInsert!: () => void;
        const insertGate = new Promise<void>((resolve) => { releaseInsert = resolve; });

        // Models BaseEntity: the INSERT's post-save finalizeSave (init()+SetMany) reverts any field mutated
        // while the INSERT was in flight; a forced UPDATE persists whatever the field holds when IT runs.
        const entity = {
            Status: 'Running',
            EntityInfo: { Name: 'Fake' },
            LatestResult: { CompleteMessage: '' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Save: vi.fn(async (saveOptions?: any) => {
                if (!saveOptions?.IgnoreDirtyState) {
                    await insertGate;
                    (entity as { Status: string }).Status = 'Running'; // reload reverts the in-flight mutation
                }
                persisted.push((entity as { Status: string }).Status);
                return true;
            }),
        } as unknown as BaseEntity & { Status: string };

        q.Insert(entity);
        // Caller mutates the shared entity while the INSERT is still in flight — the reload clobbers this.
        (entity as unknown as { Status: string }).Status = 'Completed';
        // ...but the same terminal state is queued as a post-INSERT mutation, re-asserted after the reload.
        q.Update(entity, (e) => { (e as unknown as { Status: string }).Status = 'Completed'; });
        releaseInsert();
        await q.Flush();

        expect(persisted).toEqual(['Running', 'Completed']);
        expect((entity as unknown as { Status: string }).Status).toBe('Completed');
    });

    it('without applyMutation, an in-flight INSERT reload clobbers the caller mutation (documents the bug the param fixes)', async () => {
        const q = new BaseEntitySaveQueue();
        const persisted: string[] = [];
        let releaseInsert!: () => void;
        const insertGate = new Promise<void>((resolve) => { releaseInsert = resolve; });
        const entity = {
            Status: 'Running',
            EntityInfo: { Name: 'Fake' },
            LatestResult: { CompleteMessage: '' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Save: vi.fn(async (saveOptions?: any) => {
                if (!saveOptions?.IgnoreDirtyState) {
                    await insertGate;
                    (entity as { Status: string }).Status = 'Running';
                }
                persisted.push((entity as { Status: string }).Status);
                return true;
            }),
        } as unknown as BaseEntity & { Status: string };

        q.Insert(entity);
        (entity as unknown as { Status: string }).Status = 'Completed';
        q.Update(entity); // no re-apply — legacy mutate-then-queue path
        releaseInsert();
        await q.Flush();

        expect(persisted).toEqual(['Running', 'Running']);
    });

    it('routes a failed save to the provided onError handler (not the default LogError)', async () => {
        const messages: string[] = [];
        const q = new BaseEntitySaveQueue({ onError: (m) => messages.push(m) });
        q.Insert(fakeEntity({ result: false }));
        const result = await q.Flush();
        expect(result.failures).toBe(1);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatch(/failed/i);
    });

    it('saves different entities concurrently (no cross-entity serialization)', async () => {
        const q = new BaseEntitySaveQueue();
        const order: string[] = [];
        const slow = { EntityInfo: { Name: 'Slow' }, LatestResult: { CompleteMessage: '' }, Save: vi.fn(async () => { await new Promise((r) => setTimeout(r, 25)); order.push('slow'); return true; }) } as unknown as BaseEntity;
        const fast = { EntityInfo: { Name: 'Fast' }, LatestResult: { CompleteMessage: '' }, Save: vi.fn(async () => { order.push('fast'); return true; }) } as unknown as BaseEntity;
        q.Insert(slow);
        q.Insert(fast);
        await q.Flush();
        expect(order).toEqual(['fast', 'slow']);
    });

    it('Flush drains — a second Flush after no new work reports zero', async () => {
        const q = new BaseEntitySaveQueue();
        q.Insert(fakeEntity({ result: false }));
        expect((await q.Flush()).failures).toBe(1);
        expect((await q.Flush()).failures).toBe(0);
    });
});
