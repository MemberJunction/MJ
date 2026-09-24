/**
 * @fileoverview Scope step controls for the record clone wizard.
 *
 * Implements §12.3 of the record cloning plan with the scope rules from the review:
 * everyone sees the preset picker and a summary of what the clone will copy, taken from the
 * entity's `Configuration.Clone`. Only a holder of `Clone Records: Override Scope` gets the
 * developer overrides (depth, record cap, soft links, subtypes, hierarchy); the Fire Entity
 * Actions toggle needs `Clone Records: Fire Hooks`. The server applies the same rules.
 */

import {
    Component,
    ChangeDetectionStrategy,
    Input,
    Output,
    EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJSwitchComponent } from '@memberjunction/ng-ui-components';
import type { RecordClonePlanOptions } from '@memberjunction/core-entities';

/** The scope values the summary shows and the overrides edit. */
export interface CloneScopeValues {
    MaxDepth: number;
    MaxRecords: number;
    Subtypes: 'include' | 'exclude';
    Hierarchy: 'subtree' | 'node';
    SoftLinks: 'skip' | 'include';
    EntityActions: 'suppress' | 'fire';
}

interface ScopeFact {
    Key: keyof CloneScopeValues;
    Text: string;
}

@Component({
    standalone: true,
    selector: 'mj-clone-scope-controls',
    template: `
        <div class="scope-controls-container">
            @if (Presets && Presets.length > 0) {
                <div class="control-group">
                    <label class="control-label" for="preset-select">Cloning Preset</label>
                    <select
                        id="preset-select"
                        class="mj-select"
                        [ngModel]="SelectedPreset ?? ''"
                        (ngModelChange)="OnPresetChange($event)">
                        <option value="">Default (Custom)</option>
                        @for (preset of Presets; track preset) {
                            <option [value]="preset">{{preset}}</option>
                        }
                    </select>
                </div>
            }

            <div class="scope-summary">
                <div class="summary-top">
                    <span class="summary-title">What will be copied</span>
                    <span class="summary-source">{{ SourceText }}</span>
                </div>
                <div class="facts">
                    @for (fact of Facts; track fact.Key) {
                        <span class="fact" [class.changed]="IsChanged(fact.Key)">{{ fact.Text }}</span>
                    }
                </div>
            </div>

            @if (CanOverrideScope || CanFireHooks) {
                <details class="dev-overrides" [open]="ChangedKeys.length > 0">
                    <summary>
                        <span><i class="fa-solid fa-code"></i>&nbsp; Developer overrides</span>
                        <span class="dev-count">{{ ChangedKeys.length > 0 ? ChangedKeys.length + ' active' : 'none' }}</span>
                    </summary>
                    <div class="dev-body">
                        <p class="dev-warning">
                            These change what the engine copies for this one clone and are saved on the clone log.
                        </p>

                        @if (CanOverrideScope) {
                            <div class="field-row">
                                <label for="max-depth-input">Max depth</label>
                                <input id="max-depth-input" type="number" min="1" max="10" class="mj-input num-input"
                                    [ngModel]="MaxDepth" (ngModelChange)="OnMaxDepthChange($event)" />
                            </div>
                            <div class="field-row">
                                <label for="max-records-input">Max records</label>
                                <input id="max-records-input" type="number" min="1" max="5000" class="mj-input num-input"
                                    [ngModel]="MaxRecords" (ngModelChange)="OnMaxRecordsChange($event)" />
                            </div>
                            <div class="field-row">
                                <span class="toggle-label" (click)="OnSoftLinksToggle(SoftLinks !== 'include')">Include soft links</span>
                                <mj-switch [ngModel]="SoftLinks === 'include'" (ngModelChange)="OnSoftLinksToggle($event)"></mj-switch>
                                <span class="field-hint">Tags, attachments, notes and other EntityID/RecordID rows</span>
                            </div>
                            <div class="field-row">
                                <span class="toggle-label" (click)="OnSubtypesToggle(Subtypes !== 'include')">Include IS-A subtypes</span>
                                <mj-switch [ngModel]="Subtypes === 'include'" (ngModelChange)="OnSubtypesToggle($event)"></mj-switch>
                            </div>
                            <div class="field-row">
                                <span class="toggle-label" (click)="OnHierarchyToggle(Hierarchy !== 'subtree')">Copy the whole hierarchy subtree</span>
                                <mj-switch [ngModel]="Hierarchy === 'subtree'" (ngModelChange)="OnHierarchyToggle($event)"></mj-switch>
                            </div>
                        }

                        @if (CanFireHooks) {
                            <div class="field-row">
                                <span class="toggle-label" (click)="OnEntityActionsToggle(EntityActions !== 'fire')">Fire Entity Actions / Hooks</span>
                                <mj-switch [ngModel]="EntityActions === 'fire'" (ngModelChange)="OnEntityActionsToggle($event)"></mj-switch>
                            </div>
                        }

                        <div class="dev-actions">
                            <span>{{ DefaultsText }}</span>
                            <button type="button" class="link-btn" [disabled]="ChangedKeys.length === 0" (click)="OnResetToDefaults()">
                                Reset to entity defaults
                            </button>
                        </div>
                    </div>
                </details>
            }
        </div>
    `,
    styles: [`
        .scope-controls-container {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-4);
            padding: var(--mj-space-2) 0;
        }

        .control-group {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-1);
        }

        .control-label {
            font-size: var(--mj-text-xs);
            font-weight: 600;
            color: var(--mj-text-primary);
        }

        .mj-select, .mj-input {
            padding: var(--mj-space-1-5) var(--mj-space-2-5);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-sm);
            background: var(--mj-bg-surface);
            color: var(--mj-text-primary);
            font-size: var(--mj-text-sm);
            outline: none;
        }

        .mj-select:focus, .mj-input:focus {
            border-color: var(--mj-brand-primary);
        }

        .scope-summary {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-2);
            padding: var(--mj-space-3);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-md);
            background: var(--mj-bg-surface-card);
        }

        .summary-top {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: baseline;
            gap: var(--mj-space-2);
        }

        .summary-title {
            font-size: var(--mj-text-sm);
            font-weight: 600;
            color: var(--mj-text-primary);
        }

        .summary-source {
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
        }

        .facts {
            display: flex;
            flex-wrap: wrap;
            gap: var(--mj-space-1-5);
        }

        .fact {
            font-size: var(--mj-text-xs);
            padding: 3px var(--mj-space-2);
            border-radius: var(--mj-radius-full);
            border: 1px solid var(--mj-border-default);
            background: var(--mj-bg-surface);
            color: var(--mj-text-secondary);
            font-variant-numeric: tabular-nums;
        }

        .fact.changed {
            border-color: var(--mj-status-warning-border);
            background: var(--mj-status-warning-bg);
            color: var(--mj-status-warning-text);
            font-weight: 600;
        }

        .dev-overrides {
            border: 1px solid var(--mj-status-warning-border);
            border-radius: var(--mj-radius-md);
            overflow: hidden;
        }

        .dev-overrides summary {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: var(--mj-space-2);
            padding: var(--mj-space-2-5) var(--mj-space-3);
            background: var(--mj-status-warning-bg);
            color: var(--mj-status-warning-text);
            font-weight: 600;
            font-size: var(--mj-text-sm);
            cursor: pointer;
            list-style: none;
        }

        .dev-overrides summary::-webkit-details-marker {
            display: none;
        }

        .dev-overrides summary:focus-visible {
            outline: 2px solid var(--mj-border-focus);
            outline-offset: -2px;
        }

        .dev-count {
            font-weight: 500;
            font-size: var(--mj-text-xs);
        }

        .dev-body {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-3);
            padding: var(--mj-space-3);
            background: var(--mj-bg-surface);
        }

        .dev-warning {
            margin: 0;
            font-size: var(--mj-text-xs);
            color: var(--mj-text-secondary);
        }

        .field-row {
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: var(--mj-space-1) var(--mj-space-3);
        }

        .field-row label, .toggle-label {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-primary);
            cursor: pointer;
            user-select: none;
        }

        .field-hint {
            grid-column: 1 / -1;
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
        }

        .num-input {
            width: 96px;
            font-variant-numeric: tabular-nums;
        }

        .dev-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: var(--mj-space-2);
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
        }

        .link-btn {
            border: 0;
            background: none;
            padding: 0;
            color: var(--mj-brand-primary);
            font: inherit;
            cursor: pointer;
        }

        .link-btn:disabled {
            color: var(--mj-text-muted);
            cursor: default;
        }
    `],
    imports: [CommonModule, FormsModule, MJSwitchComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloneScopeControlsComponent {
    /** Preset keys from the entity's `Clone.Presets`. */
    @Input() Presets: string[] = [];
    /** The preset currently applied, if any. */
    @Input() SelectedPreset?: string;

    /** Effective depth the plan uses. */
    @Input() MaxDepth = 3;
    /** Effective cap on records the clone may create. */
    @Input() MaxRecords = 500;
    /** Whether IS-A subtype rows are cloned with their parent. */
    @Input() Subtypes: 'include' | 'exclude' = 'include';
    /** For self-referencing hierarchies: copy the whole subtree, or only this node. */
    @Input() Hierarchy: 'subtree' | 'node' = 'subtree';
    /** Whether polymorphic EntityID/RecordID rows (tags, attachments, notes) are cloned. */
    @Input() SoftLinks: 'skip' | 'include' = 'skip';
    /** Whether Entity Actions run during the clone's saves. */
    @Input() EntityActions: 'suppress' | 'fire' = 'suppress';

    /** The entity's configured scope; the summary highlights where the effective values differ. Null = same as effective. */
    @Input() ConfiguredScope: CloneScopeValues | null = null;
    /** Entity being cloned, for the summary's source line. */
    @Input() EntityName = '';

    /** Show the depth, cap and scope toggles. True only for holders of `Clone Records: Override Scope`. */
    @Input() CanOverrideScope = false;
    /** Show the Fire Entity Actions toggle. True only for holders of `Clone Records: Fire Hooks`. */
    @Input() CanFireHooks = false;

    /** Fires with the full option set whenever any control changes. */
    @Output() ScopeChanged = new EventEmitter<RecordClonePlanOptions>();
    /** Fires when the user asks to drop every override and use the entity's configured scope. */
    @Output() ResetToDefaults = new EventEmitter<void>();

    public get Current(): CloneScopeValues {
        return {
            MaxDepth: this.MaxDepth,
            MaxRecords: this.MaxRecords,
            Subtypes: this.Subtypes,
            Hierarchy: this.Hierarchy,
            SoftLinks: this.SoftLinks,
            EntityActions: this.EntityActions,
        };
    }

    /** Scope values that differ from the entity's configuration. */
    public get ChangedKeys(): Array<keyof CloneScopeValues> {
        const configured = this.ConfiguredScope;
        if (!configured) return [];
        const current = this.Current;
        return (Object.keys(current) as Array<keyof CloneScopeValues>).filter((k) => current[k] !== configured[k]);
    }

    public IsChanged(key: keyof CloneScopeValues): boolean {
        return this.ChangedKeys.includes(key);
    }

    public get Facts(): ScopeFact[] {
        return [
            { Key: 'MaxDepth', Text: `Depth ${this.MaxDepth}` },
            { Key: 'MaxRecords', Text: `Up to ${this.MaxRecords} records` },
            { Key: 'SoftLinks', Text: this.SoftLinks === 'include' ? 'Soft links included' : 'Soft links off' },
            { Key: 'Subtypes', Text: this.Subtypes === 'include' ? 'Subtypes included' : 'Subtypes excluded' },
            { Key: 'Hierarchy', Text: this.Hierarchy === 'subtree' ? 'Hierarchy subtree' : 'This node only' },
            { Key: 'EntityActions', Text: this.EntityActions === 'fire' ? 'Entity actions fire' : 'Entity actions suppressed' },
        ];
    }

    public get SourceText(): string {
        const entity = this.EntityName ? `the ${this.EntityName} clone configuration` : 'the entity clone configuration';
        const n = this.ChangedKeys.length;
        return n === 0 ? `Set by ${entity}` : `${entity.charAt(0).toUpperCase()}${entity.slice(1)}, with ${n} override${n === 1 ? '' : 's'}`;
    }

    public get DefaultsText(): string {
        const c = this.ConfiguredScope;
        if (!c) return '';
        return `Entity defaults: depth ${c.MaxDepth} · ${c.MaxRecords} records · soft links ${c.SoftLinks === 'include' ? 'on' : 'off'}`;
    }

    public OnPresetChange(preset: string): void {
        this.SelectedPreset = preset || undefined;
        this.EmitScopeChanged();
    }

    public OnMaxDepthChange(depth: number | string): void {
        const parsed = typeof depth === 'string' ? parseInt(depth, 10) : depth;
        if (!Number.isFinite(parsed) || parsed < 1) return;
        this.MaxDepth = parsed;
        this.EmitScopeChanged();
    }

    public OnMaxRecordsChange(records: number | string): void {
        const parsed = typeof records === 'string' ? parseInt(records, 10) : records;
        if (!Number.isFinite(parsed) || parsed < 1) return;
        this.MaxRecords = parsed;
        this.EmitScopeChanged();
    }

    public OnSubtypesToggle(checked: boolean): void {
        this.Subtypes = checked ? 'include' : 'exclude';
        this.EmitScopeChanged();
    }

    public OnHierarchyToggle(checked: boolean): void {
        this.Hierarchy = checked ? 'subtree' : 'node';
        this.EmitScopeChanged();
    }

    public OnSoftLinksToggle(checked: boolean): void {
        this.SoftLinks = checked ? 'include' : 'skip';
        this.EmitScopeChanged();
    }

    public OnEntityActionsToggle(checked: boolean): void {
        this.EntityActions = checked ? 'fire' : 'suppress';
        this.EmitScopeChanged();
    }

    public OnResetToDefaults(): void {
        this.ResetToDefaults.emit();
    }

    public EmitScopeChanged(): void {
        this.ScopeChanged.emit({ Preset: this.SelectedPreset, ...this.Current });
    }
}
