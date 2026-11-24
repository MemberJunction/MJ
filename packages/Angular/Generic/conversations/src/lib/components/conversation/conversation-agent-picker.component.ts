import { ConnectedPosition } from '@angular/cdk/overlay';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnInit,
    Output,
    inject,
} from '@angular/core';
import { LogError } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { IsAgentAllowed, type MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJConversationEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Reusable header widget that picks or pins a default AI agent for a conversation
 * (both main threads via `MJConversationEntity.DefaultAgentID` and Side Questions
 * before/after the child conversation row is persisted).
 *
 * Eligible agents are top-level, Active, non-Sub-Agent rows from
 * `AIEngineBase.Instance.ReadableAgents` narrowed by `AllowedAgentIDs`.
 */
@Component({
    standalone: false,
    selector: 'mj-conversation-agent-picker',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mj-cv-agent-picker" [class.mj-cv-agent-picker--open]="IsOpen" [class.mj-cv-agent-picker--compact]="Compact">
            <button
                type="button"
                cdkOverlayOrigin
                #pickerOrigin="cdkOverlayOrigin"
                class="mj-cv-agent-picker__trigger"
                [title]="ButtonTitle"
                [disabled]="Disabled || (!Conversation && !AllowUnboundSelection)"
                (click)="Toggle($event)">
                @if (CurrentAgentLogoUrl) {
                    <img [src]="CurrentAgentLogoUrl" [alt]="CurrentAgentLabel" class="mj-cv-agent-picker__avatar" />
                } @else {
                    <i [class]="CurrentAgentIconClass" aria-hidden="true"></i>
                }
                <span class="mj-cv-agent-picker__label">{{ CurrentAgentLabel }}</span>
                <i class="fa-solid fa-caret-down mj-cv-agent-picker__caret" aria-hidden="true"></i>
            </button>

            <ng-template
                cdkConnectedOverlay
                [cdkConnectedOverlayOrigin]="pickerOrigin"
                [cdkConnectedOverlayOpen]="IsOpen"
                [cdkConnectedOverlayPositions]="MenuPositions"
                [cdkConnectedOverlayHasBackdrop]="true"
                cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
                (backdropClick)="Close()"
                (overlayKeydown)="OnOverlayKeydown($event)"
                (detach)="Close()">
                <div class="mj-cv-agent-picker__menu" role="menu" (click)="$event.stopPropagation()">
                    <div class="mj-cv-agent-picker__menu-header">{{ MenuHeader }}</div>
                    <button
                        type="button"
                        role="menuitemradio"
                        class="mj-cv-agent-picker__item"
                        [class.mj-cv-agent-picker__item--selected]="!EffectiveAgentId"
                        [attr.aria-checked]="!EffectiveAgentId"
                        (click)="PickAgent(null)">
                        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                        <span>{{ DefaultMenuOptionLabel }}</span>
                    </button>
                    @if (MyEligibleAgents.length > 0) {
                        <div class="mj-cv-agent-picker__section-label">My Agents</div>
                        @for (agent of MyEligibleAgents; track agent.ID) {
                            <button
                                type="button"
                                role="menuitemradio"
                                class="mj-cv-agent-picker__item"
                                [class.mj-cv-agent-picker__item--selected]="IsSelected(agent)"
                                [attr.aria-checked]="IsSelected(agent)"
                                [title]="agent.Description || agent.Name"
                                (click)="PickAgent(agent)">
                                @if (agent.LogoURL) {
                                    <img [src]="agent.LogoURL" [alt]="agent.Name" class="mj-cv-agent-picker__avatar" />
                                } @else {
                                    <i [class]="IconClassFor(agent)" aria-hidden="true"></i>
                                }
                                <span class="mj-cv-agent-picker__item-name">{{ agent.Name }}</span>
                                @if (BaseAgentNameFor(agent)) {
                                    <span class="mj-cv-agent-picker__base-tag">{{ BaseAgentNameFor(agent) }}</span>
                                }
                            </button>
                        }
                    }
                    @if (CatalogEligibleAgents.length > 0) {
                        @if (MyEligibleAgents.length > 0) {
                            <div class="mj-cv-agent-picker__section-label">Catalog Agents</div>
                        }
                        @for (agent of CatalogEligibleAgents; track agent.ID) {
                            <button
                                type="button"
                                class="mj-cv-agent-picker__item"
                                [class.mj-cv-agent-picker__item--selected]="IsSelected(agent)"
                                [title]="agent.Description || agent.Name"
                                (click)="PickAgent(agent)">
                                @if (agent.LogoURL) {
                                    <img [src]="agent.LogoURL" [alt]="agent.Name" class="mj-cv-agent-picker__avatar" />
                                } @else {
                                    <i [class]="IconClassFor(agent)"></i>
                                }
                                <span class="mj-cv-agent-picker__item-name">{{ agent.Name }}</span>
                            </button>
                        }
                    }
                    @if (EligibleAgents.length === 0) {
                        <div class="mj-cv-agent-picker__empty">No agents available</div>
                    }
                </div>
            </ng-template>
        </div>
    `,
    styles: [`
        .mj-cv-agent-picker { position: relative; display: inline-flex; align-items: center; }
        .mj-cv-agent-picker__trigger {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 6px 12px; min-height: 32px; box-sizing: border-box;
            background: var(--mj-bg-surface-card); border: 1px solid var(--mj-border-default);
            border-radius: 4px; cursor: pointer;
            color: var(--mj-text-primary); font-size: 0.8125rem; line-height: 1.5;
            transition: background 120ms, border-color 120ms;
        }
        .mj-cv-agent-picker--compact .mj-cv-agent-picker__trigger {
            gap: 5px; padding: 2px 8px; min-height: 24px; border-radius: 6px;
            background: var(--mj-bg-surface); font-size: 11.5px; font-weight: 500; line-height: 1.3;
        }
        .mj-cv-agent-picker--compact .mj-cv-agent-picker__trigger i:first-child {
            color: var(--mj-brand-primary); font-size: 11.5px;
        }
        .mj-cv-agent-picker__trigger:hover:not(:disabled) {
            background: var(--mj-bg-surface-hover); border-color: var(--mj-border-strong);
        }
        .mj-cv-agent-picker__trigger:focus-visible { outline: none; box-shadow: var(--mj-focus-ring); }
        .mj-cv-agent-picker__trigger:disabled { opacity: 0.5; cursor: not-allowed; }
        .mj-cv-agent-picker--open .mj-cv-agent-picker__trigger { border-color: var(--mj-border-focus); }
        .mj-cv-agent-picker__label { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mj-cv-agent-picker--compact .mj-cv-agent-picker__label { max-width: 130px; }
        .mj-cv-agent-picker__caret { font-size: 10px; opacity: 0.7; }
        .mj-cv-agent-picker__avatar {
            width: 16px; height: 16px; border-radius: var(--mj-radius-full, 999px);
            object-fit: cover; flex-shrink: 0;
        }
        .mj-cv-agent-picker__menu {
            min-width: 240px; max-height: 340px; overflow-y: auto;
            background: var(--mj-bg-surface-elevated); border: 1px solid var(--mj-border-default);
            border-radius: 6px; box-shadow: var(--mj-shadow-lg);
            padding: 4px 0;
        }
        .mj-cv-agent-picker__menu-header {
            padding: 6px 12px 4px; font-size: 11px; text-transform: uppercase;
            letter-spacing: 0.04em; color: var(--mj-text-muted);
        }
        .mj-cv-agent-picker__section-label {
            padding: 6px 12px 3px; font-size: 10px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.05em; color: var(--mj-text-muted);
            border-top: 1px solid var(--mj-border-default); margin-top: 4px;
        }
        .mj-cv-agent-picker__item {
            display: flex; align-items: center; gap: 8px; width: 100%;
            padding: 6px 12px; background: transparent; border: none; cursor: pointer;
            color: var(--mj-text-primary); font-size: 13px; text-align: left;
        }
        .mj-cv-agent-picker__item i { width: 14px; text-align: center; color: var(--mj-text-secondary); flex-shrink: 0; }
        .mj-cv-agent-picker__item-name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mj-cv-agent-picker__base-tag {
            font-size: 10px; padding: 1px 6px; border-radius: var(--mj-radius-full, 999px);
            background: var(--mj-bg-surface-sunken); color: var(--mj-text-muted); flex-shrink: 0;
        }
        .mj-cv-agent-picker__item:hover { background: var(--mj-bg-surface-hover); }
        .mj-cv-agent-picker__item--selected { background: color-mix(in srgb, var(--mj-brand-primary) 10%, transparent); }
        .mj-cv-agent-picker__item--selected i { color: var(--mj-brand-primary); }
        .mj-cv-agent-picker__empty { padding: 8px 12px; font-size: 12px; color: var(--mj-text-muted); }
    `]
})
export class ConversationAgentPickerComponent implements OnInit {
    private static readonly STANDARD_POSITIONS: ConnectedPosition[] = [
        { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
        { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
    ];
    private static readonly COMPACT_POSITIONS: ConnectedPosition[] = [
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    ];

    /** The conversation whose `DefaultAgentID` this widget edits. */
    @Input() Conversation: MJConversationEntity | null = null;

    /** Selected agent ID when operating in unbound pre-create mode (`AllowUnboundSelection = true`). */
    @Input() SelectedAgentId: string | null = null;

    /** Allows choosing/emitting an agent even before `Conversation` has been saved. */
    @Input() AllowUnboundSelection = false;

    /** Compact pill styling and upward overlay placement (for nested panels such as Side Questions). */
    @Input() Compact = false;

    /** Label shown on the trigger when no explicit agent is selected/pinned. */
    @Input() DefaultLabel = 'Auto';

    /** Menu item label for resetting to default routing. */
    @Input() DefaultMenuOptionLabel = 'Auto (use default)';

    /** Header text inside the dropdown menu. */
    @Input() MenuHeader = 'Default agent for this conversation';

    /** Required for the Save() audit context. */
    @Input() CurrentUser: UserInfo | null = null;

    /** Disable the picker (e.g. read-only conversation or active turn). */
    @Input() Disabled: boolean = false;

    /**
     * The agents the chat allows (the chat area's `AllowedAgentIDs`). Only these can be pinned.
     * Null (the default) offers every eligible agent.
     */
    @Input()
    set AllowedAgentIDs(value: readonly string[] | null) {
        this._allowedAgentIDs = value ?? null;
        this.applyAllowedAgents();
    }
    get AllowedAgentIDs(): readonly string[] | null {
        return this._allowedAgentIDs;
    }

    /** Emitted after a selection change (or successful save) with the new (or null) agent ID. */
    @Output() AgentChanged = new EventEmitter<string | null>();

    public IsOpen = false;
    public EligibleAgents: MJAIAgentEntityExtended[] = [];

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly notifications = inject(MJNotificationService);
    private _allowedAgentIDs: readonly string[] | null = null;
    /** Every top-level, active agent, before the allowed list narrows it. */
    private catalogAgents: MJAIAgentEntityExtended[] = [];

    public async ngOnInit(): Promise<void> {
        try {
            await AIEngineBase.Instance.Config(false);
            this.rebuildCatalog();
        } catch (err) {
            LogError(`ConversationAgentPicker.ngOnInit: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    private rebuildCatalog(): void {
        this.catalogAgents = (AIEngineBase.Instance.ReadableAgents ?? [])
            .filter(a =>
                !a.ParentID &&
                a.Status === 'Active' &&
                a.InvocationMode !== 'Sub-Agent' &&
                a.InstantiationMode !== 'Required'
            )
            .sort((a, b) => (a.Name ?? '').localeCompare(b.Name ?? ''));
        this.applyAllowedAgents();
    }

    /** Narrows the catalog to the allowed agents. */
    private applyAllowedAgents(): void {
        this.EligibleAgents = this.catalogAgents.filter(a => IsAgentAllowed(a.ID, this._allowedAgentIDs));
        this.cdr?.markForCheck?.();
    }

    public get MenuPositions(): ConnectedPosition[] {
        return this.Compact
            ? ConversationAgentPickerComponent.COMPACT_POSITIONS
            : ConversationAgentPickerComponent.STANDARD_POSITIONS;
    }

    public get EffectiveAgentId(): string | null {
        return this.Conversation?.DefaultAgentID ?? this.SelectedAgentId ?? null;
    }

    public get MyEligibleAgents(): MJAIAgentEntityExtended[] {
        return this.EligibleAgents.filter(a => Boolean(a.BaseAgentID));
    }

    public get CatalogEligibleAgents(): MJAIAgentEntityExtended[] {
        return this.EligibleAgents.filter(a => !a.BaseAgentID);
    }

    private get currentPinnedAgent(): MJAIAgentEntityExtended | undefined {
        const id = this.EffectiveAgentId;
        if (!id) return undefined;
        return this.EligibleAgents.find(a => UUIDsEqual(a.ID, id))
            ?? (AIEngineBase.Instance.ReadableAgents ?? []).find(a => UUIDsEqual(a.ID, id));
    }

    public get CurrentAgentLabel(): string {
        if (!this.EffectiveAgentId) return this.DefaultLabel;
        return this.currentPinnedAgent?.Name ?? 'Pinned agent';
    }

    public get CurrentAgentLogoUrl(): string | null {
        const url = this.currentPinnedAgent?.LogoURL?.trim();
        return url ? url : null;
    }

    public BaseAgentNameFor(agent: MJAIAgentEntityExtended): string | null {
        if (!agent.BaseAgentID) return null;
        return AIEngineBase.Instance.GetAgentByID(agent.BaseAgentID)?.Name ?? null;
    }

    public get CurrentAgentIconClass(): string {
        if (!this.EffectiveAgentId) {
            return this.Compact ? 'fa-solid fa-wand-magic-sparkles' : 'fa-solid fa-robot';
        }
        return this.currentPinnedAgent ? this.IconClassFor(this.currentPinnedAgent) : 'fa-solid fa-robot';
    }

    public get ButtonTitle(): string {
        return this.EffectiveAgentId
            ? `Routing to ${this.CurrentAgentLabel}. Click to change.`
            : 'Using default routing. Click to choose an agent.';
    }

    public IconClassFor(agent: MJAIAgentEntityExtended): string {
        const raw = agent.IconClass?.trim();
        if (!raw) return 'fa-solid fa-robot';
        if (/\bfa-(solid|regular|brands|light|thin|duotone)\b|\bfa[srbltd]\b/.test(raw)) {
            return raw;
        }
        return `fa-solid ${raw}`;
    }

    public IsSelected(agent: MJAIAgentEntityExtended): boolean {
        const id = this.EffectiveAgentId;
        return !!id && UUIDsEqual(agent.ID, id);
    }

    public Toggle(event: MouseEvent): void {
        event.stopPropagation();
        if (this.Disabled || (!this.Conversation && !this.AllowUnboundSelection)) return;
        this.IsOpen = !this.IsOpen;
        if (this.IsOpen) {
            this.rebuildCatalog();
        }
        this.cdr?.markForCheck?.();
    }

    public Close(): void {
        if (this.IsOpen) {
            this.IsOpen = false;
            this.cdr?.markForCheck?.();
        }
    }

    public OnOverlayKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.Close();
        }
    }

    public async PickAgent(agent: MJAIAgentEntityExtended | null): Promise<void> {
        this.IsOpen = false;
        const newId = agent?.ID ?? null;
        const conv = this.Conversation;
        if (!conv) {
            if (!this.AllowUnboundSelection) return;
            if (this.SelectedAgentId === newId || (this.SelectedAgentId && newId && UUIDsEqual(this.SelectedAgentId, newId))) {
                this.cdr?.markForCheck?.();
                return;
            }
            this.SelectedAgentId = newId;
            this.AgentChanged.emit(newId);
            this.cdr?.markForCheck?.();
            return;
        }
        if (conv.DefaultAgentID === newId || (conv.DefaultAgentID && newId && UUIDsEqual(conv.DefaultAgentID, newId))) {
            this.cdr?.markForCheck?.();
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
            this.SelectedAgentId = newId;
            this.AgentChanged.emit(newId);
        } catch (err) {
            conv.DefaultAgentID = prev;
            LogError(`ConversationAgentPicker.PickAgent: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.cdr?.markForCheck?.();
        }
    }
}
