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
            gap: var(--mj-spacing-lg, 20px);
            padding: var(--mj-spacing-xs, 4px) 0;
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

        .required-asterisk {
            color: var(--mj-status-error-text, #dc2626);
            font-weight: 700;
        }

        .optional-label {
            font-weight: 400;
            color: var(--mj-text-muted, #94a3b8);
            font-size: var(--mj-font-size-xs, 11px);
        }

        .control-hint {
            font-size: var(--mj-font-size-xs, 11px);
            color: var(--mj-text-muted, #64748b);
        }

        .naming-hint {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            color: var(--mj-brand-primary, #2563eb);
            margin-top: 2px;
        }

        .mj-input, .mj-textarea {
            padding: var(--mj-spacing-xs, 6px) var(--mj-spacing-sm, 10px);
            border: 1px solid var(--mj-border-color, #cbd5e1);
            border-radius: var(--mj-border-radius-sm, 4px);
            background: var(--mj-bg-surface, #ffffff);
            color: var(--mj-text-primary, #1e293b);
            font-size: var(--mj-font-size-sm, 13px);
            outline: none;
            transition: border-color 0.15s ease-in-out;
            font-family: inherit;
        }

        .mj-input:focus, .mj-textarea:focus {
            border-color: var(--mj-brand-primary, #2563eb);
        }

        .root-name-input {
            font-size: var(--mj-font-size-md, 14px);
            font-weight: 500;
        }

        .section-group {
            display: flex;
            flex-direction: column;
            gap: var(--mj-spacing-sm, 8px);
            padding: var(--mj-spacing-md, 12px);
            background: var(--mj-bg-surface-soft, #f8fafc);
            border: 1px solid var(--mj-border-color, #e2e8f0);
            border-radius: var(--mj-border-radius-sm, 4px);
        }

        .section-title {
            margin: 0;
            font-size: var(--mj-font-size-sm, 13px);
            font-weight: 600;
            color: var(--mj-text-primary, #1e293b);
        }

        .section-description {
            margin: 0;
            font-size: var(--mj-font-size-xs, 12px);
            color: var(--mj-text-secondary, #64748b);
        }

        .fields-grid, .retarget-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--mj-spacing-md, 12px);
            margin-top: var(--mj-spacing-xs, 4px);
        }

        @media (max-width: 640px) {
            .fields-grid, .retarget-grid {
                grid-template-columns: 1fr;
            }
        }

        .switch-field-row {
            display: flex;
            align-items: center;
            gap: var(--mj-spacing-sm, 8px);
            padding: 4px 0;
        }

        .switch-field-label {
            font-size: var(--mj-font-size-sm, 12px);
            color: var(--mj-text-secondary, #475569);
        }

        .related-entity-tag {
            font-size: 11px;
            font-weight: 400;
            color: var(--mj-text-muted, #94a3b8);
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
    @Input() EntityName = 'Record';
    @Input() RootName = '';
    @Input() NamingStrategyReason?: string;
    @Input() PromptedFields: ClonePromptFieldItem[] = [];
    @Input() PromptedValues: Record<string, string | number | boolean | null> = {};
    @Input() RetargetFields: CloneRetargetFieldItem[] = [];
    @Input() Reason = '';

    public HasUserEditedRootName = false;

    @Output() RootNameChange = new EventEmitter<string>();
    @Output() PromptedValuesChange = new EventEmitter<Record<string, string | number | boolean | null>>();
    @Output() RetargetFieldsChange = new EventEmitter<CloneRetargetFieldItem[]>();
    @Output() ReasonChange = new EventEmitter<string>();
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

        if (!this.HasUserEditedRootName && (fieldName.toLowerCase() === 'name' || fieldName.toLowerCase() === 'email')) {
            if (typeof value === 'string' && value.trim().length > 0) {
                this.RootName = value;
                this.RootNameChange.emit(this.RootName);
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
