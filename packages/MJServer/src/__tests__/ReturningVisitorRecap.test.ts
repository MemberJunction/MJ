/**
 * @fileoverview The returning-visitor recap transcript reads Main.
 *
 * The transcript query filters with `ConversationEngine.ScopeFilter(ConversationEngine.TrunkScope(id))`
 * and takes the newest turns by `Sequence`. It reads no branch or conversation scope first.
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

import { ConversationEngine } from '@memberjunction/core-entities';
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

    it('reads the newest turns in Main with the trunk predicate, in chronological order', async () => {
        const provider = makeProvider();

        await WriteReturningVisitorRecap('conv-1', 'agent-1', USER, provider);

        const view = detailView();
        expect(view?.ExtraFilter).toBe(ConversationEngine.LiveRowsFilter(ConversationEngine.ScopeFilter(ConversationEngine.TrunkScope('conv-1'))));
        expect(view?.ExtraFilter).toBe("[ConversationID]='conv-1' AND [BranchID] IS NULL AND [ReplacedAt] IS NULL");
        expect(view?.OrderBy).toBe('Sequence DESC');
        expect(view?.MaxRows).toBe(60);
        expect(hoisted.views.some((v) => v.EntityName === 'MJ: Conversation Branches' || v.EntityName === 'MJ: Conversations')).toBe(false);
        expect(hoisted.transcripts).toEqual(['User: first\nAI: second']);
    });
});
