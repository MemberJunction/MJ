/**
 * Public API Surface for @memberjunction/ng-forms
 *
 * Generic dynamic form rendering from JSON schemas. Renders structured forms
 * with 14+ field types, built-in validation, responsive layout, and intelligent
 * field sizing. Schema types are defined in `@memberjunction/ai-core-plus`.
 *
 * ## Quick Start
 *
 * 1. Import the module:
 *    ```typescript
 *    import { DynamicFormsModule } from '@memberjunction/ng-forms';
 *    ```
 *
 * 2. Add to your NgModule imports:
 *    ```typescript
 *    @NgModule({ imports: [DynamicFormsModule] })
 *    ```
 *
 * 3. Use in your template:
 *    ```html
 *    <mj-dynamic-form
 *      [FormDefinition]="formSchema"
 *      (FormSubmitted)="onSubmit($event)">
 *    </mj-dynamic-form>
 *    ```
 *
 * ## Components
 *
 * - **`<mj-dynamic-form>`** — Full form container: title bar, description,
 *   questions, validation, and submit/choice buttons.
 * - **`<mj-dynamic-form-field>`** — Individual field renderer with
 *   `ControlValueAccessor` for use inside your own reactive forms.
 *
 * ## Supported Field Types
 *
 * text, textarea, email, number, currency, date, datetime, time,
 * daterange, buttongroup, radio, dropdown, checkbox, slider
 *
 * ## Schema Types (from @memberjunction/ai-core-plus)
 *
 * - `AgentResponseForm` — Top-level form definition
 * - `FormQuestion` — Individual field definition
 * - `FormQuestionType` — Union of all field type configurations
 * - `FormOption` — Option in a choice field
 */

// Module
export * from './lib/forms.module';

// Components
export * from './lib/dynamic-form/dynamic-form.component';
export * from './lib/dynamic-form-field/dynamic-form-field.component';
