/**
 * @fileoverview Dynamic Form Response Component
 *
 * Read-only companion to `DynamicFormComponent`. Renders a submitted form
 * response as a styled pill (single field) or card (multiple fields) with
 * type-aware value formatting.
 *
 * Accepts two input modes:
 * - **Schema + ResponseData**: Pass the original `AgentResponseForm` schema
 *   plus the JSON response data to get full labels and type-aware formatting.
 * - **ResponseData only**: Pass just the JSON response data for a simpler
 *   key/value display when the schema is unavailable.
 *
 * @example With schema
 * ```html
 * <mj-dynamic-form-response
 *   [FormDefinition]="responseForm"
 *   [ResponseData]="responseDataJson">
 * </mj-dynamic-form-response>
 * ```
 *
 * @example Without schema
 * ```html
 * <mj-dynamic-form-response
 *   [ResponseData]="responseDataJson">
 * </mj-dynamic-form-response>
 * ```
 *
 * @module @memberjunction/ng-forms
 */

import { Component, Input } from '@angular/core';
import { AgentResponseForm, FormQuestion } from '@memberjunction/ai-core-plus';
import { FormResponseField, FormResponseUtils } from './form-response-utils';

@Component({
    standalone: false,
    selector: 'mj-dynamic-form-response',
    templateUrl: './dynamic-form-response.component.html',
    styleUrls: ['./dynamic-form-response.component.css']
})
export class DynamicFormResponseComponent {
    /**
     * Optional form schema for resolving labels, types, and display values.
     * When provided, enables type-aware formatting and option label resolution.
     */
    @Input() FormDefinition: AgentResponseForm | null = null;

    /**
     * The response data as a JSON string or pre-parsed object.
     * Keys are question IDs, values are the user's responses.
     */
    @Input() ResponseData: string | Record<string, unknown> | null = null;

    /**
     * Optional title override. Falls back to FormDefinition.title, then 'Form Response'.
     */
    @Input() Title: string | null = null;

    /**
     * Display mode: 'pill' for inline badge style, 'card' for block card style,
     * 'auto' to choose based on field count (default).
     */
    @Input() DisplayMode: 'pill' | 'card' | 'auto' = 'auto';

    /** Resolved fields ready for display */
    public get Fields(): FormResponseField[] {
        const data = this.parsedResponseData;
        if (!data) return [];

        const entries = Object.entries(data).filter(
            ([, value]) => value != null && value !== '' && !(Array.isArray(value) && value.length === 0)
        );

        return entries.map(([key, value]) => this.resolveField(key, value));
    }

    /** Whether this displays as a single-field inline pill */
    public get IsSingleField(): boolean {
        if (this.DisplayMode === 'card') return false;
        if (this.DisplayMode === 'pill') return true;
        return this.Fields.length === 1;
    }

    /** Whether there is any data to display */
    public get HasData(): boolean {
        return this.Fields.length > 0;
    }

    /** Resolved title for multi-field display */
    public get ResolvedTitle(): string {
        return this.Title || this.FormDefinition?.title || 'Form Response';
    }

    /** Parse the ResponseData input into a plain object */
    private get parsedResponseData(): Record<string, unknown> | null {
        if (!this.ResponseData) return null;
        if (typeof this.ResponseData === 'object') return this.ResponseData;
        try {
            return JSON.parse(this.ResponseData) as Record<string, unknown>;
        } catch {
            return null;
        }
    }

    /** Resolve a single key/value pair into a display-ready field */
    private resolveField(key: string, value: unknown): FormResponseField {
        const question = this.findQuestion(key);
        const type = question ? FormResponseUtils.GetQuestionTypeString(question) : null;
        const displayValue = FormResponseUtils.FormatValue(value, question, type);

        return {
            key,
            label: question?.label || FormResponseUtils.HumanizeKey(key),
            value,
            displayValue,
            type
        };
    }

    /** Find the matching question in the schema */
    private findQuestion(id: string): FormQuestion | null {
        if (!this.FormDefinition) return null;
        return this.FormDefinition.questions.find(q => q.id === id) || null;
    }

    /** Track-by function for fields */
    public TrackByKey(_index: number, field: FormResponseField): string {
        return field.key;
    }
}
