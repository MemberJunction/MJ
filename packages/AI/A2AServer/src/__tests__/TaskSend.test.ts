import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { InMemoryA2ATaskStore, type Task } from '../TaskStore.js';
import { HandleTaskSend, TASK_NOT_FOUND_MESSAGE, type TaskSendDependencies } from '../TaskSend.js';

function fakeUser(id: string): UserInfo {
    const user: Pick<UserInfo, 'ID' | 'Name' | 'IsActive'> = { ID: id, Name: `User ${id}`, IsActive: true };
    return user as UserInfo;
}

const OWNER = fakeUser('00000000-0000-4000-8000-0000000000a1');
const OTHER = fakeUser('00000000-0000-4000-8000-0000000000b2');

function deps(store: InMemoryA2ATaskStore): TaskSendDependencies & { Started: Task[] } {
    let next = 0;
    const started: Task[] = [];
    return {
        Store: store,
        Provider: {} as IMetadataProvider,
        StartProcessing: (task) => { started.push(task); },
        NewID: () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
        Started: started,
    };
}

describe('HandleTaskSend', () => {
    it('creates a task for the caller and starts processing it', async () => {
        const store = new InMemoryA2ATaskStore();
        const d = deps(store);
        const outcome = await HandleTaskSend({ message: { parts: [{ id: 'p1', type: 'text', content: 'hi' }] } }, OWNER, d);
        expect('taskId' in outcome).toBe(true);
        if (!('taskId' in outcome)) return;
        expect(store.GetForUser(outcome.taskId, OWNER.ID)?.messages).toHaveLength(1);
        expect(d.Started).toHaveLength(1);
    });

    it('never echoes the requested task ID in the not-found message (CodeQL #755, reflected XSS)', async () => {
        const store = new InMemoryA2ATaskStore();
        const hostileID = '<script>alert(document.cookie)</script>';
        const outcome = await HandleTaskSend({ taskId: hostileID, message: { parts: [] } }, OWNER, deps(store));
        expect(outcome).toEqual({ ErrorCode: 404, ErrorMessage: TASK_NOT_FOUND_MESSAGE });
        expect(JSON.stringify(outcome)).not.toContain('script');
    });

    it("reads another user's task exactly like a missing one", async () => {
        const store = new InMemoryA2ATaskStore();
        const d = deps(store);
        const created = await HandleTaskSend({}, OWNER, d);
        if (!('taskId' in created)) throw new Error('expected a created task');

        const outcome = await HandleTaskSend({ taskId: created.taskId, message: { parts: [] } }, OTHER, d);
        expect(outcome).toEqual({ ErrorCode: 404, ErrorMessage: TASK_NOT_FOUND_MESSAGE });
        expect(d.Started).toHaveLength(1);
    });

    it('refuses to add a message to a finished task', async () => {
        const store = new InMemoryA2ATaskStore();
        const d = deps(store);
        const created = await HandleTaskSend({}, OWNER, d);
        if (!('taskId' in created)) throw new Error('expected a created task');
        const stored = store.GetForUser(created.taskId, OWNER.ID);
        if (!stored) throw new Error('expected the stored task');
        stored.status = 'completed';

        const outcome = await HandleTaskSend({ taskId: created.taskId, message: { parts: [] } }, OWNER, d);
        expect(outcome).toEqual({ ErrorCode: 400, ErrorMessage: 'Cannot update a task with status: completed' });
    });

    it('starts processing only after the task is saved', async () => {
        const store = new InMemoryA2ATaskStore();
        const d = deps(store);
        const save = vi.spyOn(store, 'SaveTask');
        let savedBeforeStart = false;
        d.StartProcessing = () => { savedBeforeStart = save.mock.calls.length > 0; };
        await HandleTaskSend({}, OWNER, d);
        expect(savedBeforeStart).toBe(true);
    });
});
