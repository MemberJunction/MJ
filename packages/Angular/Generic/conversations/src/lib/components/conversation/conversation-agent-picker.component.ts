import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    HostListener,
    Input,
    OnInit,
    Output,
    inject,
} from '@angular/core';
import { LogError } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJConversationEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Header widget that lets a user pin a default AI agent on the active
 * conversation. The pinned agent (saved to
 * `MJConversationEntity.DefaultAgentID`) takes precedence over the
 * embedder-supplied default in `MessageInputComponent.routeMessage()` —
 * non-mention messages route to it instead of Sage.
 *
 * Eligible agents are top-level, Active, non-Sub-Agent rows from
 * `AIEngineBase.Instance.Agents`. The widget renders as a compact button
 * showing the current pin (or "Auto" when nothing is pinned). Clicking
 * opens an inline list with a "Clear" option to remove the pin.
 *
 * The host controls visibility via `<mj-conversation-chat-area>`'s
 * `[showAgentPicker]` input (default true). Surfaces that don't want this
 * UX (e.g. agent-less embed) set it to false.
 */
@Component({
    standalone: false,
    selector: 'mj-conversation-agent-picker',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mj-cv-agent-picker" [class.mj-cv-agent-picker--open]="IsOpen">
            <button
                type="button"
                class="mj-cv-agent-picker__trigger"
                [title]="ButtonTitle"
                [disabled]="Disabled || !Conversation"
                (click)="Toggle($event)">
                <i class="fa-solid fa-robot"></i>
                <span class="mj-cv-agent-picker__label">{{ CurrentAgentLabel }}</span>
                <i class="fa-solid fa-caret-down mj-cv-agent-picker__caret"></i>
            </button>
            @if (IsOpen) {
                <div class="mj-cv-agent-picker__menu" (click)="$event.stopPropagation()">
                    <div class="mj-cv-agent-picker__menu-header">Default agent for this conversation</div>
                    <button
                        type="button"
                        class="mj-cv-agent-picker__item"
                        [class.mj-cv-agent-picker__item--selected]="!Conversation?.DefaultAgentID"
                        (click)="PickAgent(null)">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                        <span>Auto (use default)</span>
                    </button>
                    @if (EligibleAgents.length === 0) {
                        <div class="mj-cv-agent-picker__empty">No agents available</div>
                    } @else {
                        @for (agent of EligibleAgents; track agent.ID) {
                            <button
                                type="button"
                                class="mj-cv-agent-picker__item"
                                [class.mj-cv-agent-picker__item--selected]="IsSelected(agent)"
                                [title]="agent.Description || agent.Name"
                                (click)="PickAgent(agent)">
                                <i [class]="IconClassFor(agent)"></i>
                                <span>{{ agent.Name }}</span>
                            </button>
                        }
                    }
                </div>
            }
        </div>
    `,
    styles: [`
        /* Match mjButton size="sm" so the trigger lines up with neighboring
           Export / Share buttons: min-height 32px, 6px/12px padding,
           0.8125rem font. Same border-radius as the other chrome buttons. */
        .mj-cv-agent-picker { position: relative; display: inline-flex; align-items: center; }
        .mj-cv-agent-picker__trigger {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 6px 12px; min-height: 32px; box-sizing: border-box;
            background: var(--mj-bg-surface-card); border: 1px solid var(--mj-border-default);
            border-radius: 4px; cursor: pointer;
            color: var(--mj-text-primary); font-size: 0.8125rem; line-height: 1.5;
            transition: background 120ms, border-color 120ms;
        }
        .mj-cv-agent-picker__trigger:hover:not(:disabled) {
            background: var(--mj-bg-surface-hover); border-color: var(--mj-border-strong);
        }
        .mj-cv-agent-picker__trigger:disabled { opacity: 0.5; cursor: not-allowed; }
        .mj-cv-agent-picker--open .mj-cv-agent-picker__trigger { border-color: var(--mj-border-focus); }
        .mj-cv-agent-picker__label { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mj-cv-agent-picker__caret { font-size: 10px; opacity: 0.7; }
        .mj-cv-agent-picker__menu {
            position: absolute; top: calc(100% + 4px); right: 0; z-index: 50;
            min-width: 220px; max-height: 320px; overflow-y: auto;
            background: var(--mj-bg-surface-elevated); border: 1px solid var(--mj-border-default);
            border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);
            padding: 4px 0;
        }
        .mj-cv-agent-picker__menu-header {
            padding: 6px 12px 4px; font-size: 11px; text-transform: uppercase;
            letter-spacing: 0.04em; color: var(--mj-text-muted);
        }
        .mj-cv-agent-picker__item {
            display: flex; align-items: center; gap: 8px; width: 100%;
            padding: 6px 12px; background: transparent; border: none; cursor: pointer;
            color: var(--mj-text-primary); font-size: 13px; text-align: left;
        }
        .mj-cv-agent-picker__item i { width: 14px; text-align: center; color: var(--mj-text-secondary); }
        .mj-cv-agent-picker__item:hover { background: var(--mj-bg-surface-hover); }
        .mj-cv-agent-picker__item--selected { background: color-mix(in srgb, var(--mj-brand-primary) 10%, transparent); }
        .mj-cv-agent-picker__item--selected i { color: var(--mj-brand-primary); }
        .mj-cv-agent-picker__empty { padding: 8px 12px; font-size: 12px; color: var(--mj-text-muted); }
    `]
})
export class ConversationAgentPickerComponent implements OnInit {
    /** The conversation whose `DefaultAgentID` this widget edits. */
    @Input() Conversation: MJConversationEntity | null = null;

    /** Required for the Save() audit context. */
    @Input() CurrentUser: UserInfo | null = null;

    /** Disable the picker (e.g. read-only conversation). */
    @Input() Disabled: boolean = false;

    /** Emitted after a successful save with the new (or null) agent ID. */
    @Output() AgentChanged = new EventEmitter<string | null>();

    public IsOpen = false;
    public EligibleAgents: MJAIAgentEntityExtended[] = [];

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly notifications = inject(MJNotificationService);

    public async ngOnInit(): Promise<void> {
        try {
            // AIEngineBase is the live, cached agent catalog. Ensure it's
            // loaded — most app shells warm it up at boot, but the picker
            // could mount before that completes.
            await AIEngineBase.Instance.Config(false);
            this.EligibleAgents = (AIEngineBase.Instance.Agents ?? [])
                .filter(a =>
                    !a.ParentID &&
                    a.Status === 'Active' &&
                    a.InvocationMode !== 'Sub-Agent'
                )
                .sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''));
            this.cdr.markForCheck();
        } catch (err) {
            LogError(`ConversationAgentPicker.ngOnInit: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    public get CurrentAgentLabel(): string {
        const id = this.Conversation?.DefaultAgentID;
        if (!id) return 'Auto';
        const match = this.EligibleAgents.find(a => UUIDsEqual(a.ID, id));
        // If the pinned agent is no longer eligible (deactivated, demoted to
        // sub-agent), still surface its name from the cache so the user can
        // see what was pinned even though they can't re-pin it.
        const fromCache = match
            ?? (AIEngineBase.Instance.Agents ?? []).find(a => UUIDsEqual(a.ID, id));
        return fromCache?.Name ?? 'Pinned agent';
    }

    public get ButtonTitle(): string {
        return this.Conversation?.DefaultAgentID
            ? `This conversation routes to ${this.CurrentAgentLabel}. Click to change.`
            : 'No agent pinned — messages route via the standard rules. Click to pin an agent.';
    }

    public IconClassFor(agent: MJAIAgentEntityExtended): string {
        return agent.IconClass?.trim() || 'fa-solid fa-robot';
    }

    public IsSelected(agent: MJAIAgentEntityExtended): boolean {
        return !!this.Conversation?.DefaultAgentID
            && UUIDsEqual(agent.ID, this.Conversation.DefaultAgentID);
    }

    public Toggle(event: MouseEvent): void {
        event.stopPropagation();
        if (this.Disabled || !this.Conversation) return;
        this.IsOpen = !this.IsOpen;
        this.cdr.markForCheck();
    }

    public async PickAgent(agent: MJAIAgentEntityExtended | null): Promise<void> {
        this.IsOpen = false;
        const conv = this.Conversation;
        if (!conv) return;
        const newId = agent?.ID ?? null;
        if (conv.DefaultAgentID === newId) {
            this.cdr.markForCheck();
            return;
        }
        const prev = conv.DefaultAgentID;
        conv.DefaultAgentID = newId;
        try {
            const saved = await conv.Save();
            if (!saved) {
                conv.DefaultAgentID = prev;
                this.notifications.CreateSimpleNotification(
                    conv.LatestResult?.CompleteMessage ?? 'Failed to update conversation default agent.',
                    'error', 4500);
                return;
            }
            this.AgentChanged.emit(newId);
        } catch (err) {
            conv.DefaultAgentID = prev;
            LogError(`ConversationAgentPicker.PickAgent: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.cdr.markForCheck();
        }
    }

    /** Close the menu when the user clicks outside the picker. */
    @HostListener('document:click', ['$event'])
    public OnDocumentClick(_event: MouseEvent): void {
        if (this.IsOpen) {
            this.IsOpen = false;
            this.cdr.markForCheck();
        }
    }
}
