import { describe, it, expect, vi, beforeEach } from 'vitest';

// Only the core exports used while the engine module loads: ConversationEngine extends
// BaseEngine, and ResourcePermissionEngine applies @RegisterForStartup. BaseEngine keeps
// getInstance so ConversationEngine.Instance returns one shared engine. @memberjunction/global
// stays real.
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

function fakeBranch(): Record<string, unknown> {
    const entity: Record<string, unknown> = { ID: 'T-new', LatestResult: { CompleteMessage: 'denied' } };
    entity.NewRecord = vi.fn();
    entity.Save = vi.fn(async () => true);
    return entity;
}

describe('ConversationEngine.CreateFork', () => {
    let engine: ConversationEngine;
    let branch: Record<string, unknown>;
    let requested: string[];
    const user = { ID: 'user-1' } as never;

    beforeEach(() => {
        engine = ConversationEngine.Instance;
        branch = fakeBranch();
        requested = [];
        Object.defineProperty(engine, 'ProviderToUse', {
            configurable: true,
            get: () => ({
                GetEntityObject: async (name: string) => {
                    requested.push(name);
                    return branch;
                },
            }),
        });
    });

    it('creates the fork started by the context user and never reads or writes the conversation', async () => {
        const created = await engine.CreateFork(
            { ConversationID: 'conv-1', Kind: 'Edit', ParentBranchID: 'T1', ForkFromSequence: 4, SourceDetailID: 'd-5', Name: '  Week 3 ' },
            user
        );

        expect(created).toBe(branch);
        expect(branch.NewRecord).toHaveBeenCalledOnce();
        expect(branch).toMatchObject({
            ConversationID: 'conv-1', Kind: 'Edit', ParentBranchID: 'T1', ForkFromSequence: 4, SourceDetailID: 'd-5', UserID: 'user-1', Name: 'Week 3',
        });
        expect(branch.Save).toHaveBeenCalledOnce();
        expect(requested).toEqual(['MJ: Conversation Branches']);
    });

    it('starts from Main when the fork is before the first message', async () => {
        await engine.CreateFork({ ConversationID: 'conv-1', Kind: 'Edit', ParentBranchID: 'T1', ForkFromSequence: null, SourceDetailID: 'd-1' }, user);
        expect(branch.ParentBranchID).toBeNull();
        expect(branch.ForkFromSequence).toBeNull();
    });

    it('stores no name for a blank one and no source when none is given', async () => {
        await engine.CreateFork({ ConversationID: 'conv-1', Kind: 'Fork', ParentBranchID: null, ForkFromSequence: 2, Name: '   ' }, user);
        expect(branch.Name).toBeNull();
        expect(branch.SourceDetailID).toBeNull();
    });

    it('throws with the save message when the fork cannot be saved', async () => {
        (branch.Save as ReturnType<typeof vi.fn>).mockResolvedValue(false);
        await expect(engine.CreateFork({ ConversationID: 'conv-1', Kind: 'Fork', ParentBranchID: null, ForkFromSequence: 2 }, user))
            .rejects.toThrow('Failed to create the fork: denied');
    });
});
