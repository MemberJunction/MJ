/**
 * @fileoverview The returning-visitor recap transcript reads the conversation's current branch path.
 *
 * The transcript query filters with the scope `ConversationEngine.LoadCurrentScope` returns and
 * takes the newest turns by `Sequence`. When the scope cannot be read, there is no transcript and
 * no recap prompt runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

interface ViewCall {
    EntityName: string;
    ExtraFilter?: string;
    OrderBy?: string;
    MaxRows?: number;
}

const hoisted = vi.hoisted(() => ({
    views: [] as ViewCall[],
    detailRows: [] as Array<{ Role: string; Message: string }>,
    transcripts: [] as string[],
    logError: vi.fn(),
    logStatus: vi.fn(),
    aiConfig: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: hoisted.logError,
        LogStatus: hoisted.logStatus,
        RunView: class {
            async RunView(params: ViewCall) {
                hoisted.views.push(params);
                if (params.EntityName === 'MJ: Conversation Details') {
                    return { Success: true, Results: hoisted.detailRows };
                }
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: hoisted.aiConfig,
            Prompts: [{ Name: 'Returning-Visitor Recap', SelectionStrategy: 'Default', Status: 'Active' }],
        },
    },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptParams: class {},
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class {
        async ExecutePrompt(params: { data?: { transcript?: string } }) {
            hoisted.transcripts.push(params.data?.transcript ?? '');
            return { success: true, rawResult: 'NO_RECAP' };
        }
    },
}));

import { ConversationEngine, type ConversationScope } from '@memberjunction/core-entities';
import { WriteReturningVisitorRecap } from '../agentSessions/ReturningVisitorRecap.js';

const USER = { ID: 'user-1' } as unknown as UserInfo;

function makeProvider(): IMetadataProvider {
    const conversation = {
        ID: 'conv-1',
        LinkedEntityID: 'entity-1',
        LinkedRecordID: 'record-1',
        VisitorKey: null,
        Load: vi.fn().mockResolvedValue(true),
    };
    return {
        Entities: [],
        GetEntityObject: vi.fn().mockResolvedValue(conversation),
    } as unknown as IMetadataProvider;
}

function detailView(): ViewCall | undefined {
    return hoisted.views.find((v) => v.EntityName === 'MJ: Conversation Details');
}

const BRANCH_SCOPE: ConversationScope = {
    ConversationID: 'conv-1',
    BranchID: 'branch-2',
    Branches: [{ ID: 'branch-2', ConversationID: 'conv-1', ParentBranchID: null, ForkFromSequence: 3, Name: 'Alt' }],
};

describe('WriteReturningVisitorRecap — transcript scope', () => {
    beforeEach(() => {
        hoisted.views.length = 0;
        hoisted.transcripts.length = 0;
        hoisted.detailRows = [
            { Role: 'AI', Message: 'second' },
            { Role: 'User', Message: 'first' },
        ];
        hoisted.logError.mockReset();
        hoisted.logStatus.mockReset();
        hoisted.aiConfig.mockReset();
    });

    it('reads the newest turns on the current branch path, in chronological order', async () => {
        const provider = makeProvider();
        const load = vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(BRANCH_SCOPE);

        await WriteReturningVisitorRecap('conv-1', 'agent-1', USER, provider);

        expect(load).toHaveBeenCalledWith('conv-1', USER, provider);
        const view = detailView();
        expect(view?.ExtraFilter).toBe(ConversationEngine.ScopeFilter(BRANCH_SCOPE));
        expect(view?.ExtraFilter).toContain("[BranchID]='branch-2'");
        expect(view?.OrderBy).toBe('Sequence DESC');
        expect(view?.MaxRows).toBe(60);
        expect(hoisted.transcripts).toEqual(['User: first\nAI: second']);
    });

    it('reads the trunk with the trunk predicate when the conversation has no current branch', async () => {
        const provider = makeProvider();
        const trunk = ConversationEngine.TrunkScope('conv-1');
        vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(trunk);

        await WriteReturningVisitorRecap('conv-1', 'agent-1', USER, provider);

        const view = detailView();
        expect(view?.ExtraFilter).toBe(ConversationEngine.ScopeFilter(trunk));
        expect(view?.ExtraFilter).toBe("[ConversationID]='conv-1' AND [BranchID] IS NULL");
        expect(view?.OrderBy).toBe('Sequence DESC');
    });

    it('has no transcript, logs, and runs no prompt when the scope cannot be read', async () => {
        const provider = makeProvider();
        vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockRejectedValue(new Error('Conversation conv-1 not found'));

        await expect(WriteReturningVisitorRecap('conv-1', 'agent-1', USER, provider)).resolves.toBeUndefined();

        expect(detailView()).toBeUndefined();
        expect(hoisted.aiConfig).not.toHaveBeenCalled();
        expect(hoisted.transcripts).toEqual([]);
        const errors = hoisted.logError.mock.calls.map((c) => String(c[0]));
        expect(errors.some((m) => m.includes('conv-1') && m.includes('Conversation conv-1 not found'))).toBe(true);
        expect(errors.some((m) => m.includes('best-effort recap failed'))).toBe(false);
        const statuses = hoisted.logStatus.mock.calls.map((c) => String(c[0]));
        expect(statuses.some((m) => m.includes('empty transcript'))).toBe(true);
    });
});
