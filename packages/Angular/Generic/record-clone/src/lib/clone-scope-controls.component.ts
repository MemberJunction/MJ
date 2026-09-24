/**
 * @fileoverview Scope Controls component for configuring record clone boundaries.
 *
 * Implements §12.3 of the Record Cloning architectural blueprint. Provides preset
 * selection, depth control, Subtypes/Hierarchy/Soft links toggles, Fire hooks toggle,
 * and maximum records readout.
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
                        [ngModel]="SelectedPreset"
                        (ngModelChange)="OnPresetChange($event)">
                        <option value="">Default (Custom)</option>
                        @for (preset of Presets; track preset) {
                            <option [value]="preset">{{preset}}</option>
                        }
                    </select>
                </div>
            }

            <div class="control-group">
                <label class="control-label" for="max-depth-input">Max Graph Depth</label>
                <div class="depth-row">
                    <input
                        id="max-depth-input"
                        type="range"
                        min="1"
                        max="10"
                        class="depth-slider"
                        [ngModel]="MaxDepth"
                        (ngModelChange)="OnMaxDepthChange($event)" />
                    <span class="depth-value">{{MaxDepth}}</span>
                </div>
            </div>

            <div class="toggles-grid">
                <div class="toggle-item">
                    <mj-switch
                        [ngModel]="Subtypes === 'include'"
                        (ngModelChange)="OnSubtypesToggle($event)">
                    </mj-switch>
                    <span class="toggle-label" (click)="OnSubtypesToggle(Subtypes !== 'include')">
                        Include Subtypes (IS-A)
                    </span>
                </div>

                <div class="toggle-item">
                    <mj-switch
                        [ngModel]="Hierarchy === 'subtree'"
                        (ngModelChange)="OnHierarchyToggle($event)">
                    </mj-switch>
                    <span class="toggle-label" (click)="OnHierarchyToggle(Hierarchy !== 'subtree')">
                        Include Subtree Hierarchy
                    </span>
                </div>

                <div class="toggle-item">
                    <mj-switch
                        [ngModel]="SoftLinks === 'include'"
                        (ngModelChange)="OnSoftLinksToggle($event)">
                    </mj-switch>
                    <span class="toggle-label" (click)="OnSoftLinksToggle(SoftLinks !== 'include')">
                        Include Soft Links
                    </span>
                </div>

                @if (CanFireHooks) {
                    <div class="toggle-item">
                        <mj-switch
                            [ngModel]="EntityActions === 'fire'"
                            (ngModelChange)="OnEntityActionsToggle($event)">
                        </mj-switch>
                        <span class="toggle-label" (click)="OnEntityActionsToggle(EntityActions !== 'fire')">
                            Fire Entity Actions / Hooks
                        </span>
                    </div>
                }
            </div>

            <div class="control-group records-cap-group">
                <label class="control-label" for="max-records-input">Record Limit Cap</label>
                <input
                    id="max-records-input"
                    type="number"
                    min="1"
                    max="5000"
                    class="mj-input records-input"
                    [ngModel]="MaxRecords"
                    (ngModelChange)="OnMaxRecordsChange($event)" />
                <span class="control-hint">Maximum number of records allowed across the clone graph.</span>
            </div>
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

        .control-hint {
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
        }

        .mj-select, .mj-input {
            padding: var(--mj-space-1-5) var(--mj-space-2-5);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-sm);
            background: var(--mj-bg-surface);
            color: var(--mj-text-primary);
            font-size: var(--mj-text-sm);
            outline: none;
            transition: border-color 0.15s ease-in-out;
        }

        .mj-select:focus, .mj-input:focus {
            border-color: var(--mj-brand-primary);
        }

        .depth-row {
            display: flex;
            align-items: center;
            gap: var(--mj-space-4);
        }

        .depth-slider {
            flex: 1;
            accent-color: var(--mj-brand-primary);
            cursor: pointer;
        }

        .depth-value {
            font-size: var(--mj-text-sm);
            font-weight: 600;
            min-width: 24px;
            text-align: right;
            color: var(--mj-text-primary);
        }

        .toggles-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--mj-space-4);
            padding: var(--mj-space-2) 0;
        }

        @media (max-width: 640px) {
            .toggles-grid {
                grid-template-columns: 1fr;
            }
        }

        .toggle-item {
            display: flex;
            align-items: center;
            gap: var(--mj-space-2);
        }

        .toggle-label {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-primary);
            cursor: pointer;
            user-select: none;
        }

        .records-input {
            max-width: 160px;
        }
    `],
    imports: [
        CommonModule,
        FormsModule,
        MJSwitchComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloneScopeControlsComponent {
    /** Preset names from the entity's `Clone.Presets`. */
    @Input() Presets: string[] = [];
    /** The preset currently applied, if any. */
    @Input() SelectedPreset?: string;
    /** How many relationship levels below the root the planner walks. */
    @Input() MaxDepth = 3;
    /** Whether IS-A subtype rows are cloned with their parent. */
    @Input() Subtypes: 'include' | 'exclude' = 'include';
    /** For self-referencing hierarchies: copy the whole subtree, or only this node. */
    @Input() Hierarchy: 'subtree' | 'node' = 'subtree';
    /** Whether polymorphic EntityID/RecordID rows (tags, attachments, notes) are cloned. */
    @Input() SoftLinks: 'skip' | 'include' = 'skip';
    /** Whether Entity Actions run during the clone's saves. */
    @Input() EntityActions: 'suppress' | 'fire' = 'suppress';
    /** Show the Fire Entity Actions toggle. Only true for users authorized to fire hooks. */
    @Input() CanFireHooks = false;
    /** Cap on records the clone may create; a larger plan is blocked. */
    @Input() MaxRecords = 500;

    /** Fires with the full option set whenever any control changes. */
    @Output() ScopeChanged = new EventEmitter<RecordClonePlanOptions>();

    public OnPresetChange(preset: string): void {
        this.SelectedPreset = preset || undefined;
        this.EmitScopeChanged();
    }

    public OnMaxDepthChange(depth: number | string): void {
        this.MaxDepth = typeof depth === 'string' ? parseInt(depth, 10) : depth;
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

    public OnMaxRecordsChange(records: number | string): void {
        const parsed = typeof records === 'string' ? parseInt(records, 10) : records;
        this.MaxRecords = isNaN(parsed) || parsed < 1 ? 500 : parsed;
        this.EmitScopeChanged();
    }

    public EmitScopeChanged(): void {
        this.ScopeChanged.emit({
            Preset: this.SelectedPreset,
            MaxDepth: this.MaxDepth,
            Subtypes: this.Subtypes,
            Hierarchy: this.Hierarchy,
            SoftLinks: this.SoftLinks,
            EntityActions: this.EntityActions,
            MaxRecords: this.MaxRecords,
        });
    }
}
