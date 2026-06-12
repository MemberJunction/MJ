import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    HostListener,
    Input,
    OnInit,
    Output,
    ViewChild,
    AfterViewInit,
    inject,
} from '@angular/core';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { REALTIME_ADVANCED_SESSION_CONTROLS, UserHoldsAuthorization } from '../../services/user-authorization';
import {
    BuildVoiceModelOptions,
    ConstrainTargetsToPairings,
    DefaultPairedTargetId,
    LoadCoAgentPairings,
    VoiceModelOption,
    VoicePairedAgentRow,
} from '../../services/voice-pairing';

/**
 * The user's confirmed choice from the voice picker: the agent to call, an optional
 * EXPLICIT realtime model (`null` = "Auto (recommended)", i.e. let the server pick —
 * always `null` for users without the `Realtime: Advanced Session Controls`
 * authorization, who never see the model selector), and an optional EXPLICIT co-agent
 * (`null` = the server's co-agent resolution chain).
 */
export interface VoiceAgentPick {
    /** The agent the voice call should front. */
    Agent: MJAIAgentEntityExtended;
    /** Explicit realtime model id, or `null` for the server's automatic selection. */
    PreferredModelId: string | null;
    /** Explicit co-agent id (`MJ: AI Agents.ID`, Realtime type), or `null` for the server's resolution chain. */
    CoAgentId: string | null;
}

/**
 * Compact anchored popover that lets the user choose WHICH agent a realtime
 * voice call should front — shown by {@link MessageInputComponent} when the
 * phone button is clicked on a conversation with **no prior agent
 * participation** (new / empty conversation), and on demand via the caret
 * button next to the phone (any conversation), where it doubles as the way
 * to pick a specific **co-agent** (the Realtime-type agent that voices the
 * call) and — for authorized users — a specific **voice model**. The plain
 * phone click on an existing conversation keeps its friction-free "call the
 * resolved agent immediately" behavior.
 *
 * Mostly dumb: the host supplies the agent list (the same cached set the
 * @mention autocomplete / routing logic uses), the Realtime-type co-agent
 * candidates (filtered from that same set), and the defaults to preselect;
 * the picker emits the user's choice. The data it loads itself:
 * - the compact "Voice model" option list (active Realtime models via a
 *   narrow RunView) — loaded and rendered ONLY when the current user holds
 *   the `Realtime: Advanced Session Controls` authorization (pure UX
 *   disclosure; the server enforces the authorization on the mint), and
 * - the chosen co-agent's pairing rows (`MJ: AI Agent Paired Agents`): a
 *   co-agent with pairing rows may only front its paired targets, so the
 *   agent list constrains to those rows (Sequence order) with the IsDefault
 *   row preselected; a co-agent with zero rows is universal and the list is
 *   untouched.
 *
 * It does NOT persist anything (the host persists the co-agent preference
 * via `UserInfoEngine`; `mj-conversation-agent-picker` pins
 * `MJConversationEntity.DefaultAgentID` — different jobs, which is why this
 * is a separate component).
 *
 * Anchors itself bottom-right above the composer — the host's
 * `.message-input-wrapper` is `position: relative`.
 */
@Component({
    standalone: true,
    selector: 'mj-voice-agent-picker',
    imports: [MJButtonDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mj-voice-picker" (click)="$event.stopPropagation()">
            <div class="mj-voice-picker__header">
                <i class="fa-solid fa-phone"></i>
                <span>Start a voice call with…</span>
            </div>
            @if (ShowCoAgentSelect) {
                <div class="mj-voice-picker__select-row">
                    <label class="mj-voice-picker__select-label" for="mjVoiceCoAgentSelect">
                        <i class="fa-solid fa-headset"></i>
                        <span>Co-agent</span>
                    </label>
                    <select
                        #coAgentSelect
                        id="mjVoiceCoAgentSelect"
                        class="mj-voice-picker__select"
                        [value]="SelectedCoAgentId ?? ''"
                        (change)="OnCoAgentChange(coAgentSelect.value)">
                        <option value="">Auto (recommended)</option>
                        @for (coAgent of CoAgents; track coAgent.ID) {
                            <option [value]="coAgent.ID">{{ coAgent.Name }}</option>
                        }
                    </select>
                </div>
            }
            <div class="mj-voice-picker__search">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input
                    #searchInput
                    type="text"
                    placeholder="Search agents"
                    [value]="SearchText"
                    (input)="OnSearchInput(searchInput.value)"
                    (keydown.enter)="StartCall()"
                    (keydown.arrowdown)="MoveSelection(1); $event.preventDefault()"
                    (keydown.arrowup)="MoveSelection(-1); $event.preventDefault()" />
            </div>
            <div class="mj-voice-picker__list">
                @if (FilteredAgents.length === 0) {
                    <div class="mj-voice-picker__empty">{{ IsConstrainedByPairings ? 'No paired agents available' : 'No matching agents' }}</div>
                } @else {
                    @for (agent of FilteredAgents; track agent.ID) {
                        <button
                            type="button"
                            class="mj-voice-picker__item"
                            [class.mj-voice-picker__item--selected]="IsSelected(agent)"
                            [title]="agent.Description || agent.Name"
                            (click)="Select(agent)"
                            (dblclick)="Pick(agent)">
                            <i [class]="IconClassFor(agent)"></i>
                            <span class="mj-voice-picker__item-name">{{ agent.Name }}</span>
                            @if (IsDefaultChoice(agent)) {
                                <span class="mj-voice-picker__default-badge">default</span>
                            }
                        </button>
                    }
                }
            </div>
            @if (CanOverrideSessionConfig && Models.length > 0) {
                <div class="mj-voice-picker__select-row mj-voice-picker__select-row--model">
                    <label class="mj-voice-picker__select-label" for="mjVoiceModelSelect">
                        <i class="fa-solid fa-microchip"></i>
                        <span>Voice model</span>
                    </label>
                    <select
                        #modelSelect
                        id="mjVoiceModelSelect"
                        class="mj-voice-picker__select"
                        [value]="SelectedModelId ?? ''"
                        (change)="OnModelChange(modelSelect.value)">
                        <option value="">Auto (recommended)</option>
                        @for (model of Models; track model.ID) {
                            <option [value]="model.ID">{{ model.Name }}</option>
                        }
                    </select>
                </div>
            }
            <div class="mj-voice-picker__footer">
                <button mjButton variant="primary" size="sm" [disabled]="!SelectedAgent" (click)="StartCall()">
                    <i class="fa-solid fa-phone"></i> Start
                </button>
                <button mjButton variant="outline" size="sm" (click)="Cancel()">Cancel</button>
            </div>
        </div>
    `,
    styles: [`
        :host {
            position: absolute;
            bottom: calc(100% + 8px);
            right: 8px;
            z-index: 60;
        }
        .mj-voice-picker {
            width: 300px;
            display: flex; flex-direction: column;
            background: var(--mj-bg-surface-elevated);
            border: 1px solid var(--mj-border-default);
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
            overflow: hidden;
        }
        .mj-voice-picker__header {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px 8px;
            font-size: 13px; font-weight: 600;
            color: var(--mj-text-primary);
        }
        .mj-voice-picker__header i { color: var(--mj-brand-primary); }
        .mj-voice-picker__search {
            display: flex; align-items: center; gap: 8px;
            margin: 0 12px 8px;
            padding: 0 10px;
            background: var(--mj-bg-surface-sunken);
            border: 1px solid var(--mj-border-subtle);
            border-radius: 6px;
        }
        .mj-voice-picker__search i { font-size: 12px; color: var(--mj-text-muted); }
        .mj-voice-picker__search input {
            flex: 1; min-width: 0;
            padding: 7px 0;
            background: transparent; border: none; outline: none;
            font-size: 13px; color: var(--mj-text-primary);
        }
        .mj-voice-picker__search input::placeholder { color: var(--mj-text-disabled); }
        .mj-voice-picker__search:focus-within { border-color: var(--mj-border-focus); }
        .mj-voice-picker__list {
            max-height: 220px; overflow-y: auto;
            border-top: 1px solid var(--mj-border-subtle);
            border-bottom: 1px solid var(--mj-border-subtle);
            padding: 4px 0;
        }
        .mj-voice-picker__item {
            display: flex; align-items: center; gap: 8px; width: 100%;
            padding: 7px 12px;
            background: transparent; border: none; cursor: pointer;
            color: var(--mj-text-primary); font-size: 13px; text-align: left;
        }
        .mj-voice-picker__item i { width: 16px; text-align: center; color: var(--mj-text-secondary); }
        .mj-voice-picker__item:hover { background: var(--mj-bg-surface-hover); }
        .mj-voice-picker__item--selected {
            background: color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
        }
        .mj-voice-picker__item--selected i { color: var(--mj-brand-primary); }
        .mj-voice-picker__item-name {
            flex: 1; min-width: 0;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .mj-voice-picker__default-badge {
            flex-shrink: 0;
            padding: 1px 6px;
            border-radius: 999px;
            font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
            color: var(--mj-brand-primary);
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent);
        }
        .mj-voice-picker__empty {
            padding: 12px; font-size: 12px; color: var(--mj-text-muted); text-align: center;
        }
        .mj-voice-picker__select-row {
            display: flex; align-items: center; gap: 8px;
            padding: 0 12px 8px;
        }
        .mj-voice-picker__select-row--model {
            padding: 8px 12px 0;
        }
        .mj-voice-picker__select-label {
            display: flex; align-items: center; gap: 6px;
            flex-shrink: 0;
            font-size: 12px; color: var(--mj-text-secondary);
        }
        .mj-voice-picker__select-label i { font-size: 11px; color: var(--mj-text-muted); }
        .mj-voice-picker__select {
            flex: 1; min-width: 0;
            padding: 5px 8px;
            font-size: 12px;
            color: var(--mj-text-primary);
            background: var(--mj-bg-surface-sunken);
            border: 1px solid var(--mj-border-subtle);
            border-radius: 6px;
            outline: none;
        }
        .mj-voice-picker__select:focus { border-color: var(--mj-border-focus); }
        .mj-voice-picker__footer {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px;
        }
    `]
})
export class VoiceAgentPickerComponent extends BaseAngularComponent implements OnInit, AfterViewInit {
    /** Agents the user can call — same cached set the @mention / routing logic uses. */
    @Input() Agents: MJAIAgentEntityExtended[] = [];

    /** The agent the default resolution would pick — preselected and listed first. */
    @Input() DefaultAgentId: string | null = null;

    /**
     * The ACTIVE Realtime-type co-agent candidates the user can run (host-filtered from
     * the same cached, run-permission-filtered agent set as {@link Agents}). The co-agent
     * selector renders only when MORE THAN ONE candidate exists — with zero or one
     * there's nothing meaningful to choose and the server's resolution chain applies.
     */
    @Input() CoAgents: MJAIAgentEntityExtended[] = [];

    /**
     * The user's persisted co-agent preference (host-loaded via `UserInfoEngine`) —
     * preselected in the co-agent selector when it's still a valid candidate.
     */
    @Input() DefaultCoAgentId: string | null = null;

    /** Emitted with the chosen agent + optional explicit voice model / co-agent when the user confirms. */
    @Output() AgentPicked = new EventEmitter<VoiceAgentPick>();

    /** Emitted when the user dismisses without starting a call. */
    @Output() Cancelled = new EventEmitter<void>();

    @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

    public SearchText = '';
    public SelectedAgentId: string | null = null;

    /** Active Realtime models the "Voice model" selector offers (loaded only for authorized users). */
    public Models: VoiceModelOption[] = [];

    /** The explicitly chosen voice model id, or `null` for "Auto (recommended)" (the default). */
    public SelectedModelId: string | null = null;

    /** The explicitly chosen co-agent id, or `null` for "Auto (recommended)" (the server's chain). */
    public SelectedCoAgentId: string | null = null;

    /**
     * Whether the current user holds the `Realtime: Advanced Session Controls`
     * authorization. Gates the voice-model selector (and any future config-override
     * controls) — pure disclosure; the server enforces the authorization on the mint.
     */
    public CanOverrideSessionConfig = false;

    /** The selected co-agent's pairing rows; empty = universal co-agent (no constraint). */
    public Pairings: VoicePairedAgentRow[] = [];

    // Template helper — expose the shared UUID comparator to the view.
    public readonly UUIDsEqual = UUIDsEqual;

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
    /** Monotonic guard so a stale pairing load can't clobber a newer co-agent choice. */
    private pairingLoadToken = 0;

    /** Co-agent selector visibility: only when there is a real choice to make. */
    public get ShowCoAgentSelect(): boolean {
        return this.CoAgents.length > 1;
    }

    /** True while the agent list is constrained to the selected co-agent's paired targets. */
    public get IsConstrainedByPairings(): boolean {
        return this.Pairings.length > 0;
    }

    public ngOnInit(): void {
        const initial = this.DefaultAgentId && this.findAgent(this.DefaultAgentId)
            ? this.DefaultAgentId
            : this.FilteredAgents[0]?.ID ?? null;
        this.SelectedAgentId = initial;
        this.CanOverrideSessionConfig = UserHoldsAuthorization(
            this.ProviderToUse?.CurrentUser,
            REALTIME_ADVANCED_SESSION_CONTROLS,
            this.ProviderToUse
        );
        if (this.CanOverrideSessionConfig) {
            void this.loadVoiceModels();
        }
        // Preselect the persisted co-agent preference when it's still a valid candidate.
        if (this.DefaultCoAgentId && this.CoAgents.some(a => UUIDsEqual(a.ID, this.DefaultCoAgentId))) {
            this.SelectedCoAgentId = this.DefaultCoAgentId;
            void this.reloadPairings();
        }
    }

    /**
     * Loads the "Voice model" options: active models whose type is `Realtime`, filtered from
     * {@link AIEngineBase}'s already-cached `Models` (provider-scoped engine instance, lazy
     * `Config` — no RunView round-trip). Called ONLY for users who hold the
     * advanced-session-controls authorization. Tolerant — a failure simply leaves
     * the selector hidden (the server's automatic selection still applies).
     */
    private async loadVoiceModels(): Promise<void> {
        try {
            const engine = AIEngineBase.GetProviderInstance<AIEngineBase>(this.ProviderToUse, AIEngineBase) as AIEngineBase;
            await engine.Config(false, undefined, this.ProviderToUse);
            this.Models = BuildVoiceModelOptions(engine.Models ?? []);
        } catch (error) {
            console.error('[VoiceAgentPicker] Failed to load realtime models:', error);
            this.Models = [];
        }
        this.cdr.markForCheck();
    }

    /** Records the voice-model choice (`''` = Auto → `null`). */
    public OnModelChange(value: string): void {
        this.SelectedModelId = value && value.length > 0 ? value : null;
        this.cdr.markForCheck();
    }

    /** Records the co-agent choice (`''` = Auto → `null`) and refreshes the pairing constraint. */
    public OnCoAgentChange(value: string): void {
        this.SelectedCoAgentId = value && value.length > 0 ? value : null;
        void this.reloadPairings();
    }

    /**
     * Loads the selected co-agent's pairing rows and re-applies the target constraint:
     * with rows present, the agent list narrows to the paired targets (Sequence order)
     * and the IsDefault row's target is preselected; with zero rows (or Auto co-agent)
     * the list returns to the unconstrained default. Guarded against stale loads when
     * the user changes co-agents quickly.
     */
    private async reloadPairings(): Promise<void> {
        const token = ++this.pairingLoadToken;
        const coAgentId = this.SelectedCoAgentId;
        const pairings = coAgentId ? await LoadCoAgentPairings(this.ProviderToUse, coAgentId) : [];
        if (token !== this.pairingLoadToken) {
            return; // a newer co-agent choice superseded this load
        }
        this.Pairings = pairings;
        this.ensureSelectionVisible();
        this.cdr.markForCheck();
    }

    /**
     * Keeps the target selection coherent after the visible list changes: prefers the
     * pairing default (when constrained), then the host default, then keeps the current
     * selection when still visible, then the first visible row.
     */
    private ensureSelectionVisible(): void {
        const visible = this.FilteredAgents;
        if (this.IsConstrainedByPairings) {
            const pairedDefault = DefaultPairedTargetId(this.Pairings);
            if (pairedDefault && visible.some(a => UUIDsEqual(a.ID, pairedDefault))) {
                this.SelectedAgentId = pairedDefault;
                return;
            }
        }
        if (this.SelectedAgentId && visible.some(a => UUIDsEqual(a.ID, this.SelectedAgentId))) {
            return; // current selection still valid
        }
        if (this.DefaultAgentId && visible.some(a => UUIDsEqual(a.ID, this.DefaultAgentId))) {
            this.SelectedAgentId = this.DefaultAgentId;
            return;
        }
        this.SelectedAgentId = visible[0]?.ID ?? null;
    }

    public ngAfterViewInit(): void {
        // Microtask so focus lands after the popover renders without
        // triggering ExpressionChangedAfterItHasBeenChecked.
        Promise.resolve().then(() => this.searchInput?.nativeElement.focus());
    }

    /**
     * The visible target list: pairing-constrained first (a co-agent WITH pairing rows may
     * only front its paired targets, kept in pairing Sequence order), then search-filtered.
     * Unconstrained lists keep the default-first + alphabetical ordering.
     */
    public get FilteredAgents(): MJAIAgentEntityExtended[] {
        const base = ConstrainTargetsToPairings(this.Agents, this.Pairings);
        const needle = this.SearchText.trim().toLowerCase();
        const filtered = base.filter(a => !needle || (a.Name ?? '').toLowerCase().includes(needle));
        if (this.IsConstrainedByPairings) {
            return filtered; // pairing Sequence order is the canonical order
        }
        return filtered.sort((a, b) => {
            const aDefault = this.isDefault(a) ? 0 : 1;
            const bDefault = this.isDefault(b) ? 0 : 1;
            if (aDefault !== bDefault) return aDefault - bDefault;
            return (a.Name ?? '').localeCompare(b.Name ?? '');
        });
    }

    public get SelectedAgent(): MJAIAgentEntityExtended | null {
        return this.SelectedAgentId ? this.findAgent(this.SelectedAgentId) : null;
    }

    public IsSelected(agent: MJAIAgentEntityExtended): boolean {
        return !!this.SelectedAgentId && UUIDsEqual(agent.ID, this.SelectedAgentId);
    }

    /**
     * Whether `agent` carries the "default" badge: under a pairing constraint that's the
     * co-agent's IsDefault target; otherwise the host-resolved default agent.
     */
    public IsDefaultChoice(agent: MJAIAgentEntityExtended): boolean {
        if (this.IsConstrainedByPairings) {
            const pairedDefault = DefaultPairedTargetId(this.Pairings);
            return !!pairedDefault && UUIDsEqual(agent.ID, pairedDefault);
        }
        return this.isDefault(agent);
    }

    public IconClassFor(agent: MJAIAgentEntityExtended): string {
        return agent.IconClass?.trim() || 'fa-solid fa-robot';
    }

    public OnSearchInput(value: string): void {
        this.SearchText = value;
        // Keep the selection on a visible row.
        const visible = this.FilteredAgents;
        if (!visible.some(a => this.IsSelected(a))) {
            this.SelectedAgentId = visible[0]?.ID ?? null;
        }
        this.cdr.markForCheck();
    }

    /** Arrow-key navigation through the filtered list. */
    public MoveSelection(delta: number): void {
        const visible = this.FilteredAgents;
        if (visible.length === 0) return;
        const currentIndex = visible.findIndex(a => this.IsSelected(a));
        const nextIndex = currentIndex < 0
            ? 0
            : Math.min(visible.length - 1, Math.max(0, currentIndex + delta));
        this.SelectedAgentId = visible[nextIndex].ID;
        this.cdr.markForCheck();
    }

    public Select(agent: MJAIAgentEntityExtended): void {
        this.SelectedAgentId = agent.ID;
        this.cdr.markForCheck();
    }

    /** Confirm a specific agent immediately (double-click shortcut). */
    public Pick(agent: MJAIAgentEntityExtended): void {
        this.AgentPicked.emit(this.buildPick(agent));
    }

    public StartCall(): void {
        const agent = this.SelectedAgent;
        if (agent) {
            this.AgentPicked.emit(this.buildPick(agent));
        }
    }

    public Cancel(): void {
        this.Cancelled.emit();
    }

    /** Dismiss when the user clicks anywhere outside the popover. (The phone
     *  button that opens it stops propagation, so the opening click never
     *  reaches this handler.) */
    @HostListener('document:click', ['$event'])
    public OnDocumentClick(event: MouseEvent): void {
        if (!this.elementRef.nativeElement.contains(event.target as Node)) {
            this.Cancelled.emit();
        }
    }

    @HostListener('document:keydown.escape')
    public OnEscape(): void {
        this.Cancelled.emit();
    }

    /**
     * Assembles the emitted pick. The model preference is hard-gated on the
     * authorization here (defense in depth — unauthorized users never see the selector,
     * so `SelectedModelId` should already be null).
     */
    private buildPick(agent: MJAIAgentEntityExtended): VoiceAgentPick {
        return {
            Agent: agent,
            PreferredModelId: this.CanOverrideSessionConfig ? this.SelectedModelId : null,
            CoAgentId: this.SelectedCoAgentId
        };
    }

    private isDefault(agent: MJAIAgentEntityExtended): boolean {
        return !!this.DefaultAgentId && UUIDsEqual(agent.ID, this.DefaultAgentId);
    }

    private findAgent(id: string): MJAIAgentEntityExtended | null {
        return this.Agents.find(a => UUIDsEqual(a.ID, id)) ?? null;
    }
}
