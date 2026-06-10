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

/**
 * Compact anchored popover that lets the user choose WHICH agent a realtime
 * voice call should front, shown by {@link MessageInputComponent} when the
 * phone button is clicked on a conversation with **no prior agent
 * participation** (new / empty conversation). Existing conversations keep
 * their friction-free "call the resolved agent immediately" behavior — this
 * picker never appears there.
 *
 * Deliberately dumb: the host supplies the agent list (the same cached set
 * the @mention autocomplete / routing logic uses) and the resolved default
 * agent to preselect; the picker just emits the user's choice. It does NOT
 * persist anything (unlike `mj-conversation-agent-picker`, which pins
 * `MJConversationEntity.DefaultAgentID` and saves the conversation — a
 * different job, which is why this is a separate component).
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
                    <div class="mj-voice-picker__empty">No matching agents</div>
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
                            @if (UUIDsEqual(agent.ID, DefaultAgentId)) {
                                <span class="mj-voice-picker__default-badge">default</span>
                            }
                        </button>
                    }
                }
            </div>
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
        .mj-voice-picker__footer {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px;
        }
    `]
})
export class VoiceAgentPickerComponent implements OnInit, AfterViewInit {
    /** Agents the user can call — same cached set the @mention / routing logic uses. */
    @Input() Agents: MJAIAgentEntityExtended[] = [];

    /** The agent the default resolution would pick — preselected and listed first. */
    @Input() DefaultAgentId: string | null = null;

    /** Emitted with the chosen agent when the user confirms. */
    @Output() AgentPicked = new EventEmitter<MJAIAgentEntityExtended>();

    /** Emitted when the user dismisses without starting a call. */
    @Output() Cancelled = new EventEmitter<void>();

    @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

    public SearchText = '';
    public SelectedAgentId: string | null = null;

    // Template helper — expose the shared UUID comparator to the view.
    public readonly UUIDsEqual = UUIDsEqual;

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    public ngOnInit(): void {
        const initial = this.DefaultAgentId && this.findAgent(this.DefaultAgentId)
            ? this.DefaultAgentId
            : this.FilteredAgents[0]?.ID ?? null;
        this.SelectedAgentId = initial;
    }

    public ngAfterViewInit(): void {
        // Microtask so focus lands after the popover renders without
        // triggering ExpressionChangedAfterItHasBeenChecked.
        Promise.resolve().then(() => this.searchInput?.nativeElement.focus());
    }

    /** Search-filtered agents, default agent first, then alphabetical. */
    public get FilteredAgents(): MJAIAgentEntityExtended[] {
        const needle = this.SearchText.trim().toLowerCase();
        return this.Agents
            .filter(a => !needle || (a.Name ?? '').toLowerCase().includes(needle))
            .sort((a, b) => {
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
        this.AgentPicked.emit(agent);
    }

    public StartCall(): void {
        const agent = this.SelectedAgent;
        if (agent) {
            this.AgentPicked.emit(agent);
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

    private isDefault(agent: MJAIAgentEntityExtended): boolean {
        return !!this.DefaultAgentId && UUIDsEqual(agent.ID, this.DefaultAgentId);
    }

    private findAgent(id: string): MJAIAgentEntityExtended | null {
        return this.Agents.find(a => UUIDsEqual(a.ID, id)) ?? null;
    }
}
