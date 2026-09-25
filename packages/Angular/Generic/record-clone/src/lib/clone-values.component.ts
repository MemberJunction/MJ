/**
 * @fileoverview Values configuration component for cloned records.
 *
 * Implements §12.3 & §12.4 of the Record Cloning architectural blueprint. Captures
 * the root cloned record's name (prefilled via the naming strategy), prompts for
 * required or configured field values, displays retarget pickers for foreign keys,
 * and records an optional clone justification reason.
 */

import {
    Component,
    ChangeDetectionStrategy,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJSwitchComponent } from '@memberjunction/ng-ui-components';
import type {
    ClonePromptFieldItem,
    CloneRetargetFieldItem,
} from './record-clone-types';

@Component({
    standalone: true,
    selector: 'mj-clone-values',
    template: `
        <div class="clone-values-container">
            <!-- Root Record Name -->
            <div class="control-group">
                <label class="control-label" for="root-name-input">
                    Name for Cloned {{EntityName}} <span class="required-asterisk">*</span>
                </label>
                <input
                    id="root-name-input"
                    type="text"
                    class="mj-input root-name-input"
                    placeholder="Enter record name..."
                    [value]="RootName"
                    (input)="OnRootNameInput($event)" />
                @if (NamingStrategyReason) {
                    <span class="control-hint naming-hint">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                        {{NamingStrategyReason}}
                    </span>
                }
            </div>

            <!-- Prompted Fields -->
            @if (PromptedFields && PromptedFields.length > 0) {
                <div class="section-group">
                    <h4 class="section-title">Required & Prompted Fields</h4>
                    <p class="section-description">
                        Provide or verify the following fields for the cloned record:
                    </p>

                    <div class="fields-grid">
                        @for (field of PromptedFields; track field.FieldName) {
                            <div class="control-group field-item">
                                <label class="control-label" [for]="'field-' + field.FieldName">
                                    {{field.DisplayName || field.FieldName}}
                                    @if (field.IsRequired) {
                                        <span class="required-asterisk">*</span>
                                    }
                                </label>

                                @switch (field.Type.toLowerCase()) {
                                    @case ('boolean') {
                                        <div class="switch-field-row">
                                            <mj-switch
                                                [id]="'field-' + field.FieldName"
                                                [ngModel]="!!PromptedValues[field.FieldName]"
                                                (ngModelChange)="OnFieldChange(field.FieldName, $event)">
                                            </mj-switch>
                                            <span class="switch-field-label">
                                                {{PromptedValues[field.FieldName] ? 'Yes / Enabled' : 'No / Disabled'}}
                                            </span>
                                        </div>
                                    }
                                    @case ('number') {
                                        <input
                                            [id]="'field-' + field.FieldName"
                                            type="number"
                                            class="mj-input"
                                            [value]="PromptedValues[field.FieldName] ?? ''"
                                            (input)="OnNumberFieldInput(field.FieldName, $event)" />
                                    }
                                    @case ('date') {
                                        <input
                                            [id]="'field-' + field.FieldName"
                                            type="date"
                                            class="mj-input"
                                            [value]="PromptedValues[field.FieldName] ?? ''"
                                            (input)="OnTextFieldInput(field.FieldName, $event)" />
                                    }
                                    @default {
                                        <input
                                            [id]="'field-' + field.FieldName"
                                            type="text"
                                            class="mj-input"
                                            [value]="PromptedValues[field.FieldName] ?? ''"
                                            (input)="OnTextFieldInput(field.FieldName, $event)" />
                                    }
                                }

                                @if (field.Description) {
                                    <span class="control-hint">{{field.Description}}</span>
                                }
                            </div>
                        }
                    </div>
                </div>
            }

            <!-- Retarget Foreign Keys -->
            @if (RetargetFields && RetargetFields.length > 0) {
                <div class="section-group">
                    <h4 class="section-title">Retarget Relationships</h4>
                    <p class="section-description">
                        Redirect parent or foreign key references for the cloned record:
                    </p>

                    <div class="retarget-grid">
                        @for (item of RetargetFields; track item.FieldName) {
                            <div class="control-group retarget-item">
                                <label class="control-label" [for]="'retarget-' + item.FieldName">
                                    {{item.DisplayName || item.FieldName}}
                                    <span class="related-entity-tag">({{item.RelatedEntity}})</span>
                                </label>
                                <div class="retarget-input-wrapper">
                                    <input
                                        [id]="'retarget-' + item.FieldName"
                                        type="text"
                                        class="mj-input"
                                        placeholder="Target record ID or key..."
                                        [value]="item.NewValue || item.CurrentValue || ''"
                                        (input)="OnRetargetInput(item, $event)" />
                                </div>
                                @if (item.CurrentDisplayName) {
                                    <span class="control-hint">
                                        Current: {{item.CurrentDisplayName}}
                                    </span>
                                }
                            </div>
                        }
                    </div>
                </div>
            }

            <!-- Clone Reason -->
            <div class="control-group reason-group">
                <label class="control-label" for="clone-reason-input">
                    Reason for Cloning <span class="optional-label">(Optional)</span>
                </label>
                <textarea
                    id="clone-reason-input"
                    rows="2"
                    class="mj-textarea"
                    placeholder="Briefly describe the business reason or project context for this clone..."
                    [value]="Reason"
                    (input)="OnReasonInput($event)">
                </textarea>
                <span class="control-hint">Recorded in the clone audit log for traceability.</span>
            </div>
        </div>
    `,
    styles: [`
        .clone-values-container {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-5);
            padding: var(--mj-space-1) 0;
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

        .required-asterisk {
            color: var(--mj-status-error-text);
            font-weight: 700;
        }

        .optional-label {
            font-weight: 400;
            color: var(--mj-text-muted);
            font-size: var(--mj-text-xs);
        }

        .control-hint {
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
        }

        .naming-hint {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            color: var(--mj-brand-primary);
            margin-top: 2px;
        }

        .mj-input, .mj-textarea {
            padding: var(--mj-space-1-5) var(--mj-space-2-5);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-sm);
            background: var(--mj-bg-surface);
            color: var(--mj-text-primary);
            font-size: var(--mj-text-sm);
            outline: none;
            transition: border-color 0.15s ease-in-out;
            font-family: inherit;
        }

        .mj-input:focus, .mj-textarea:focus {
            border-color: var(--mj-brand-primary);
        }

        .root-name-input {
            font-size: var(--mj-text-sm);
            font-weight: 500;
        }

        .section-group {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-2);
            padding: var(--mj-space-3);
            background: var(--mj-bg-surface-card);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-sm);
        }

        .section-title {
            margin: 0;
            font-size: var(--mj-text-sm);
            font-weight: 600;
            color: var(--mj-text-primary);
        }

        .section-description {
            margin: 0;
            font-size: var(--mj-text-xs);
            color: var(--mj-text-secondary);
        }

        .fields-grid, .retarget-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--mj-space-3);
            margin-top: var(--mj-space-1);
        }

        @media (max-width: 640px) {
            .fields-grid, .retarget-grid {
                grid-template-columns: 1fr;
            }
        }

        .switch-field-row {
            display: flex;
            align-items: center;
            gap: var(--mj-space-2);
            padding: 4px 0;
        }

        .switch-field-label {
            font-size: var(--mj-text-xs);
            color: var(--mj-text-secondary);
        }

        .related-entity-tag {
            font-size: 11px;
            font-weight: 400;
            color: var(--mj-text-muted);
        }

        .mj-textarea {
            resize: vertical;
            min-height: 52px;
        }
    `],
    imports: [
        CommonModule,
        FormsModule,
        MJSwitchComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloneValuesComponent implements OnInit, OnChanges {
    /** Entity being cloned; used in labels. */
    @Input() EntityName = 'Record';
    /** Name the clone will get. Pre-filled from the naming strategy; editable. */
    @Input() RootName = '';
    /** Why the suggested name was chosen (e.g. the source name already exists). */
    @Input() NamingStrategyReason?: string;
    /** Fields the entity's `Clone.Fields.PromptFor` requires the user to fill. */
    @Input() PromptedFields: ClonePromptFieldItem[] = [];
    /** Current values for the prompted fields, keyed by field name. */
    @Input() PromptedValues: Record<string, string | number | boolean | null> = {};
    /** Foreign keys from `Clone.UI.RetargetFields` the user may point at a different record. */
    @Input() RetargetFields: CloneRetargetFieldItem[] = [];
    /** Free-text reason stored on the clone log. */
    @Input() Reason = '';

    public HasUserEditedRootName = false;

    /** Fires as the user edits the clone's name. */
    @Output() RootNameChange = new EventEmitter<string>();
    /** Fires with the full value map whenever a prompted field changes. */
    @Output() PromptedValuesChange = new EventEmitter<Record<string, string | number | boolean | null>>();
    /** Fires when a retarget picker changes. */
    @Output() RetargetFieldsChange = new EventEmitter<CloneRetargetFieldItem[]>();
    /** Fires as the user edits the reason. */
    @Output() ReasonChange = new EventEmitter<string>();
    /** Fires when the step becomes valid or invalid (every required prompted field filled). */
    @Output() ValidityChange = new EventEmitter<boolean>();

    public ngOnInit(): void {
        this.CheckValidity();
    }

    public ngOnChanges(): void {
        this.CheckValidity();
    }

    public OnRootNameInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.HasUserEditedRootName = true;
        this.OnRootNameChange(input.value);
    }

    public OnRootNameChange(name: string): void {
        this.RootName = name;
        this.RootNameChange.emit(name);
        this.CheckValidity();
    }

    public OnTextFieldInput(fieldName: string, event: Event): void {
        const input = event.target as HTMLInputElement;
        this.OnFieldChange(fieldName, input.value);
    }

    public OnNumberFieldInput(fieldName: string, event: Event): void {
        const input = event.target as HTMLInputElement;
        const val = input.value === '' ? null : parseFloat(input.value);
        this.OnFieldChange(fieldName, val);
    }

    public OnFieldChange(fieldName: string, value: string | number | boolean | null): void {
        this.PromptedValues = {
            ...this.PromptedValues,
            [fieldName]: value,
        };
        this.PromptedValuesChange.emit(this.PromptedValues);

        // Mirror a naming field into the name box for display only. RootNameChange means the user
        // typed a name (the host then sends it as an override); the host mirrors prompted values itself.
        if (!this.HasUserEditedRootName && (fieldName.toLowerCase() === 'name' || fieldName.toLowerCase() === 'email')) {
            if (typeof value === 'string' && value.trim().length > 0) {
                this.RootName = value;
            }
        }

        this.CheckValidity();
    }

    public OnRetargetInput(item: CloneRetargetFieldItem, event: Event): void {
        const input = event.target as HTMLInputElement;
        this.OnRetargetFieldChange(item, input.value);
    }

    public OnRetargetFieldChange(item: CloneRetargetFieldItem, newValue: string): void {
        item.NewValue = newValue;
        this.RetargetFieldsChange.emit([...this.RetargetFields]);
        this.CheckValidity();
    }

    public OnReasonInput(event: Event): void {
        const textarea = event.target as HTMLTextAreaElement;
        this.OnReasonChange(textarea.value);
    }

    public OnReasonChange(reason: string): void {
        this.Reason = reason;
        this.ReasonChange.emit(reason);
    }

    public CheckValidity(): void {
        const isRootNameValid = this.RootName.trim().length > 0;
        let arePromptedFieldsValid = true;

        if (this.PromptedFields && this.PromptedFields.length > 0) {
            for (const field of this.PromptedFields) {
                if (field.IsRequired) {
                    const val = this.PromptedValues[field.FieldName];
                    if (val === null || val === undefined || (typeof val === 'string' && val.trim().length === 0)) {
                        arePromptedFieldsValid = false;
                        break;
                    }
                }
            }
        }

        const isValid = isRootNameValid && arePromptedFieldsValid;
        this.ValidityChange.emit(isValid);
    }
}
