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
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { MJAIAgentConfigurationEntity } from '@memberjunction/core-entities';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Per-agent quality/speed mode picker. Sits next to the agent picker in
 * the chat-area header. Lists the **active agent's** configured
 * presets (e.g. Draft / Standard / High) from
 * `AIEngineBase.Instance.GetAgentConfigurationPresets(agentId)` and lets
 * the user pick the one applied to all SUBSEQUENT requests in this
 * conversation. Past messages are not retroactively re-routed.
 *
 * Choice persists per-user, per-agent via `UserInfoEngine` (key
 * `mj.agentMode.<agentId>` = preset name). Cross-device, cross-browser
 * — same model the form-variant preference uses. No DB schema changes.
 *
 * Auto-hides when the active agent has fewer than 2 presets — a
 * single-mode agent doesn't need a switcher.
 */
@Component({
    standalone: false,
    selector: 'mj-conversation-mode-picker',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (Presets.length >= 2) {
            <div class="mj-cv-mode-picker" [class.mj-cv-mode-picker--open]="IsOpen">
                <button
                    type="button"
                    class="mj-cv-mode-picker__trigger"
                    [title]="ButtonTitle"
                    [disabled]="Disabled"
                    (click)="Toggle($event)">
                    <i [class]="IconClassFor(CurrentPreset)"></i>
                    <span class="mj-cv-mode-picker__label">{{ CurrentLabel }}</span>
                    <i class="fa-solid fa-caret-down mj-cv-mode-picker__caret"></i>
                </button>
                @if (IsOpen) {
                    <div class="mj-cv-mode-picker__menu" (click)="$event.stopPropagation()">
                        <div class="mj-cv-mode-picker__menu-header">Mode for the next message</div>
                        @for (p of Presets; track p.ID) {
                            <button
                                type="button"
                                class="mj-cv-mode-picker__item"
                                [class.mj-cv-mode-picker__item--selected]="IsSelected(p)"
                                [title]="p.Description || p.Name"
                                (click)="PickPreset(p)">
                                <i [class]="IconClassFor(p)"></i>
                                <div class="mj-cv-mode-picker__item-text">
                                    <span class="mj-cv-mode-picker__item-name">{{ p.DisplayName || p.Name }}</span>
                                    @if (p.Description) {
                                        <span class="mj-cv-mode-picker__item-desc">{{ p.Description }}</span>
                                    }
                                </div>
                            </button>
                        }
                    </div>
                }
            </div>
        }
    `,
    styles: [`
        .mj-cv-mode-picker { position: relative; display: inline-flex; align-items: center; }
        .mj-cv-mode-picker__trigger {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 6px 12px; min-height: 32px; box-sizing: border-box;
            background: var(--mj-bg-surface-card); border: 1px solid var(--mj-border-default);
            border-radius: 4px; cursor: pointer;
            color: var(--mj-text-primary); font-size: 0.8125rem; line-height: 1.5;
            transition: background 120ms, border-color 120ms;
        }
        .mj-cv-mode-picker__trigger:hover:not(:disabled) {
            background: var(--mj-bg-surface-hover); border-color: var(--mj-border-strong);
        }
        .mj-cv-mode-picker__trigger:disabled { opacity: 0.5; cursor: not-allowed; }
        .mj-cv-mode-picker--open .mj-cv-mode-picker__trigger { border-color: var(--mj-border-focus); }
        .mj-cv-mode-picker__label { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mj-cv-mode-picker__caret { font-size: 10px; opacity: 0.7; }
        .mj-cv-mode-picker__menu {
            position: absolute; top: calc(100% + 4px); right: 0; z-index: 50;
            min-width: 280px; max-height: 360px; overflow-y: auto;
            background: var(--mj-bg-surface-elevated); border: 1px solid var(--mj-border-default);
            border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);
            padding: 4px 0;
        }
        .mj-cv-mode-picker__menu-header {
            padding: 6px 12px 4px; font-size: 11px; text-transform: uppercase;
            letter-spacing: 0.04em; color: var(--mj-text-muted);
        }
        .mj-cv-mode-picker__item {
            display: flex; align-items: flex-start; gap: 10px; width: 100%;
            padding: 8px 12px; background: transparent; border: none; cursor: pointer;
            color: var(--mj-text-primary); font-size: 13px; text-align: left;
        }
        .mj-cv-mode-picker__item > i { margin-top: 2px; width: 16px; text-align: center; color: var(--mj-text-secondary); }
        .mj-cv-mode-picker__item:hover { background: var(--mj-bg-surface-hover); }
        .mj-cv-mode-picker__item--selected { background: color-mix(in srgb, var(--mj-brand-primary) 10%, transparent); }
        .mj-cv-mode-picker__item--selected > i { color: var(--mj-brand-primary); }
        .mj-cv-mode-picker__item-text { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .mj-cv-mode-picker__item-name { font-weight: 600; }
        .mj-cv-mode-picker__item-desc { font-size: 11px; color: var(--mj-text-muted); }
    `]
})
export class ConversationModePickerComponent implements OnInit {
    /**
     * The agent the picker should show presets for. When this changes,
     * the picker re-resolves the available presets and the user's saved
     * choice for that agent. Null hides the picker entirely.
     */
    @Input()
    public set AgentID(value: string | null) {
        if (value === this._agentID) return;
        this._agentID = value;
        this.refresh();
    }
    public get AgentID(): string | null { return this._agentID; }

    /** Disable interactions (e.g. during agent execution). */
    @Input() Disabled: boolean = false;

    /**
     * Emitted whenever the user picks a preset. Payload is the
     * `MJ: AI Agent Configurations.ID` — exactly what
     * `MessageInputComponent` forwards as `agentConfigurationPresetId`
     * on the next message route. Null when the picker is cleared or
     * the active agent has no presets.
     */
    @Output() PresetChanged = new EventEmitter<string | null>();

    public Presets: MJAIAgentConfigurationEntity[] = [];
    public CurrentPreset: MJAIAgentConfigurationEntity | null = null;
    public IsOpen = false;

    private _agentID: string | null = null;
    private readonly cdr = inject(ChangeDetectorRef);

    public async ngOnInit(): Promise<void> {
        await this.refresh();
    }

    public get CurrentLabel(): string {
        return this.CurrentPreset?.DisplayName ?? this.CurrentPreset?.Name ?? 'Mode';
    }

    public get ButtonTitle(): string {
        if (!this.CurrentPreset) return 'Pick a mode';
        const base = `Mode: ${this.CurrentLabel}`;
        const desc = this.CurrentPreset.Description ?? '';
        return desc ? `${base} — ${desc}\n\nClick to change. Applies to the NEXT message.` : `${base} — click to change`;
    }

    /**
     * Heuristic icons by preset name — keeps the picker readable at a
     * glance without needing per-preset config. Falls back to a generic
     * gear when the name doesn't match a known pattern.
     */
    public IconClassFor(p: MJAIAgentConfigurationEntity | null): string {
        const name = (p?.Name ?? '').toLowerCase();
        if (name.includes('draft') || name.includes('fast')) return 'fa-solid fa-bolt';
        if (name.includes('standard') || name.includes('balanced')) return 'fa-solid fa-scale-balanced';
        if (name.includes('high') || name.includes('power') || name.includes('quality')) return 'fa-solid fa-brain';
        return 'fa-solid fa-gear';
    }

    public IsSelected(p: MJAIAgentConfigurationEntity): boolean {
        return !!this.CurrentPreset && UUIDsEqual(p.ID, this.CurrentPreset.ID);
    }

    public Toggle(event: MouseEvent): void {
        event.stopPropagation();
        if (this.Disabled || this.Presets.length < 2) return;
        this.IsOpen = !this.IsOpen;
        this.cdr.markForCheck();
    }

    public PickPreset(p: MJAIAgentConfigurationEntity): void {
        this.IsOpen = false;
        if (this.CurrentPreset && UUIDsEqual(p.ID, this.CurrentPreset.ID)) {
            this.cdr.markForCheck();
            return;
        }
        this.CurrentPreset = p;
        // Persist by NAME (not ID) so the preference survives a
        // metadata refresh that re-stamps preset IDs. Resolution back to
        // the actual config row on read happens via
        // GetAgentConfigurationPresetByName at refresh time.
        if (this._agentID) {
            UserInfoEngine.Instance.SetSettingDebounced(this.storageKey(this._agentID), p.Name);
        }
        this.PresetChanged.emit(p.ID);
        this.cdr.markForCheck();
    }

    /** Re-load presets for the active agent and apply the saved choice. */
    private async refresh(): Promise<void> {
        if (!this._agentID) {
            this.Presets = [];
            this.CurrentPreset = null;
            this.PresetChanged.emit(null);
            this.cdr.markForCheck();
            return;
        }
        try {
            await AIEngineBase.Instance.Config(false);
            this.Presets = AIEngineBase.Instance.GetAgentConfigurationPresets(this._agentID, true) ?? [];
            this.CurrentPreset = this.resolveSavedOrDefault();
            this.PresetChanged.emit(this.CurrentPreset?.ID ?? null);
            this.cdr.markForCheck();
        } catch (err) {
            LogError(`ConversationModePicker.refresh: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** User's saved pick (by Name) → preset, or the agent's IsDefault row. */
    private resolveSavedOrDefault(): MJAIAgentConfigurationEntity | null {
        if (!this._agentID || this.Presets.length === 0) return null;
        const savedName = UserInfoEngine.Instance.GetSetting(this.storageKey(this._agentID));
        if (savedName) {
            const match = AIEngineBase.Instance.GetAgentConfigurationPresetByName(this._agentID, savedName);
            if (match) return match;
        }
        return this.Presets.find(p => p.IsDefault) ?? this.Presets[0];
    }

    private storageKey(agentID: string): string {
        return `mj.agentMode.${agentID.toLowerCase()}`;
    }

    @HostListener('document:click', ['$event'])
    public OnDocumentClick(_event: MouseEvent): void {
        if (this.IsOpen) {
            this.IsOpen = false;
            this.cdr.markForCheck();
        }
    }
}
