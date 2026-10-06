import { describe, it, expect, vi, beforeEach } from 'vitest';

// Only the core exports used while the engine module loads: ConversationEngine extends
// BaseEngine, and ResourcePermissionEngine applies @RegisterForStartup. BaseEngine keeps
// getInstance so ConversationEngine.Instance returns one shared engine. @memberjunction/global
// stays real so the helpers use real UUID normalisation.
vi.mock('@memberjunction/core', () => ({
    BaseEngine: class MockBaseEngine {
        static getInstance<T>(): T {
            const ctor = this as unknown as { _testInstance?: T; new (): T };
            if (!ctor._testInstance) {
                ctor._testInstance = new ctor();
            }
            return ctor._testInstance;
        }
    },
    RegisterForStartup: () => () => {},
}));

import { ConversationEngine } from '../engines/conversations';

function fakeEntity(fields: Record<string, unknown> = {}) {
    const entity: Record<string, unknown> = { ...fields, ID: fields.ID ?? 'new-id' };
    entity.Load = vi.fn(async () => true);
    entity.Save = vi.fn(async () => true);
    entity.NewRecord = vi.fn();
    return entity;
}

describe('ConversationEngine branch operations', () => {
    let engine: ConversationEngine;
    let branch: Record<string, unknown>;
    let conversation: Record<string, unknown>;
    const user = { ID: 'user-1' } as never;

    beforeEach(() => {
        engine = ConversationEngine.Instance;
        branch = fakeEntity({ ID: 'B-new' });
        conversation = fakeEntity({ ID: 'conv-1', CurrentBranchID: null });
        Object.defineProperty(engine, 'ProviderToUse', {
            configurable: true,
            get: () => ({
                GetEntityObject: async (name: string) => name === 'MJ: Conversation Branches' ? branch : conversation,
            }),
        });
    });

    it('ForkBranch creates the branch and makes it current', async () => {
        const created = await engine.ForkBranch({ ConversationID: 'conv-1', ForkFromSequence: 4, ParentBranchID: 'B' }, user);
        expect(created).toBe(branch);
        expect(branch.ConversationID).toBe('conv-1');
        expect(branch.ForkFromSequence).toBe(4);
        expect(branch.ParentBranchID).toBe('B');
        expect(conversation.CurrentBranchID).toBe('B-new');
        expect(conversation.Save).toHaveBeenCalledOnce();
    });

    it('ForkBranch forces ParentBranchID to null when ForkFromSequence is null', async () => {
        await engine.ForkBranch({ ConversationID: 'conv-1', ForkFromSequence: null, ParentBranchID: 'B' }, user);
        expect(branch.ParentBranchID).toBeNull();
    });

    it('ForkBranch throws when the branch save fails and does not touch the conversation', async () => {
        (branch.Save as ReturnType<typeof vi.fn>).mockResolvedValue(false);
        await expect(engine.ForkBranch({ ConversationID: 'conv-1', ForkFromSequence: 1, ParentBranchID: null }, user)).rejects.toThrow(/branch/i);
        expect(conversation.Save).not.toHaveBeenCalled();
    });

    it('SwitchBranch sets CurrentBranchID, null for the trunk', async () => {
        expect(await engine.SwitchBranch('conv-1', 'B', user)).toBe(true);
        expect(conversation.CurrentBranchID).toBe('B');
        expect(await engine.SwitchBranch('conv-1', null, user)).toBe(true);
        expect(conversation.CurrentBranchID).toBeNull();
    });
});
