/**
 * @fileoverview MJ Dynamic Forms Module
 *
 * Provides reusable dynamic form components that render structured forms from
 * `AgentResponseForm` JSON schemas. Supports 14+ input types with built-in
 * validation, responsive layout, and intelligent field sizing.
 *
 * ## Usage
 *
 * Import `DynamicFormsModule` into your feature module:
 *
 * ```typescript
 * import { DynamicFormsModule } from '@memberjunction/ng-forms';
 *
 * @NgModule({
 *   imports: [DynamicFormsModule]
 * })
 * export class MyFeatureModule { }
 * ```
 *
 * Then use in templates:
 *
 * ```html
 * <mj-dynamic-form
 *   [FormDefinition]="myFormSchema"
 *   [Disabled]="isSaving"
 *   (FormSubmitted)="onSubmit($event)">
 * </mj-dynamic-form>
 * ```
 *
 * Or use the field component individually within your own reactive forms:
 *
 * ```html
 * <mj-dynamic-form-field
 *   [Question]="question"
 *   [Control]="myFormGroup.get(question.id)"
 *   [formControlName]="question.id">
 * </mj-dynamic-form-field>
 * ```
 *
 * @module @memberjunction/ng-forms
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Kendo UI modules
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';

// Components
import { DynamicFormComponent } from './dynamic-form/dynamic-form.component';
import { DynamicFormFieldComponent } from './dynamic-form-field/dynamic-form-field.component';

@NgModule({
    declarations: [
        DynamicFormComponent,
        DynamicFormFieldComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        ButtonsModule,
        InputsModule,
        DateInputsModule
    ],
    exports: [
        DynamicFormComponent,
        DynamicFormFieldComponent
    ]
})
export class DynamicFormsModule { }
