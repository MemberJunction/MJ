/**
 * OOP wrapper around {@link CompositeFilterDescriptor}.
 *
 * The descriptor stays the portable JSON (Kendo / User Views). This class is how you
 * construct, evaluate, and summarize that JSON. Views still compile to SQL via
 * `GenerateWhereClause`; `Evaluate` is for prices, processes, and anything that is
 * not a single-table WHERE.
 *
 * Context is a bag of records keyed by source (`BillToOrganization`, `Order`, …).
 * Bare field names (no dot) read from `context['']` so single-entity callers can pass `{ '': row }`.
 */
import {
    FormatFilterField,
    IsCompositeFilter,
    IsSimpleFilter,
    ParseFilterField,
    type CompositeFilterDescriptor,
    type FilterDescriptor,
    type FilterLogic,
    type FilterOperator,
} from './filter.types';

export type FilterEvalContext = Record<string, Record<string, unknown> | null | undefined>;

export interface FilterSummaryField {
    /** Stored field (`Type` or `BillToOrganization.Type`). */
    Name: string;
    DisplayName: string;
}

export interface FilterSummaryOptions {
    Fields?: FilterSummaryField[];
    /** Lookup source key → label (`BillToOrganization` → `Bill-to organization`). */
    SourceLabels?: Record<string, string>;
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

export class CompositeFilter {
    private descriptor: CompositeFilterDescriptor;

    /**
     * Empty AND group, or wrap an existing descriptor / single rule.
     * Prefer {@link FromJSON} / {@link FromDescriptor} at call sites that already have payload.
     */
    constructor(source?: CompositeFilterDescriptor | FilterDescriptor | null) {
        this.descriptor = CompositeFilter.normalize(source);
    }

    public static FromJSON(json: string | object | null | undefined): CompositeFilter {
        if (json == null || json === '') return new CompositeFilter();
        const parsed = typeof json === 'string' ? JSON.parse(json) : json;
        return new CompositeFilter(parsed as CompositeFilterDescriptor | FilterDescriptor);
    }

    public static FromDescriptor(
        descriptor: CompositeFilterDescriptor | FilterDescriptor | null | undefined,
    ): CompositeFilter {
        return new CompositeFilter(descriptor);
    }

    public static IsCompositeFilter = IsCompositeFilter;
    public static IsSimpleFilter = IsSimpleFilter;
    public static ParseFilterField = ParseFilterField;
    public static FormatFilterField = FormatFilterField;

    public get Logic(): FilterLogic {
        return this.descriptor.logic;
    }
    public set Logic(value: FilterLogic) {
        this.descriptor.logic = value;
    }

    public get Filters(): (FilterDescriptor | CompositeFilterDescriptor)[] {
        return this.descriptor.filters;
    }

    /** Append a rule, a nested descriptor, or another CompositeFilter. */
    public Add(item: FilterDescriptor | CompositeFilterDescriptor | CompositeFilter): this {
        this.descriptor.filters.push(item instanceof CompositeFilter ? item.ToDescriptor() : item);
        return this;
    }

    public ToDescriptor(): CompositeFilterDescriptor {
        return JSON.parse(JSON.stringify(this.descriptor)) as CompositeFilterDescriptor;
    }

    public ToJSON(): string {
        return JSON.stringify(this.descriptor);
    }

    /**
     * In-memory evaluation against a bag of records keyed by source.
     * Empty filters are true (no restriction). Missing source → undefined
     * (false unless the operator is empty/null).
     */
    public Evaluate(context: FilterEvalContext): boolean {
        return CompositeFilter.evaluateNode(this.descriptor, context ?? {});
    }

    /** Compact one-liner for a grid cell. Empty filter → empty string. */
    public SummaryText(options?: FilterSummaryOptions): string {
        if (!this.descriptor.filters?.length) return '';
        return this.buildText(this.descriptor, options ?? {});
    }

    /** Indented HTML with the same highlighting the filter-builder accordion uses. */
    public SummaryHTML(options?: FilterSummaryOptions): string {
        if (!this.descriptor.filters?.length) {
            return '<span style="color: #9ca3af; font-style: italic;">No filters applied</span>';
        }
        return this.buildHtml(this.descriptor, 0, options ?? {});
    }

    public GetSummary(options?: FilterSummaryOptions): { Text: string; HTML: string } {
        return { Text: this.SummaryText(options), HTML: this.SummaryHTML(options) };
    }

    private static normalize(
        source?: CompositeFilterDescriptor | FilterDescriptor | null,
    ): CompositeFilterDescriptor {
        if (source == null) return { logic: 'and', filters: [] };
        if (IsCompositeFilter(source)) {
            return {
                logic: source.logic ?? 'and',
                filters: [...(source.filters ?? [])],
            };
        }
        if (IsSimpleFilter(source)) {
            return { logic: 'and', filters: [source] };
        }
        return { logic: 'and', filters: [] };
    }

    private static evaluateNode(
        filter: CompositeFilterDescriptor | FilterDescriptor | null | undefined,
        context: FilterEvalContext,
    ): boolean {
        if (!filter) return true;
        if (IsCompositeFilter(filter)) {
            const parts = (filter.filters ?? []).filter((f) => f != null);
            if (parts.length === 0) return true;
            if (filter.logic === 'or') {
                return parts.some((p) => CompositeFilter.evaluateNode(p, context));
            }
            return parts.every((p) => CompositeFilter.evaluateNode(p, context));
        }
        return CompositeFilter.evaluateRule(filter, context);
    }

    private static evaluateRule(rule: FilterDescriptor, context: FilterEvalContext): boolean {
        if (!rule?.field) return true;
        const actual = CompositeFilter.readValue(context, rule.field);
        return CompositeFilter.compare(actual, rule.operator, rule.value);
    }

    private static readValue(context: FilterEvalContext, field: string): unknown {
        const { Source, Name } = ParseFilterField(field);
        const rec = context[Source ?? ''];
        if (rec == null) return undefined;
        if (Name.includes('.')) {
            return Name.split('.').reduce<unknown>((acc, part) => {
                if (acc == null || typeof acc !== 'object') return undefined;
                return (acc as Record<string, unknown>)[part];
            }, rec);
        }
        return rec[Name];
    }

    private static compare(actual: unknown, operator: FilterOperator, expected: unknown): boolean {
        switch (operator) {
            case 'isnull':
            case 'isempty':
                return actual == null || actual === '';
            case 'isnotnull':
            case 'isnotempty':
                return actual != null && actual !== '';
            case 'eq':
                return CompositeFilter.equals(actual, expected);
            case 'neq':
                return !CompositeFilter.equals(actual, expected);
            case 'gt':
                return CompositeFilter.num(actual) > CompositeFilter.num(expected);
            case 'gte':
                return CompositeFilter.num(actual) >= CompositeFilter.num(expected);
            case 'lt':
                return CompositeFilter.num(actual) < CompositeFilter.num(expected);
            case 'lte':
                return CompositeFilter.num(actual) <= CompositeFilter.num(expected);
            case 'contains':
                return CompositeFilter.str(actual).includes(CompositeFilter.str(expected));
            case 'doesnotcontain':
                return !CompositeFilter.str(actual).includes(CompositeFilter.str(expected));
            case 'startswith':
                return CompositeFilter.str(actual).startsWith(CompositeFilter.str(expected));
            case 'endswith':
                return CompositeFilter.str(actual).endsWith(CompositeFilter.str(expected));
            default:
                return false;
        }
    }

    private static equals(a: unknown, b: unknown): boolean {
        if (a == null && b == null) return true;
        if (typeof a === 'boolean' || typeof b === 'boolean') {
            return Boolean(a) === Boolean(b === true || b === 'true' || b === 1 || b === '1');
        }
        if (typeof a === 'number' || typeof b === 'number') {
            return CompositeFilter.num(a) === CompositeFilter.num(b);
        }
        return CompositeFilter.str(a) === CompositeFilter.str(b);
    }

    private static str(v: unknown): string {
        if (v == null) return '';
        return String(v).toLowerCase();
    }

    private static num(v: unknown): number {
        if (v instanceof Date) return v.getTime();
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : NaN;
    }

    private buildText(filter: CompositeFilterDescriptor, options: FilterSummaryOptions): string {
        const parts: string[] = [];
        for (const item of filter.filters || []) {
            if (IsCompositeFilter(item)) {
                const inner = this.buildText(item, options);
                if (inner) parts.push(`(${inner})`);
            } else {
                const rule = this.ruleText(item, options);
                if (rule) parts.push(rule);
            }
        }
        const join = filter.logic === 'or' ? ' OR ' : ' AND ';
        return parts.join(join);
    }

    private buildHtml(filter: CompositeFilterDescriptor, depth: number, options: FilterSummaryOptions): string {
        const parts: string[] = [];
        const indent = '  '.repeat(depth);
        for (const item of filter.filters || []) {
            if (IsCompositeFilter(item)) {
                const inner = this.buildHtml(item, depth + 1, options);
                if (inner) {
                    parts.push(
                        `<span style="${HTML_STYLES.groupBracket}">(</span>\n${inner}\n${indent}<span style="${HTML_STYLES.groupBracket}">)</span>`,
                    );
                }
            } else {
                const rule = this.ruleHtml(item, options);
                if (rule) parts.push(rule);
            }
        }
        if (parts.length === 0) return '';
        const logicStyle = filter.logic === 'and' ? HTML_STYLES.logicAnd : HTML_STYLES.logicOr;
        const logicLabel = filter.logic === 'and' ? 'AND' : 'OR';
        const connector = `\n${indent}<span style="${logicStyle}">${logicLabel}</span>\n${indent}`;
        return `${indent}${parts.join(connector)}`;
    }

    private ruleText(rule: FilterDescriptor, options: FilterSummaryOptions): string {
        if (!rule.field) return '';
        const label = this.fieldLabel(rule.field, options);
        const op = OPERATOR_LABELS[rule.operator] || rule.operator;
        if (this.isNullOp(rule.operator)) return `${label} ${op}`;
        return `${label} ${op} ${this.valueText(rule.value)}`;
    }

    private ruleHtml(rule: FilterDescriptor, options: FilterSummaryOptions): string {
        if (!rule.field) return '';
        const { Source, Name } = ParseFilterField(rule.field);
        const fieldLabel = this.bareFieldLabel(rule.field, Name, options);
        const sourceLabel = Source ? this.sourceLabel(Source, options) : null;
        const fieldHtml = sourceLabel
            ? `<span style="${HTML_STYLES.source}">${EscapeHtml(sourceLabel)}</span> <span style="${HTML_STYLES.fieldName}">${EscapeHtml(fieldLabel)}</span>`
            : `<span style="${HTML_STYLES.fieldName}">${EscapeHtml(fieldLabel)}</span>`;
        const operatorHtml = `<span style="${HTML_STYLES.operator}">${EscapeHtml(OPERATOR_LABELS[rule.operator] || rule.operator)}</span>`;
        if (this.isNullOp(rule.operator)) return `${fieldHtml} ${operatorHtml}`;
        return `${fieldHtml} ${operatorHtml} ${this.valueHtml(rule.value)}`;
    }

    private fieldLabel(stored: string, options: FilterSummaryOptions): string {
        const { Source, Name } = ParseFilterField(stored);
        const bare = this.bareFieldLabel(stored, Name, options);
        if (!Source) return bare;
        return `${this.sourceLabel(Source, options)} ${bare}`;
    }

    private bareFieldLabel(stored: string, name: string, options: FilterSummaryOptions): string {
        const hit = options.Fields?.find((f) => f.Name === stored || f.Name === name);
        return hit?.DisplayName || name;
    }

    private sourceLabel(source: string, options: FilterSummaryOptions): string {
        return options.SourceLabels?.[source] || source;
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
                return `<span style="${HTML_STYLES.valueDate}">${EscapeHtml(formatted)}</span>`;
            }
        }
        return `<span style="${HTML_STYLES.valueString}">"${EscapeHtml(String(value))}"</span>`;
    }
}

function EscapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
