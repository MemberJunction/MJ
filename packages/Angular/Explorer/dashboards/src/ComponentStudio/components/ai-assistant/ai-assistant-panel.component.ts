import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    OnDestroy,
    OnInit,
    inject,
} from '@angular/core';
import { CompositeKey, LogError } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import type {
    MJConversationEntity,
    MJTaskEntity,
} from '@memberjunction/core-entities';
import type { AppContextSnapshot } from '@memberjunction/ai-core-plus';
import { NavigationService } from '@memberjunction/ng-shared';
import type { NavigationRequest, PendingAttachment } from '@memberjunction/ng-conversations';
import { ComponentStudioStateService, ComponentError } from '../../services/component-studio-state.service';

/**
 * Quick-action shortcut surfaced above the embedded chat. Clicking a
 * shortcut prefills the chat input via the pendingMessage handoff — the
 * same mechanism the empty-state uses to send the first message.
 */
interface QuickAction {
    Label: string;
    Icon: string;
    Prompt: string;
    /** When true, the button is disabled unless `state.CurrentError` is set. */
    RequiresError: boolean;
}

/**
 * Component Studio's right-pane AI assistant.
 *
 * Previously this was a 880-line bespoke chat stub that emitted "AI
 * assistant coming soon" — no agent was actually called. This version
 * thin-wraps `<mj-conversation-chat-area>` (the same primitive the main
 * Chat app and the Form Builder cockpit use) so the assistant becomes
 * fully functional with zero duplicated chat plumbing.
 *
 * Domain integration preserved from the old stub:
 *   - **Quick-actions bar** (Fix Errors / Improve / Generate / Explain)
 *     above the chat — clicking sets `PendingMessage` which the chat-area
 *     consumes on the next render, mirroring the empty-state handoff.
 *   - **`SendErrorToAI` channel** — when the runtime preview throws, the
 *     state service emits a `ComponentError`. We listen and shove a
 *     "Fix this error: …" message into the same pendingMessage pipe so
 *     the user doesn't have to copy/paste error text.
 *
 * Scoping:
 *   - `[applicationScope]="'Application'"` + Component Studio app ID →
 *     conversations stay out of main chat (per the migration scoping work).
 *   - `[defaultAgentId]` → Codesmith Agent so messages route to the code
 *     specialist instead of Sage by default. User can still @mention any
 *     agent, override via the per-conversation pin, or pick a different
 *     agent through the chat header's picker.
 */
@Component({
    standalone: false,
    selector: 'mj-ai-assistant-panel',
    templateUrl: './ai-assistant-panel.component.html',
    styleUrls: ['./ai-assistant-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AIAssistantPanelComponent extends BaseAngularComponent implements OnInit, OnDestroy {

    /** Quick actions surfaced as buttons above the embedded chat. */
    public QuickActions: QuickAction[] = [
        { Label: 'Fix Errors',    Icon: 'fa-bug',             Prompt: 'Fix this error: ',                                                                                       RequiresError: true  },
        { Label: 'Improve Code',  Icon: 'fa-magic',           Prompt: 'Review and improve the current component code. Suggest optimizations, better patterns, and cleaner structure.', RequiresError: false },
        { Label: 'Generate Code', Icon: 'fa-code',            Prompt: 'Generate code for the current component based on its specification.',                                     RequiresError: false },
        { Label: 'Explain',       Icon: 'fa-question-circle', Prompt: 'Explain what the current component does, including its structure, data flow, and key behaviors.',         RequiresError: false },
    ];

    /** Embedded chat state — same shape the Form Builder cockpit uses. */
    public ChatConversation: MJConversationEntity | null = null;
    public ChatConversationId: string | null = null;
    public ChatIsNewConversation = true;
    public PendingMessage: string | null = null;
    public PendingAttachments: PendingAttachment[] | null = null;
    public ChatThreadId: string | null = null;
    public ChatPendingArtifactId: string | null = null;
    public ChatPendingArtifactVersionNumber: number | null = null;

    /** Snapshot from NavigationService — drives the agent's app context. */
    public ChatAppContext: AppContextSnapshot | null = null;

    /** Codesmith Agent ID resolved from AIEngineBase cache (no RunView). */
    public CodesmithAgentId: string | null = null;

    /** Component Studio's Application ID — resolved from Metadata cache. */
    public CockpitApplicationId: string | null = null;

    /**
     * EntityID for `MJ: Components`. Stamped on every conversation
     * created from this panel as the `LinkedEntityID`, paired with the
     * currently-selected Component's ID. Enables "show prior conversations
     * about THIS component" later. In-memory Metadata lookup; no RunView.
     */
    public ComponentsEntityID: string | null = null;

    /**
     * The DB-backed Component ID currently selected — null when the
     * panel has nothing selected, or when the selection is a
     * file-loaded (transient) component that has no persistent DB row
     * to link conversations to. Used as `[linkedRecordId]` on the
     * embedded chat-area. Pairs with {@link ComponentsEntityID}.
     */
    public get LinkedComponentID(): string | null {
        const sel = this.State.SelectedComponent;
        if (!sel) return null;
        // FileLoadedComponent has `isFileLoaded === true` and a lower-case
        // `id`; DbComponentSummary has the canonical `ID`. Discriminate by
        // the flag rather than property presence to keep TS happy.
        if ('isFileLoaded' in sel && sel.isFileLoaded === true) return null;
        return (sel as { ID: string }).ID ?? null;
    }

    private static readonly CODESMITH_AGENT_NAME = 'Codesmith Agent';
    private static readonly COCKPIT_APP_NAME = 'Component Studio';

    private readonly destroy$ = new Subject<void>();
    private appContextSubscription: Subscription | null = null;

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly navigationService = inject(NavigationService);

    constructor(public State: ComponentStudioStateService) {
        super();
    }

    public get EnvironmentId(): string {
        return MJEnvironmentEntityExtended.DefaultEnvironmentID;
    }

    public get CurrentUser(): UserInfo | null {
        return this.ProviderToUse?.CurrentUser ?? null;
    }

    public async ngOnInit(): Promise<void> {
        try {
            // Resolve default agent + cockpit app ID from in-memory caches
            // (no RunView round-trips). Both fall back to null cleanly:
            // missing agent → routes through Sage; missing app → safety
            // guard in chat-area demotes scope to 'Global'.
            await AIEngineBase.Instance.Config(false);
            const codesmith = AIEngineBase.Instance.Agents
                ?.find(a => a.Name?.trim().toLowerCase() === AIAssistantPanelComponent.CODESMITH_AGENT_NAME.toLowerCase());
            this.CodesmithAgentId = codesmith?.ID ?? null;
            if (!codesmith) {
                LogError(`AIAssistantPanel: '${AIAssistantPanelComponent.CODESMITH_AGENT_NAME}' not found in AIEngineBase cache`);
            }

            const md = this.ProviderToUse;
            const app = md.Applications?.find(
                a => a.Name?.trim().toLowerCase() === AIAssistantPanelComponent.COCKPIT_APP_NAME.toLowerCase()
            );
            this.CockpitApplicationId = app?.ID ?? null;
            // Resolve MJ: Components entity ID for conversation linkage.
            const componentsEntity = md.EntityByName?.('MJ: Components');
            if (!componentsEntity) {
                LogError(`AIAssistantPanel: Entity 'MJ: Components' not found in Metadata cache — conversation linkage will be skipped.`);
            }
            this.ComponentsEntityID = componentsEntity?.ID ?? null;

            // Subscribe to the Explorer shell's app-context publisher so
            // the agent sees the same snapshot the floating overlay sees.
            this.appContextSubscription = this.navigationService.AppContextSnapshot$
                .subscribe(snapshot => {
                    this.ChatAppContext = snapshot;
                    this.cdr.markForCheck();
                });

            // Wire the SendErrorToAI channel — when the runtime preview
            // hits an error, push a canned "Fix this error: …" message
            // into the chat-area's pendingMessage pipe so the user
            // doesn't have to manually copy the error text.
            this.State.SendErrorToAI
                .pipe(takeUntil(this.destroy$))
                .subscribe(err => this.handleIncomingError(err));
            this.cdr.markForCheck();
        } catch (err) {
            LogError(`AIAssistantPanel.ngOnInit: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.appContextSubscription?.unsubscribe();
        this.appContextSubscription = null;
    }

    /** Collapse the right pane (delegated to the parent dashboard). */
    public OnCollapsePanel(): void {
        this.State.IsAIPanelCollapsed = true;
        this.State.StateChanged.emit();
    }

    /** Quick-action click — prefill the chat with the canned prompt. */
    public OnQuickAction(action: QuickAction): void {
        if (action.RequiresError && !this.State.CurrentError) return;
        let prompt = action.Prompt;
        if (action.RequiresError && this.State.CurrentError) {
            prompt += `${this.State.CurrentError.type} - ${this.State.CurrentError.message}`;
        }
        this.PendingMessage = prompt;
        this.PendingAttachments = null;
        this.cdr.markForCheck();
    }

    public IsQuickActionEnabled(action: QuickAction): boolean {
        return !action.RequiresError || this.State.CurrentError != null;
    }

    /** Runtime preview surfaced an error — auto-send "Fix this error: …". */
    private handleIncomingError(error: ComponentError): void {
        const details = error.technicalDetails
            ? (typeof error.technicalDetails === 'string'
                ? error.technicalDetails
                : JSON.stringify(error.technicalDetails, null, 2))
            : '';
        this.PendingMessage = `Fix this error: ${error.type} - ${error.message}${details ? '\n\nDetails:\n' + details : ''}`;
        this.PendingAttachments = null;
        this.cdr.markForCheck();
    }

    // ── chat-area event wiring ───────────────────────────────────────

    public OnConversationCreated(event: {
        conversation: MJConversationEntity;
        pendingMessage?: string;
        pendingAttachments?: PendingAttachment[];
    }): void {
        this.PendingMessage = event.pendingMessage ?? null;
        this.PendingAttachments = (event.pendingAttachments ?? null) as PendingAttachment[] | null;
        this.ChatConversation = event.conversation;
        this.ChatConversationId = event.conversation.ID;
        this.ChatIsNewConversation = false;
        this.cdr.markForCheck();
    }

    public OnPendingMessageConsumed(): void {
        this.PendingMessage = null;
        this.PendingAttachments = null;
        this.cdr.markForCheck();
    }

    public OnOpenEntityRecord(event: { entityName: string; compositeKey: CompositeKey }): void {
        try {
            this.navigationService.OpenEntityRecord(event.entityName, event.compositeKey);
        } catch (err) {
            LogError(`AIAssistantPanel.OnOpenEntityRecord: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    public OnNavigationRequest(event: NavigationRequest): void {
        void this.navigationService.OpenNavItemByName(event.navItemName, event.params, event.appId);
    }

    public OnTaskClicked(task: MJTaskEntity): void {
        try {
            const key = CompositeKey.FromID(task.ID);
            this.navigationService.OpenEntityRecord('MJ: Tasks', key);
        } catch (err) {
            LogError(`AIAssistantPanel.OnTaskClicked: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    public OnArtifactLinkClicked(event: { type: 'conversation' | 'collection'; id: string }): void {
        const navItemName = event.type === 'conversation' ? 'Conversations' : 'Collections';
        const paramKey = event.type === 'conversation' ? 'conversationId' : 'collectionId';
        void this.navigationService.OpenNavItemByName(navItemName, { [paramKey]: event.id });
    }

    public OnConversationRenamed(event: { conversationId: string; name: string; description: string }): void {
        if (this.ChatConversation && UUIDsEqual(this.ChatConversation.ID, event.conversationId)) {
            this.ChatConversation.Name = event.name;
            if (event.description !== undefined) {
                this.ChatConversation.Description = event.description;
            }
            this.cdr.markForCheck();
        }
    }

    public OnThreadOpened(threadId: string): void {
        this.ChatThreadId = threadId;
        this.cdr.markForCheck();
    }

    public OnThreadClosed(): void {
        this.ChatThreadId = null;
        this.cdr.markForCheck();
    }

    public OnPendingArtifactConsumed(): void {
        this.ChatPendingArtifactId = null;
        this.ChatPendingArtifactVersionNumber = null;
        this.cdr.markForCheck();
    }
}
