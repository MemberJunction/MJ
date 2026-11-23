import {
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    SimpleChanges,
    ViewChild,
    inject,
} from '@angular/core';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJConversationDetailEntity, MJConversationEntity } from '@memberjunction/core-entities';
import { IsAgentAllowed, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    ConversationsRuntime,
    SideQuestionController,
    SideQuestionScopeState,
    type MentionPerson,
} from '@memberjunction/conversations-runtime';
import { UUIDsEqual } from '@memberjunction/global';
import { SendSlotMode } from '@memberjunction/ng-composer';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AgentStateService } from '../../services/agent-state.service';
import { AiComposerComponent } from '../composer/ai-composer.component';
import {
    AfterSideQuestionTurnEventArgs,
    BeforeSideQuestionTurnEventArgs,
} from './side-question-events';

/** A single Question + Answer turn shown one-at-a-time in the AGY side-question stepper. */
export interface SideQuestionTurnItem {
    Index: number;
    Question: MJConversationDetailEntity;
    Answer: MJConversationDetailEntity | null;
    IsStreaming: boolean;
}

/** Pairs persisted user questions and assistant replies into sequential 1-turn stepper items. */
export function BuildSideQuestionTurns(
    messages: readonly MJConversationDetailEntity[],
    isAsking: boolean
): SideQuestionTurnItem[] {
    const turns: SideQuestionTurnItem[] = [];
    for (const msg of messages) {
        if (msg.Role === 'User') {
            turns.push({
                Index: turns.length,
                Question: msg,
                Answer: null,
                IsStreaming: false,
            });
        } else if (turns.length > 0) {
            const current = turns[turns.length - 1];
            if (!current.Answer || (msg.Message && msg.Message.trim().length > 0)) {
                current.Answer = msg;
            }
        }
    }
    if (isAsking && turns.length > 0) {
        turns[turns.length - 1].IsStreaming = true;
    }
    return turns;
}

/**
 * Antigravity-style Side Questions drawer anchored below the main composer.
 *
 * Defaults to Sage (never inherits specialized main-thread agents like Query Builder), reuses
 * `<mj-conversation-agent-picker>` + `<mj-ai-composer>`, persists the chosen agent on
 * `SideConversation.DefaultAgentID`, and steps through side Q&A turns one at a time via arrows.
 */
@Component({
    standalone: false,
    selector: 'mj-side-question-panel',
    templateUrl: './side-question-panel.component.html',
    styleUrls: ['./side-question-panel.component.css'],
})
export class SideQuestionPanelComponent implements OnInit, OnChanges, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly agentStateService = inject(AgentStateService);
    private readonly destroy$ = new Subject<void>();
    private scopeDestroy$ = new Subject<void>();
    private lastScopeKey: string | null = null;
    private lastTurnCount = 0;

    @ViewChild('aiComposer') private aiComposer?: AiComposerComponent;
    @ViewChild('answerContainer') private answerContainer?: ElementRef<HTMLDivElement>;

    @Input() Provider: IMetadataProvider | null = null;
    @Input() CurrentUser!: UserInfo;
    @Input() ParentConversation: MJConversationEntity | null = null;
    @Input() ParentBranchId: string | null = null;
    @Input() ApplicationId: string | null = null;
    @Input() AllowedAgentIDs: readonly string[] | null = null;
    @Input() AllowMentions = true;
    @Input() AllowAgentMentions = true;
    @Input() AllowEntityMentions = true;
    @Input() MentionPeople: readonly MentionPerson[] | null = null;
    @Input() MainRunsInFlightCount = 0;
    @Input() ActiveMainAgentNames: string[] = [];

    @Output() Close = new EventEmitter<void>();
    @Output() BeforeSideQuestionTurn = new EventEmitter<BeforeSideQuestionTurnEventArgs>();
    @Output() AfterSideQuestionTurn = new EventEmitter<AfterSideQuestionTurnEventArgs>();

    public State: SideQuestionScopeState | null = null;
    public DraftQuestion = '';
    public ConfirmingClear = false;
    public IsStopping = false;
    public ActiveTurnIndex = 0;

    public DefaultManagerAgent: MJAIAgentEntityExtended | null = null;
    public EligibleAgents: MJAIAgentEntityExtended[] = [];

    public get Messages(): MJConversationDetailEntity[] {
        return this.State?.Messages ?? [];
    }

    public get HasMessages(): boolean {
        return this.Messages.length > 0;
    }

    public get Turns(): SideQuestionTurnItem[] {
        return BuildSideQuestionTurns(this.Messages, this.IsBusyAsking);
    }

    public get TurnCount(): number {
        return this.Turns.length;
    }

    public get HasTurns(): boolean {
        return this.TurnCount > 0;
    }

    public get EffectiveTurnIndex(): number {
        const count = this.TurnCount;
        if (count === 0) {
            return 0;
        }
        return Math.max(0, Math.min(this.ActiveTurnIndex, count - 1));
    }

    public get CurrentTurn(): SideQuestionTurnItem | null {
        const turns = this.Turns;
        return turns.length > 0 ? turns[this.EffectiveTurnIndex] : null;
    }

    public get CanGoPrevious(): boolean {
        return this.EffectiveTurnIndex > 0;
    }

    public get CanGoNext(): boolean {
        return this.EffectiveTurnIndex < this.TurnCount - 1;
    }

    public get IsBusyAsking(): boolean {
        return Boolean(this.State?.IsAsking);
    }

    public get ActivePreferredAgentId(): string | null {
        return this.State?.SideConversation?.DefaultAgentID ?? this.State?.PreferredAgentId ?? null;
    }

    public get EffectiveSelectedAgent(): MJAIAgentEntityExtended | null {
        const savedId = this.ActivePreferredAgentId;
        if (savedId) {
            const match =
                this.EligibleAgents.find((a) => UUIDsEqual(a.ID, savedId)) ??
                (AIEngineBase.Instance.ReadableAgents ?? []).find((a) => UUIDsEqual(a.ID, savedId));
            if (match) {
                return match;
            }
        }
        return this.DefaultManagerAgent;
    }

    public get DefaultAgentName(): string {
        return this.DefaultManagerAgent?.Name || 'Sage';
    }

    public get DefaultAgentOptionLabel(): string {
        return `${this.DefaultAgentName} (Default)`;
    }

    public get CurrentAgentLabel(): string {
        return this.EffectiveSelectedAgent?.Name || this.DefaultAgentName;
    }

    public get ComposerSendSlotMode(): SendSlotMode {
        if (this.IsStopping) {
            return 'stopping';
        }
        if (this.IsBusyAsking && this.State?.InFlightDetailId) {
            return 'stop';
        }
        return 'send';
    }

    public get ComposerPlaceholder(): string {
        return `Ask ${this.CurrentAgentLabel} a side question… (@ to mention an agent)`;
    }

    public get LiveContextBadgeText(): string {
        if (this.MainRunsInFlightCount > 0) {
            const firstAgent = this.ActiveMainAgentNames[0];
            if (this.MainRunsInFlightCount === 1 && firstAgent) {
                return `Live context · ${firstAgent} running`;
            }
            return `Live context · ${this.MainRunsInFlightCount} runs in flight`;
        }
        return 'Synced with main thread';
    }

    public ngOnInit(): void {
        void this.loadDefaultAgentAndMentions();
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['ParentConversation'] || changes['ParentBranchId'] || changes['CurrentUser']) {
            this.bindToScope();
        }
        if (changes['AllowedAgentIDs'] || changes['ApplicationId'] || changes['CurrentUser'] || changes['Provider']) {
            void this.loadDefaultAgentAndMentions();
        }
    }

    public ngOnDestroy(): void {
        this.scopeDestroy$.next();
        this.scopeDestroy$.complete();
        this.destroy$.next();
        this.destroy$.complete();
    }

    public FocusInput(): void {
        setTimeout(() => {
            this.aiComposer?.Focus();
        }, 0);
    }

    public async OnSideAgentChanged(agentId: string | null): Promise<void> {
        const conv = this.ParentConversation;
        if (conv?.ID && this.CurrentUser) {
            await ConversationsRuntime.Instance.SideQuestions.SetPreferredAgent(
                conv.ID,
                this.ParentBranchId ?? null,
                agentId,
                this.CurrentUser
            );
        }
        this.FocusInput();
        this.cdr?.markForCheck?.();
    }

    public GoToPreviousTurn(): void {
        const current = this.EffectiveTurnIndex;
        if (current <= 0) {
            return;
        }
        this.ActiveTurnIndex = current - 1;
        this.resetAnswerScroll();
        this.cdr?.markForCheck?.();
    }

    public GoToNextTurn(): void {
        const current = this.EffectiveTurnIndex;
        if (current >= this.TurnCount - 1) {
            return;
        }
        this.ActiveTurnIndex = current + 1;
        this.resetAnswerScroll();
        this.cdr?.markForCheck?.();
    }

    public FormatUserQuestion(raw: string | null | undefined): string {
        const text = raw ?? '';
        if (!text) {
            return '';
        }
        return ConversationsRuntime.Instance.Mentions.ToPlainText(text, this.EligibleAgents ?? []);
    }

    public OnCloseClicked(): void {
        this.ConfirmingClear = false;
        this.Close.emit();
    }

    public OnPanelEscape(event: Event): void {
        if (this.aiComposer?.MentionEditor?.ShowMentionDropdown) {
            return;
        }
        event.preventDefault();
        this.OnCloseClicked();
    }

    public RequestClear(): void {
        if (!this.HasMessages || this.IsBusyAsking) {
            return;
        }
        this.ConfirmingClear = true;
    }

    public CancelClear(): void {
        this.ConfirmingClear = false;
    }

    public async ConfirmClear(): Promise<void> {
        const conv = this.ParentConversation;
        if (!conv?.ID || !this.CurrentUser) {
            this.ConfirmingClear = false;
            return;
        }
        await ConversationsRuntime.Instance.SideQuestions.ClearScope(
            conv.ID,
            this.ParentBranchId ?? null,
            this.CurrentUser
        );
        this.ActiveTurnIndex = 0;
        this.lastTurnCount = 0;
        this.ConfirmingClear = false;
        this.cdr?.markForCheck?.();
    }

    public OnDraftValueChanged(value: string): void {
        this.DraftQuestion = value;
    }

    public OnComposerSubmitted(text: string): void {
        void this.submitQuestionText(text, true);
    }

    public async OnSendQuestion(): Promise<void> {
        await this.submitQuestionText(this.DraftQuestion, false);
    }

    public async OnStopAsking(): Promise<void> {
        const detailId = this.State?.InFlightDetailId;
        if (!detailId || this.IsStopping) {
            return;
        }
        this.IsStopping = true;
        this.cdr?.markForCheck?.();
        try {
            await this.agentStateService.CancelAgentForDetail(detailId);
        } finally {
            this.cdr?.markForCheck?.();
        }
    }

    private async submitQuestionText(rawText: string, clearedByComposer: boolean): Promise<void> {
        const conv = this.ParentConversation;
        const text = rawText.trim();
        if (!conv?.ID || !this.CurrentUser || !text || this.IsBusyAsking) {
            if (clearedByComposer && text) {
                this.DraftQuestion = rawText;
            }
            return;
        }

        const beforeArgs = new BeforeSideQuestionTurnEventArgs(
            text,
            conv.ID,
            this.ParentBranchId ?? null
        );
        this.BeforeSideQuestionTurn.emit(beforeArgs);
        if (beforeArgs.Cancel) {
            if (clearedByComposer) {
                this.DraftQuestion = rawText;
                this.cdr?.markForCheck?.();
            }
            return;
        }

        this.ConfirmingClear = false;
        this.DraftQuestion = '';

        const preferredAgent = this.ActivePreferredAgentId ? this.EffectiveSelectedAgent : null;
        const outcome = await ConversationsRuntime.Instance.SideQuestions.AskQuestion({
            ParentConversationId: conv.ID,
            ParentBranchId: this.ParentBranchId ?? null,
            QuestionText: text,
            CurrentUser: this.CurrentUser,
            PreferredAgent: preferredAgent,
            ApplicationId: this.ApplicationId,
            AllowedAgentIDs: this.AllowedAgentIDs,
            EnvironmentId: conv.EnvironmentID,
            Provider: this.Provider ?? undefined,
        });

        this.IsStopping = false;
        this.AfterSideQuestionTurn.emit(
            new AfterSideQuestionTurnEventArgs(
                conv.ID,
                outcome.SideConversationId,
                outcome.UserDetailId,
                outcome.AgentDetailId,
                outcome.Success
            )
        );
        this.cdr?.markForCheck?.();
    }

    private resetAnswerScroll(): void {
        if (this.answerContainer?.nativeElement) {
            this.answerContainer.nativeElement.scrollTop = 0;
        }
    }

    private async loadDefaultAgentAndMentions(): Promise<void> {
        try {
            await AIEngineBase.Instance.Config(false, this.CurrentUser, this.Provider ?? undefined);
            const agents = (AIEngineBase.Instance.ReadableAgents ?? [])
                .filter(
                    (a) =>
                        !a.ParentID &&
                        a.Status === 'Active' &&
                        a.InvocationMode !== 'Sub-Agent' &&
                        IsAgentAllowed(a.ID, this.AllowedAgentIDs)
                )
                .sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''));
            this.EligibleAgents = agents;

            try {
                this.DefaultManagerAgent = await ConversationsRuntime.Instance.DefaultAgent.Resolve({
                    applicationId: this.ApplicationId ?? null,
                    contextUser: this.CurrentUser,
                    provider: this.Provider ?? undefined,
                });
            } catch {
                this.DefaultManagerAgent = agents.find((a) => a.Name === 'Sage') ?? null;
            }
            this.cdr?.markForCheck?.();
        } catch {
            // Leave existing catalog intact; backend still resolves default Sage.
        }
    }

    private bindToScope(): void {
        this.scopeDestroy$?.next();
        this.scopeDestroy$?.complete();
        this.scopeDestroy$ = new Subject<void>();
        this.ConfirmingClear = false;

        const conv = this.ParentConversation;
        if (!conv?.ID || !this.CurrentUser) {
            this.State = null;
            this.ActiveTurnIndex = 0;
            this.lastTurnCount = 0;
            this.lastScopeKey = null;
            return;
        }

        const branchId = this.ParentBranchId ?? null;
        const scopeKey = SideQuestionController.ScopeKey(conv.ID, branchId);
        if (this.lastScopeKey !== scopeKey) {
            this.lastTurnCount = 0;
        }

        const scope$ = ConversationsRuntime.Instance.SideQuestions
            .ObserveScope(conv.ID, branchId)
            .pipe(takeUntil(this.scopeDestroy$));
        const bounded$ = this.destroy$ ? scope$.pipe(takeUntil(this.destroy$)) : scope$;

        bounded$.subscribe((state) => {
            this.State = state;
            const turns = BuildSideQuestionTurns(state.Messages, state.IsAsking);
            const scopeChanged = this.lastScopeKey !== scopeKey;
            if (turns.length === 0) {
                this.ActiveTurnIndex = 0;
            } else if (scopeChanged || this.lastTurnCount === 0 || turns.length > this.lastTurnCount) {
                this.ActiveTurnIndex = turns.length - 1;
            } else {
                this.ActiveTurnIndex = Math.min(this.ActiveTurnIndex, turns.length - 1);
            }
            this.lastTurnCount = turns.length;
            this.lastScopeKey = scopeKey;
            this.cdr?.markForCheck?.();
        });

        void ConversationsRuntime.Instance.SideQuestions.LoadScope(
            conv.ID,
            branchId,
            this.CurrentUser,
            this.Provider ?? undefined
        );
    }
}
