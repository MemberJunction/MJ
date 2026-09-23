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
            gap: var(--mj-spacing-md, 16px);
            padding: var(--mj-spacing-sm, 8px) 0;
        }

        .control-group {
            display: flex;
            flex-direction: column;
            gap: var(--mj-spacing-xs, 4px);
        }

        .control-label {
            font-size: var(--mj-font-size-sm, 12px);
            font-weight: 600;
            color: var(--mj-text-primary, #1e293b);
        }

        .control-hint {
            font-size: var(--mj-font-size-xs, 11px);
            color: var(--mj-text-muted, #64748b);
        }

        .mj-select, .mj-input {
            padding: var(--mj-spacing-xs, 6px) var(--mj-spacing-sm, 10px);
            border: 1px solid var(--mj-border-color, #cbd5e1);
            border-radius: var(--mj-border-radius-sm, 4px);
            background: var(--mj-bg-surface, #ffffff);
            color: var(--mj-text-primary, #1e293b);
            font-size: var(--mj-font-size-sm, 13px);
            outline: none;
            transition: border-color 0.15s ease-in-out;
        }

        .mj-select:focus, .mj-input:focus {
            border-color: var(--mj-brand-primary, #2563eb);
        }

        .depth-row {
            display: flex;
            align-items: center;
            gap: var(--mj-spacing-md, 16px);
        }

        .depth-slider {
            flex: 1;
            accent-color: var(--mj-brand-primary, #2563eb);
            cursor: pointer;
        }

        .depth-value {
            font-size: var(--mj-font-size-sm, 13px);
            font-weight: 600;
            min-width: 24px;
            text-align: right;
            color: var(--mj-text-primary, #1e293b);
        }

        .toggles-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--mj-spacing-md, 16px);
            padding: var(--mj-spacing-sm, 8px) 0;
        }

        @media (max-width: 640px) {
            .toggles-grid {
                grid-template-columns: 1fr;
            }
        }

        .toggle-item {
            display: flex;
            align-items: center;
            gap: var(--mj-spacing-sm, 8px);
        }

        .toggle-label {
            font-size: var(--mj-font-size-sm, 13px);
            color: var(--mj-text-primary, #1e293b);
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
    @Input() Presets: string[] = [];
    @Input() SelectedPreset?: string;
    @Input() MaxDepth = 3;
    @Input() Subtypes: 'include' | 'exclude' = 'include';
    @Input() Hierarchy: 'subtree' | 'node' = 'subtree';
    @Input() SoftLinks: 'skip' | 'include' = 'skip';
    @Input() EntityActions: 'suppress' | 'fire' = 'suppress';
    @Input() CanFireHooks = false;
    @Input() MaxRecords = 500;

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
