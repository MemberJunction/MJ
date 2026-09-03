/**
 * Human-readable description of a CompositeFilterDescriptor.
 * Used by the filter-builder accordion and by compact grids (e.g. product prices).
 * No Angular dependency — HTML is a string the host sanitizes if needed.
 */
import {
    isCompositeFilter,
    parseFilterField,
    type CompositeFilterDescriptor,
    type FilterDescriptor,
    type FilterOperator,
} from './filter.types';

export interface FilterSummaryField {
    /** Stored field (`Type` or `BillToOrganization.Type`). */
    name: string;
    displayName: string;
}

export interface FilterSummaryOptions {
    fields?: FilterSummaryField[];
    /** Lookup source key → label (`BillToOrganization` → `Bill-to organization`). */
    sourceLabels?: Record<string, string>;
}

const OPERATOR_LABELS: Record<string, string> = {
    eq: 'equals',
    neq: 'does not equal',
    contains: 'contains',
    doesnotcontain: 'does not contain',
    startswith: 'starts with',
    endswith: 'ends with',
    isnull: 'is empty',
    isnotnull: 'is not empty',
    isempty: 'is empty',
    isnotempty: 'is not empty',
    gt: 'is greater than',
    gte: 'is greater than or equal to',
    lt: 'is less than',
    lte: 'is less than or equal to',
};

const HTML_STYLES = {
    fieldName: 'color: #0369a1; font-weight: 600;',
    operator: 'color: #6b7280; font-style: italic;',
    valueString: 'color: #059669; font-weight: 500;',
    valueNumber: 'color: #7c3aed; font-weight: 500;',
    valueDate: 'color: #c2410c; font-weight: 500;',
    valueTrue: 'color: #16a34a; font-weight: 600;',
    valueFalse: 'color: #dc2626; font-weight: 600;',
    logicAnd:
        'display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; background: #dbeafe; color: #1d4ed8;',
    logicOr:
        'display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; background: #fef3c7; color: #b45309;',
    groupBracket: 'color: #9333ea; font-weight: 700; font-size: 15px;',
    source: 'color: #7c3aed; font-weight: 600;',
};

export class FilterSummary {
    constructor(private readonly options: FilterSummaryOptions = {}) {}

    /** Compact one-liner for a grid cell. Empty filter → empty string. */
    public text(filter: CompositeFilterDescriptor | null | undefined): string {
        if (!filter || !filter.filters?.length) return '';
        return this.buildText(filter);
    }

    /** Indented HTML with the same highlighting the filter-builder accordion uses. */
    public html(filter: CompositeFilterDescriptor | null | undefined): string {
        if (!filter || !filter.filters?.length) {
            return '<span style="color: #9ca3af; font-style: italic;">No filters applied</span>';
        }
        return this.buildHtml(filter, 0);
    }

    private buildText(filter: CompositeFilterDescriptor): string {
        const parts: string[] = [];
        for (const item of filter.filters || []) {
            if (isCompositeFilter(item)) {
                const inner = this.buildText(item);
                if (inner) parts.push(`(${inner})`);
            } else {
                const rule = this.ruleText(item);
                if (rule) parts.push(rule);
            }
        }
        const join = filter.logic === 'or' ? ' OR ' : ' AND ';
        return parts.join(join);
    }

    private buildHtml(filter: CompositeFilterDescriptor, depth: number): string {
        const parts: string[] = [];
        const indent = '  '.repeat(depth);
        for (const item of filter.filters || []) {
            if (isCompositeFilter(item)) {
                const inner = this.buildHtml(item, depth + 1);
                if (inner) {
                    parts.push(
                        `<span style="${HTML_STYLES.groupBracket}">(</span>\n${inner}\n${indent}<span style="${HTML_STYLES.groupBracket}">)</span>`,
                    );
                }
            } else {
                const rule = this.ruleHtml(item);
                if (rule) parts.push(rule);
            }
        }
        if (parts.length === 0) return '';
        const logicStyle = filter.logic === 'and' ? HTML_STYLES.logicAnd : HTML_STYLES.logicOr;
        const logicLabel = filter.logic === 'and' ? 'AND' : 'OR';
        const connector = `\n${indent}<span style="${logicStyle}">${logicLabel}</span>\n${indent}`;
        return `${indent}${parts.join(connector)}`;
    }

    private ruleText(rule: FilterDescriptor): string {
        if (!rule.field) return '';
        const label = this.fieldLabel(rule.field);
        const op = OPERATOR_LABELS[rule.operator] || rule.operator;
        if (this.isNullOp(rule.operator)) return `${label} ${op}`;
        return `${label} ${op} ${this.valueText(rule.value)}`;
    }

    private ruleHtml(rule: FilterDescriptor): string {
        if (!rule.field) return '';
        const { source, name } = parseFilterField(rule.field);
        const fieldLabel = this.bareFieldLabel(rule.field, name);
        const sourceLabel = source ? this.sourceLabel(source) : null;
        const fieldHtml = sourceLabel
            ? `<span style="${HTML_STYLES.source}">${escapeHtml(sourceLabel)}</span> <span style="${HTML_STYLES.fieldName}">${escapeHtml(fieldLabel)}</span>`
            : `<span style="${HTML_STYLES.fieldName}">${escapeHtml(fieldLabel)}</span>`;
        const operatorHtml = `<span style="${HTML_STYLES.operator}">${escapeHtml(OPERATOR_LABELS[rule.operator] || rule.operator)}</span>`;
        if (this.isNullOp(rule.operator)) return `${fieldHtml} ${operatorHtml}`;
        return `${fieldHtml} ${operatorHtml} ${this.valueHtml(rule.value)}`;
    }

    private fieldLabel(stored: string): string {
        const { source, name } = parseFilterField(stored);
        const bare = this.bareFieldLabel(stored, name);
        if (!source) return bare;
        return `${this.sourceLabel(source)} ${bare}`;
    }

    private bareFieldLabel(stored: string, name: string): string {
        const hit = this.options.fields?.find((f) => f.name === stored || f.name === name);
        return hit?.displayName || name;
    }

    private sourceLabel(source: string): string {
        return this.options.sourceLabels?.[source] || source;
    }

    private isNullOp(op: FilterOperator | string): boolean {
        return ['isnull', 'isnotnull', 'isempty', 'isnotempty'].includes(op);
    }

    private valueText(value: unknown): string {
        if (value == null) return '';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value);
    }

    private valueHtml(value: unknown): string {
        if (value == null) return '';
        if (typeof value === 'boolean') {
            const style = value ? HTML_STYLES.valueTrue : HTML_STYLES.valueFalse;
            return `<span style="${style}">${value ? 'true' : 'false'}</span>`;
        }
        if (typeof value === 'number') {
            return `<span style="${HTML_STYLES.valueNumber}">${value}</span>`;
        }
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
            const d = new Date(value);
            if (!Number.isNaN(d.getTime())) {
                const formatted = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                return `<span style="${HTML_STYLES.valueDate}">${escapeHtml(formatted)}</span>`;
            }
        }
        return `<span style="${HTML_STYLES.valueString}">"${escapeHtml(String(value))}"</span>`;
    }
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
