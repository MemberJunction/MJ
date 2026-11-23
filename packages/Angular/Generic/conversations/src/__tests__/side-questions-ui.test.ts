import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { EventEmitter } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import { MJConversationDetailEntity, MJConversationEntity } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { ConversationsRuntime, SideQuestionScopeState } from '@memberjunction/conversations-runtime';
import { CancellableChatEventArgs } from '../lib/events/chat-events';
import {
    BuildSideQuestionTurns,
    SideQuestionPanelComponent,
} from '../lib/components/side-question/side-question-panel.component';
import { BeforeSideQuestionTurnEventArgs } from '../lib/components/side-question/side-question-events';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

function createPanelHarness(opts?: {
    inFlightCount?: number;
    agentNames?: string[];
    messages?: MJConversationDetailEntity[];
    isAsking?: boolean;
    activeTurnIndex?: number;
    eligibleAgents?: MJAIAgentEntityExtended[];
    preferredAgentId?: string | null;
}): SideQuestionPanelComponent {
    const panel = Object.create(SideQuestionPanelComponent.prototype) as SideQuestionPanelComponent;
    const messages = opts?.messages ?? [];
    const state: SideQuestionScopeState = {
        ParentConversationId: 'conv-1',
        ParentBranchId: null,
        SideConversation: null,
        Messages: messages,
        TurnCount: messages.filter((m) => m.Role === 'User').length,
        PreferredAgentId: opts?.preferredAgentId ?? null,
        IsLoading: false,
        IsAsking: opts?.isAsking ?? false,
        InFlightDetailId: null,
        StreamingText: '',
        ActiveStatusText: '',
        ActiveAgentName: null,
        ErrorMessage: null,
    };
    Reflect.set(panel, 'MainRunsInFlightCount', opts?.inFlightCount ?? 0);
    Reflect.set(panel, 'ActiveMainAgentNames', opts?.agentNames ?? []);
    Reflect.set(panel, 'BeforeSideQuestionTurn', new EventEmitter<BeforeSideQuestionTurnEventArgs>());
    Reflect.set(panel, 'State', state);
    Reflect.set(panel, 'ConfirmingClear', false);
    Reflect.set(panel, 'DraftQuestion', '');
    Reflect.set(panel, 'IsStopping', false);
    Reflect.set(panel, 'ActiveTurnIndex', opts?.activeTurnIndex ?? 0);
    Reflect.set(panel, 'DefaultManagerAgent', null);
    Reflect.set(panel, 'EligibleAgents', opts?.eligibleAgents ?? []);
    Reflect.set(panel, 'ParentConversation', { ID: 'conv-1', EnvironmentID: 'env-1' });
    Reflect.set(panel, 'CurrentUser', { ID: 'user-1' });
    return panel;
}

function createChatAreaHarness(opts?: {
    allowSideQuestions?: boolean;
    conversation?: Partial<MJConversationEntity> | null;
    isSideQuestionOpen?: boolean;
}): ConversationChatAreaComponent {
    const comp = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    Reflect.set(comp, 'AllowSideQuestions', opts?.allowSideQuestions ?? true);
    Reflect.set(comp, 'IsSideQuestionOpen', opts?.isSideQuestionOpen ?? false);
    Reflect.set(comp, 'SideQuestionTurnCount', 0);
    Reflect.set(comp, 'CurrentUser', { ID: 'user-1' });
    Reflect.set(comp, 'openView', { Kind: 'Main' });
    Reflect.set(
        comp,
        'Conversation',
        opts && 'conversation' in opts ? opts.conversation : { ID: 'conv-1', ParentID: null }
    );
    return comp;
}

describe('Side Questions UI Components', () => {
    it('formats live context badge according to main-thread run count and agent names', () => {
        const idlePanel = createPanelHarness({ inFlightCount: 0 });
        expect(idlePanel.LiveContextBadgeText).toBe('Synced with main thread');

        const oneRunning = createPanelHarness({ inFlightCount: 1, agentNames: ['Sage'] });
        expect(oneRunning.LiveContextBadgeText).toBe('Live context · Sage running');

        const manyRunning = createPanelHarness({ inFlightCount: 2, agentNames: ['Sage', 'Analyst'] });
        expect(manyRunning.LiveContextBadgeText).toBe('Live context · 2 runs in flight');
    });

    it('manages Clear confirmation state and omits unrequested Fork/DockMode extras', () => {
        const msg = { ID: 'd-1', Role: 'User', Message: 'Question' } as MJConversationDetailEntity;
        const panel = createPanelHarness({ messages: [msg] });

        panel.RequestClear();
        expect(panel.ConfirmingClear).toBe(true);

        panel.CancelClear();
        expect(panel.ConfirmingClear).toBe(false);

        expect('PromoteToFork' in panel).toBe(false);
        expect('DockMode' in panel).toBe(false);
    });

    it('uses CancellableChatEventArgs for BeforeSideQuestionTurn and honors Cancel before submitting', async () => {
        const args = new BeforeSideQuestionTurnEventArgs('Test?', 'conv-1', null);
        expect(args).toBeInstanceOf(CancellableChatEventArgs);

        const panel = createPanelHarness();
        panel.DraftQuestion = 'Why did step 2 retry?';
        panel.BeforeSideQuestionTurn.subscribe((eventArgs) => {
            eventArgs.Cancel = true;
            eventArgs.CancelReason = 'Blocked by host hook';
        });

        await panel.OnSendQuestion();
        expect(panel.DraftQuestion).toBe('Why did step 2 retry?');
    });

    it('gates CanUseSideQuestions and toggles on Alt+/ including macOS Option+/', () => {
        const normal = createChatAreaHarness();
        expect(normal.CanUseSideQuestions).toBe(true);

        const altSlash = {
            altKey: true,
            ctrlKey: false,
            metaKey: false,
            key: '/',
            code: 'Slash',
            preventDefault: vi.fn(),
        } as Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'key' | 'code' | 'preventDefault'> as KeyboardEvent;
        normal.OnGlobalSideQuestionShortcut(altSlash);
        expect(normal.IsSideQuestionOpen).toBe(true);

        const macOptionSlash = {
            altKey: true,
            ctrlKey: false,
            metaKey: false,
            key: '÷',
            code: 'Slash',
            preventDefault: vi.fn(),
        } as Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'key' | 'code' | 'preventDefault'> as KeyboardEvent;
        normal.OnGlobalSideQuestionShortcut(macOptionSlash);
        expect(normal.IsSideQuestionOpen).toBe(false);

        const childSideConv = createChatAreaHarness({ conversation: { ID: 'side-1', ParentID: 'conv-1' } });
        expect(childSideConv.CanUseSideQuestions).toBe(false);

        const optedOut = createChatAreaHarness({ allowSideQuestions: false });
        expect(optedOut.CanUseSideQuestions).toBe(false);
    });

    it('pairs Q&A rows with BuildSideQuestionTurns and flags the active streaming turn', () => {
        const rows = [
            { ID: 'u1', Role: 'User', Message: 'First question' },
            { ID: 'a1', Role: 'Agent', Message: 'First answer', Agent: 'Sage' },
            { ID: 'u2', Role: 'User', Message: 'Second question' },
            { ID: 'a2', Role: 'Agent', Message: '', Agent: 'Research Agent' },
        ] as unknown as MJConversationDetailEntity[];

        const settled = BuildSideQuestionTurns(rows, false);
        expect(settled).toHaveLength(2);
        expect(settled[0].Index).toBe(0);
        expect(settled[0].Question.ID).toBe('u1');
        expect(settled[0].Answer?.ID).toBe('a1');
        expect(settled[0].IsStreaming).toBe(false);

        const streaming = BuildSideQuestionTurns(rows, true);
        expect(streaming[0].IsStreaming).toBe(false);
        expect(streaming[1].IsStreaming).toBe(true);
    });

    it('paginates one side-question turn at a time with Previous/Next arrows and auto-advances on new turns', () => {
        const messages = [
            { ID: 'u1', Role: 'User', Message: 'Question 1' },
            { ID: 'a1', Role: 'Agent', Message: 'Answer 1' },
            { ID: 'u2', Role: 'User', Message: 'Question 2' },
            { ID: 'a2', Role: 'Agent', Message: 'Answer 2' },
        ] as unknown as MJConversationDetailEntity[];

        const panel = createPanelHarness({ messages, activeTurnIndex: 1 });
        expect(panel.TurnCount).toBe(2);
        expect(panel.EffectiveTurnIndex).toBe(1);
        expect(panel.CurrentTurn?.Question.ID).toBe('u2');
        expect(panel.CanGoPrevious).toBe(true);
        expect(panel.CanGoNext).toBe(false);

        panel.GoToPreviousTurn();
        expect(panel.EffectiveTurnIndex).toBe(0);
        expect(panel.CurrentTurn?.Question.ID).toBe('u1');
        expect(panel.CanGoPrevious).toBe(false);
        expect(panel.CanGoNext).toBe(true);

        panel.GoToNextTurn();
        expect(panel.EffectiveTurnIndex).toBe(1);
        expect(panel.CurrentTurn?.Question.ID).toBe('u2');

        const loadSpy = vi
            .spyOn(ConversationsRuntime.Instance.SideQuestions, 'LoadScope')
            .mockResolvedValue({
                ParentConversationId: 'conv-1',
                ParentBranchId: null,
                SideConversation: null,
                Messages: [],
                TurnCount: 0,
                PreferredAgentId: null,
                IsLoading: false,
                IsAsking: false,
                InFlightDetailId: null,
                StreamingText: '',
                ActiveStatusText: '',
                ActiveAgentName: null,
                ErrorMessage: null,
            });
        const scopedPanel = createPanelHarness();
        Reflect.set(scopedPanel, 'lastScopeKey', null);
        Reflect.set(scopedPanel, 'lastTurnCount', 0);
        const subject = Reflect.get(ConversationsRuntime.Instance.SideQuestions, 'getOrCreateSubject').call(
            ConversationsRuntime.Instance.SideQuestions,
            'conv-1',
            null
        );
        subject.next({ ...subject.value, Messages: messages, TurnCount: 2, IsAsking: false });
        Reflect.get(scopedPanel, 'bindToScope').call(scopedPanel);

        expect(scopedPanel.EffectiveTurnIndex).toBe(1);
        scopedPanel.GoToPreviousTurn();
        expect(scopedPanel.EffectiveTurnIndex).toBe(0);

        subject.next({
            ...subject.value,
            Messages: [...messages],
            TurnCount: 2,
            IsAsking: false,
        });
        expect(scopedPanel.EffectiveTurnIndex).toBe(0);

        const withThird = [
            ...messages,
            { ID: 'u3', Role: 'User', Message: 'Question 3' } as MJConversationDetailEntity,
        ];
        subject.next({ ...subject.value, Messages: withThird, TurnCount: 3, IsAsking: true });
        expect(scopedPanel.EffectiveTurnIndex).toBe(2);
        expect(scopedPanel.CurrentTurn?.Question.ID).toBe('u3');

        loadSpy.mockRestore();
    });

    it('formats serialized @agent mentions for question display', () => {
        const panel = createPanelHarness({
            eligibleAgents: [{ ID: 'agent-1', Name: 'Research Agent' } as MJAIAgentEntityExtended],
        });
        const formatted = panel.FormatUserQuestion(
            '@{"type":"agent","id":"agent-1","name":"Research Agent"} What else failed?'
        );
        expect(formatted).toBe('@Research Agent What else failed?');
    });

    it('defaults CurrentAgentLabel to Sage and delegates agent changes via SetPreferredAgent', async () => {
        const researchAgent = {
            ID: 'agent-research',
            Name: 'Research Agent',
            IconClass: 'fa-solid fa-magnifying-glass',
        } as MJAIAgentEntityExtended;
        const panel = createPanelHarness({ eligibleAgents: [researchAgent] });
        expect(panel.CurrentAgentLabel).toBe('Sage');

        const setSpy = vi
            .spyOn(ConversationsRuntime.Instance.SideQuestions, 'SetPreferredAgent')
            .mockImplementation(async (convId, branchId, agentId) => {
                const s = ConversationsRuntime.Instance.SideQuestions.GetScopeState(convId, branchId);
                Reflect.set(panel, 'State', { ...s, PreferredAgentId: agentId });
                return true;
            });

        await panel.OnSideAgentChanged('agent-research');
        expect(setSpy).toHaveBeenCalledWith('conv-1', null, 'agent-research', { ID: 'user-1' });
        expect(panel.CurrentAgentLabel).toBe('Research Agent');

        await panel.OnSideAgentChanged(null);
        expect(panel.CurrentAgentLabel).toBe('Sage');
        setSpy.mockRestore();
    });

    it('lazy-loads LoadScopeSummary on conversation open when drawer is closed and updates TurnCount', () => {
        const chatArea = createChatAreaHarness({ isSideQuestionOpen: false });
        expect('PreferredSideQuestionAgent' in chatArea).toBe(false);

        const summarySpy = vi
            .spyOn(ConversationsRuntime.Instance.SideQuestions, 'LoadScopeSummary')
            .mockResolvedValue({} as SideQuestionScopeState);
        const fullSpy = vi
            .spyOn(ConversationsRuntime.Instance.SideQuestions, 'LoadScope')
            .mockResolvedValue({} as SideQuestionScopeState);

        const subject = Reflect.get(ConversationsRuntime.Instance.SideQuestions, 'getOrCreateSubject').call(
            ConversationsRuntime.Instance.SideQuestions,
            'conv-turn-count',
            null
        );
        subject.next({
            ...subject.value,
            TurnCount: 2,
            Messages: [],
        });
        Reflect.set(chatArea, 'Conversation', { ID: 'conv-turn-count', ParentID: null });
        Object.defineProperty(chatArea, 'ProviderToUse', { value: { ProviderType: 'Database' }, configurable: true });
        Reflect.get(chatArea, 'bindSideQuestionScope').call(chatArea);

        expect(chatArea.SideQuestionTurnCount).toBe(2);
        expect(summarySpy).toHaveBeenCalledTimes(1);
        expect(fullSpy).not.toHaveBeenCalled();

        summarySpy.mockRestore();
        fullSpy.mockRestore();
    });

    it('projects the side-question trigger into composerFooter below composer-actions and opens the panel above the composer', () => {
        const inputBoxHtml = readFileSync(
            new URL('../../../composer/src/lib/components/message/message-input-box.component.html', import.meta.url),
            'utf8'
        );
        const aiComposerTs = readFileSync(
            new URL('../lib/components/composer/ai-composer.component.ts', import.meta.url),
            'utf8'
        );
        const messageInputHtml = readFileSync(
            new URL('../lib/components/message/message-input.component.html', import.meta.url),
            'utf8'
        );
        const chatAreaHtml = readFileSync(
            new URL('../lib/components/conversation/conversation-chat-area.component.html', import.meta.url),
            'utf8'
        );

        const actionsIdx = inputBoxHtml.indexOf('class="composer-actions"');
        const statusIdx = inputBoxHtml.indexOf('class="send-slot-status"');
        const footerSlotIdx = inputBoxHtml.indexOf('<ng-content select="[composerFooter]"></ng-content>');
        expect(actionsIdx).toBeGreaterThan(-1);
        expect(statusIdx).toBeGreaterThan(actionsIdx);
        expect(footerSlotIdx).toBeGreaterThan(statusIdx);
        expect(inputBoxHtml).not.toContain('side-question');

        expect(aiComposerTs).toContain('<ng-content select="[composerFooter]" composerFooter></ng-content>');
        expect(messageInputHtml).toContain('<ng-content select="[composerFooter]" composerFooter></ng-content>');

        const fixedInputIdx = chatAreaHtml.indexOf('<!-- Fixed Input Area -->');
        expect(fixedInputIdx).toBeGreaterThan(-1);
        const fixedInputSection = chatAreaHtml.slice(fixedInputIdx);

        const panelSlotIdx = fixedInputSection.indexOf('class="side-question-above-slot"');
        const panelTagIdx = fixedInputSection.indexOf('<mj-side-question-panel');
        const mainComposerWrapperIdx = fixedInputSection.indexOf('class="message-input-container-wrapper"');
        const projectedTriggerIdx = fixedInputSection.indexOf('class="side-question-below-trigger"');
        const messageInputCloseIdx = fixedInputSection.indexOf('</mj-message-input>');

        expect(panelSlotIdx).toBeGreaterThan(-1);
        expect(panelTagIdx).toBeGreaterThan(panelSlotIdx);
        expect(panelTagIdx).toBeLessThan(mainComposerWrapperIdx);
        expect(projectedTriggerIdx).toBeGreaterThan(mainComposerWrapperIdx);
        expect(projectedTriggerIdx).toBeLessThan(messageInputCloseIdx);
        expect(fixedInputSection).toContain('composerFooter');
    });
});
