/**
 * @fileoverview Shared utilities for formatting form response values.
 *
 * Used by both `DynamicFormResponseComponent` (Angular component rendering)
 * and the conversations package (inline HTML rendering via markdown).
 *
 * @module @memberjunction/ng-forms
 */

import { FormQuestion, FormOption } from '@memberjunction/ai-core-plus';

/**
 * Represents a resolved form response field ready for display.
 */
export interface FormResponseField {
    /** Question ID or key name */
    key: string;
    /** Human-readable label */
    label: string;
    /** Raw value from the response */
    value: unknown;
    /** Display-friendly formatted value */
    displayValue: string;
    /** Field type from the schema (for type-aware formatting) */
    type: string | null;
}

/**
 * Static utility class for form response value formatting and resolution.
 *
 * Provides type-aware formatting for all supported field types:
 * date, datetime, time, daterange, slider, buttongroup, radio, dropdown, checkbox.
 */
export class FormResponseUtils {
    /**
     * Format a value for display, using schema info when available.
     * Resolves choice labels and applies type-specific formatting.
     */
    static FormatValue(value: unknown, question: FormQuestion | null, type: string | null): string {
        if (value == null) return '';

        // For choice types, resolve the option label
        if (question && type && ['buttongroup', 'radio', 'dropdown', 'checkbox'].includes(type)) {
            const optionLabel = FormResponseUtils.ResolveOptionLabel(question, value);
            if (optionLabel) return optionLabel;
        }

        const stringValue = String(value);

        switch (type) {
            case 'date':
                return FormResponseUtils.FormatDate(stringValue, false);
            case 'datetime':
                return FormResponseUtils.FormatDate(stringValue, true);
            case 'time':
                return FormResponseUtils.FormatTime(stringValue);
            case 'daterange':
                return FormResponseUtils.FormatDateRange(value);
            default:
                // Auto-detect ISO dates for backward compatibility
                if (stringValue.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                    const date = new Date(stringValue);
                    const hasMidnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
                    return FormResponseUtils.FormatDate(stringValue, !hasMidnight);
                }
                return stringValue;
        }
    }

    /**
     * Resolve a raw value to its display label from form options.
     */
    static ResolveOptionLabel(question: FormQuestion, value: unknown): string | null {
        if (typeof question.type !== 'object' || !('options' in question.type)) return null;
        const options = question.type.options as FormOption[];
        const match = options.find(o => String(o.value) === String(value));
        return match ? match.label : null;
    }

    /**
     * Format a date string for display.
     * @param value ISO date string
     * @param includeTime Whether to include time in the output
     */
    static FormatDate(value: string, includeTime: boolean): string {
        try {
            const date = new Date(value);
            if (isNaN(date.getTime())) return value;

            if (includeTime) {
                return date.toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true
                });
            }
            return date.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
            });
        } catch {
            return value;
        }
    }

    /**
     * Format a time string (HH:mm or HH:mm:ss) for display.
     */
    static FormatTime(value: string): string {
        try {
            const [hours, minutes] = value.split(':').map(Number);
            const date = new Date();
            date.setHours(hours, minutes, 0);
            return date.toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', hour12: true
            });
        } catch {
            return value;
        }
    }

    /**
     * Format a date range object for display.
     * @param value Object with `start` and `end` date strings, or any fallback value
     */
    static FormatDateRange(value: unknown): string {
        if (typeof value === 'object' && value !== null && 'start' in value && 'end' in value) {
            const rangeValue = value as { start: string; end: string };
            const start = FormResponseUtils.FormatDate(rangeValue.start, false);
            const end = FormResponseUtils.FormatDate(rangeValue.end, false);
            return `${start} to ${end}`;
        }
        return JSON.stringify(value);
    }

    /**
     * Convert a camelCase/snake_case key to a human-readable label.
     */
    static HumanizeKey(key: string): string {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/[_-]/g, ' ')
            .replace(/^\s+/, '')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    /**
     * Escape HTML special characters to prevent XSS.
     */
    static EscapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Format a value for display with HTML escaping applied.
     * Convenience wrapper combining FormatValue + EscapeHtml.
     */
    static FormatValueHtml(value: unknown, question: FormQuestion | null, type: string | null): string {
        return FormResponseUtils.EscapeHtml(FormResponseUtils.FormatValue(value, question, type));
    }

    /**
     * Get the type string from a FormQuestion.
     */
    static GetQuestionTypeString(question: FormQuestion): string {
        return typeof question.type === 'string' ? question.type : question.type.type;
    }
}
