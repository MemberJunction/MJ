import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@memberjunction/ai';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { AgentNativeToolsAndPrefixCacheHelper } from '../helpers/prompt/AgentNativeToolsAndPrefixCacheHelper';
import { AgentPromptHelper } from '../helpers/prompt/AgentPromptHelper';
import { BaseAgentPromptHelper } from '../helpers/prompt/BaseAgentPromptHelper';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

describe('AgentPromptHelper (Slice s9)', () => {
    it('resolves default AgentPromptHelper via ClassFactory', () => {
        const helper = ResolveAgentHelper({
            SeamKey: 'prompt',
            BaseClass: BaseAgentPromptHelper,
            DefaultClass: AgentPromptHelper,
        });
        expect(helper).toBeInstanceOf(AgentPromptHelper);
    });

    it('classifies memory note scopes accurately', () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext();

        const globalNote = { AgentID: null, UserID: null, CompanyID: null, PrimaryScopeEntityID: null, PrimaryScopeRecordID: null } as MJAIAgentNoteEntity;
        const userNote = { AgentID: 'a1', UserID: 'u1', CompanyID: null, PrimaryScopeEntityID: 'e1', PrimaryScopeRecordID: 'r1' } as MJAIAgentNoteEntity;

        expect(helper.DetermineNoteScope(ctx, globalNote)).toBe('global');
        expect(helper.DetermineNoteScope(ctx, userNote)).toBe('user');
    });

    it('enforces DecisionsEnabled master switch and FinishIfSettings defaults', () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext({
            AgentTypePromptParams: { decisionsEnabled: true, finishIfMode: 'on', finishIfThreshold: 0.9 },
            Hooks: {
                DecisionsEnabled: (p) => helper.DecisionsEnabled(ctx, p),
            },
        });

        expect(helper.DecisionsEnabled(ctx, { decisionsEnabled: true })).toBe(true);
        expect(helper.DecisionsEnabled(ctx, { decisionsEnabled: false })).toBe(false);
        const settings = helper.FinishIfSettings(ctx);
        expect(settings.Enabled).toBe(true);
        expect(settings.Mode).toBe('on');
        expect(settings.Threshold).toBe(0.9);
    });

    it('memoizes MessageFingerprint for unchanged ChatMessage instances', () => {
        const msg: ChatMessage = { role: 'user', content: 'Hello world' };
        const fp1 = AgentNativeToolsAndPrefixCacheHelper.MessageFingerprint(msg);
        const fp2 = AgentNativeToolsAndPrefixCacheHelper.MessageFingerprint(msg);
        expect(fp1).toBe(fp2);
        msg.content = 'Updated content';
        const fp3 = AgentNativeToolsAndPrefixCacheHelper.MessageFingerprint(msg);
        expect(fp3).not.toBe(fp1);
    });

    it('skips memory writes when AllowMemoryWrite is false or audience adds a reader', () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: { RunAudienceAddsReader: () => true },
        });
        const disabledAgent = { ID: 'a1', Name: 'A1', AllowMemoryWrite: false } as MJAIAgentEntityExtended;
        const enabledAgent = { ID: 'a2', Name: 'A2', AllowMemoryWrite: true } as MJAIAgentEntityExtended;

        expect(helper.MemoryWriteSkip(ctx, { agent: disabledAgent, conversationMessages: [] })?.Reason).toBe('AllowMemoryWrite=false');
        expect(helper.MemoryWriteSkip(ctx, { agent: enabledAgent, conversationMessages: [] })?.Reason).toBe('shared conversation');
    });
});
