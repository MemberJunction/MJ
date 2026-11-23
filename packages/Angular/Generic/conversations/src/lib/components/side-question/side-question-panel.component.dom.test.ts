import { CommonModule } from '@angular/common';
import { Component, Directive, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MJConversationDetailEntity, MJConversationEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    ConversationsRuntime,
    SideQuestionScopeState,
    type SideQuestionController,
} from '@memberjunction/conversations-runtime';
import { AgentStateService } from '../../services/agent-state.service';
import { SideQuestionPanelComponent } from './side-question-panel.component';

@Component({
    selector: 'mj-conversation-agent-picker',
    template: '',
    standalone: false,
})
class StubConversationAgentPickerComponent {
    @Input() Conversation: MJConversationEntity | null = null;
    @Input() SelectedAgentId: string | null = null;
    @Input() AllowUnboundSelection = false;
    @Input() Compact = false;
    @Input() DefaultLabel = '';
    @Input() DefaultMenuOptionLabel = '';
    @Input() MenuHeader = '';
    @Input() CurrentUser: UserInfo | null = null;
    @Input() AllowedAgentIDs: readonly string[] | null = null;
    @Input() Disabled = false;
    @Output() AgentChanged = new EventEmitter<string | null>();
}

@Component({
    selector: 'mj-ai-composer',
    template: '',
    standalone: false,
})
class StubAiComposerComponent {
    @Input() Placeholder = '';
    @Input() Disabled = false;
    @Input() Rows = 1;
    @Input() ShowCharacterCount = false;
    @Input() EnableMentions = true;
    @Input() EnableAgentMentions = true;
    @Input() EnableEntityMentions = true;
    @Input() EnableSkillCommands = false;
    @Input() TargetAgentId: string | null = null;
    @Input() AllowedAgentIDs: readonly string[] | null = null;
    @Input() MentionPeople: readonly unknown[] | null = null;
    @Input() EnableAttachments = false;
    @Input() EnableRealtime = false;
    @Input() EnablePlanMode = false;
    @Input() SendSlotMode = 'send';
    @Input() StopCount = 0;
    @Input() StopLabel = '';
    @Input() CurrentUser: UserInfo | null = null;
    @Input() Provider: unknown = null;
    @Input() Value = '';
    @Output() ValueChange = new EventEmitter<string>();
    @Output() TextSubmitted = new EventEmitter<string>();
    @Output() StopClicked = new EventEmitter<void>();

    public Focus(): void {}
    public Clear(): void {}
}

@Component({
    selector: 'mj-markdown',
    template: '<div class="stub-markdown">{{ data }}</div>',
    standalone: false,
})
class StubMarkdownComponent {
    @Input() data = '';
    @Input() OpenLinksInNewTab = false;
}

@Directive({
    selector: '[mjButton]',
    standalone: false,
})
class StubMjButtonDirective {
    @Input() Variant = 'flat';
    @Input() Size = 'sm';
}

function makeState(overrides: Partial<SideQuestionScopeState> = {}): SideQuestionScopeState {
    return {
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
        ...overrides,
    };
}

describe('SideQuestionPanelComponent (DOM)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        TestBed.resetTestingModule();
    });

    function setupPanel(initialState: SideQuestionScopeState = makeState()) {
        const state$ = new BehaviorSubject<SideQuestionScopeState>(initialState);
        const controllerStub: Pick<
            SideQuestionController,
            'ObserveScope' | 'LoadScope' | 'AskQuestion' | 'ClearScope' | 'SetPreferredAgent'
        > = {
            ObserveScope: vi.fn(() => state$.asObservable()),
            LoadScope: vi.fn(async () => state$.value),
            AskQuestion: vi.fn(async () => ({
                Success: true,
                SideConversationId: 'side-1',
                UserDetailId: 'u-1',
                AgentDetailId: 'a-1',
            })),
            ClearScope: vi.fn(async () => true),
            SetPreferredAgent: vi.fn(async () => true),
        };

        vi.spyOn(AIEngineBase.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(ConversationsRuntime, 'Instance', 'get').mockReturnValue({
            SideQuestions: controllerStub as SideQuestionController,
            Mentions: {
                ToPlainText: (raw: string) => raw,
            } as Partial<ConversationsRuntime['Mentions']> as ConversationsRuntime['Mentions'],
            DefaultAgent: {
                Resolve: vi.fn(async () => Promise.reject(new Error('not configured'))),
            } as Partial<ConversationsRuntime['DefaultAgent']> as ConversationsRuntime['DefaultAgent'],
        } as Partial<ConversationsRuntime> as ConversationsRuntime);

        TestBed.configureTestingModule({
            imports: [CommonModule],
            declarations: [
                SideQuestionPanelComponent,
                StubConversationAgentPickerComponent,
                StubAiComposerComponent,
                StubMarkdownComponent,
                StubMjButtonDirective,
            ],
            providers: [
                {
                    provide: AgentStateService,
                    useValue: {
                        CancelAgentForDetail: vi.fn(async () => true),
                    },
                },
            ],
        });

        const fixture = TestBed.createComponent(SideQuestionPanelComponent);
        fixture.componentRef.setInput('CurrentUser', { ID: 'user-1', Name: 'Tester' } as UserInfo);
        fixture.componentRef.setInput('ParentConversation', {
            ID: 'conv-1',
            EnvironmentID: 'env-1',
            Name: 'Main Thread',
        } as MJConversationEntity);
        fixture.detectChanges();
        return { fixture, state$, controllerStub };
    }

    it('renders live-context badge for idle vs running main-thread agents', () => {
        const { fixture } = setupPanel();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelector('.sq-context-badge')?.textContent?.trim()).toBe('Synced with main thread');
        expect(root.querySelector('.sq-context-badge')?.classList.contains('is-live')).toBe(false);

        fixture.componentRef.setInput('MainRunsInFlightCount', 1);
        fixture.componentRef.setInput('ActiveMainAgentNames', ['Sage']);
        fixture.detectChanges();
        expect(root.querySelector('.sq-context-badge')?.textContent?.trim()).toBe('Live context · Sage running');
        expect(root.querySelector('.sq-context-badge')?.classList.contains('is-live')).toBe(true);
    });

    it('renders one Q&A turn at a time and steps through turns with Previous/Next buttons', () => {
        const messages = [
            { ID: 'u1', Role: 'User', Message: 'First question?' },
            { ID: 'a1', Role: 'Agent', Message: 'First answer.', Agent: 'Sage' },
            { ID: 'u2', Role: 'User', Message: 'Second question?' },
            { ID: 'a2', Role: 'Agent', Message: 'Second answer.', Agent: 'Sage' },
        ] as Partial<MJConversationDetailEntity>[] as MJConversationDetailEntity[];

        const { fixture } = setupPanel(makeState({ Messages: messages, TurnCount: 2 }));
        const root = fixture.nativeElement as HTMLElement;

        expect(root.querySelector('.sq-nav-counter')?.textContent?.trim()).toBe('2 / 2');
        expect(root.querySelector('.sq-question-text')?.textContent?.trim()).toBe('Second question?');
        expect(root.querySelector('.stub-markdown')?.textContent?.trim()).toBe('Second answer.');

        const prevBtn = root.querySelector('button[aria-label="Previous side question"]') as HTMLButtonElement;
        const nextBtn = root.querySelector('button[aria-label="Next side question"]') as HTMLButtonElement;
        expect(prevBtn.disabled).toBe(false);
        expect(nextBtn.disabled).toBe(true);

        prevBtn.click();
        fixture.detectChanges();
        expect(root.querySelector('.sq-nav-counter')?.textContent?.trim()).toBe('1 / 2');
        expect(root.querySelector('.sq-question-text')?.textContent?.trim()).toBe('First question?');
        expect(prevBtn.disabled).toBe(true);
        expect(nextBtn.disabled).toBe(false);

        nextBtn.click();
        fixture.detectChanges();
        expect(root.querySelector('.sq-nav-counter')?.textContent?.trim()).toBe('2 / 2');
    });

    it('shows inline Clear confirmation and clears when confirmed', async () => {
        const messages = [
            { ID: 'u1', Role: 'User', Message: 'Question?' },
            { ID: 'a1', Role: 'Agent', Message: 'Answer.', Agent: 'Sage' },
        ] as Partial<MJConversationDetailEntity>[] as MJConversationDetailEntity[];

        const { fixture, controllerStub } = setupPanel(makeState({ Messages: messages, TurnCount: 1 }));
        const root = fixture.nativeElement as HTMLElement;

        const clearTrigger = root.querySelector('button[title="Clear side-question history"]') as HTMLButtonElement;
        clearTrigger.click();
        fixture.detectChanges();

        expect(root.querySelector('.sq-clear-confirm')).not.toBeNull();
        const confirmBtn = Array.from(root.querySelectorAll('.sq-clear-actions button')).find((b) =>
            b.textContent?.includes('Confirm Clear')
        ) as HTMLButtonElement;
        confirmBtn.click();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(controllerStub.ClearScope).toHaveBeenCalledTimes(1);
        expect(root.querySelector('.sq-clear-confirm')).toBeNull();
    });

    it('emits Close when the close button is clicked or Escape is pressed', () => {
        const { fixture } = setupPanel();
        const root = fixture.nativeElement as HTMLElement;
        const onClose = vi.fn();
        fixture.componentInstance.Close.subscribe(onClose);

        const closeBtn = root.querySelector('button[aria-label="Close Side Questions"]') as HTMLButtonElement;
        closeBtn.click();
        expect(onClose).toHaveBeenCalledTimes(1);

        const panel = root.querySelector('.side-question-panel') as HTMLElement;
        panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('emits BeforeSideQuestionTurn and AfterSideQuestionTurn around a submitted question', async () => {
        const { fixture, controllerStub } = setupPanel();
        const beforeEvents: unknown[] = [];
        const afterEvents: unknown[] = [];
        fixture.componentInstance.BeforeSideQuestionTurn.subscribe((e) => beforeEvents.push(e));
        fixture.componentInstance.AfterSideQuestionTurn.subscribe((e) => afterEvents.push(e));

        fixture.componentInstance.DraftQuestion = 'What is step 2 doing?';
        await fixture.componentInstance.OnSendQuestion();
        expect(beforeEvents).toHaveLength(1);
        expect(controllerStub.AskQuestion).toHaveBeenCalledTimes(1);
        expect(afterEvents).toHaveLength(1);
    });
});
