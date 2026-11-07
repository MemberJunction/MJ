import { MakeDiagnostic } from '../common/analysis.js';
import type { Analysis, Diagnostic, Span } from '../common/analysis.js';
import { MJQueryDiagnosticCodes } from '../common/diagnosticCodes.js';
import type { TemplateSqlContext } from '../lexer/sqlTokenTypes.js';
import type { FilterExpression, TemplateLiteralValue } from './expressionTypes.js';
import { DEFAULT_FILTER_NAME, FindSqlFilter, MJ_QUERY_CONTEXT_TOKENS } from './queryLanguage.js';
import type { TemplateParameterType } from './queryLanguage.js';
import { AllNodes } from './templateNodes.js';
import type { TemplateNode } from './templateNodes.js';
import { WalkTemplate } from './templateWalker.js';
import type { ValueUseRole, ValueVisit } from './templateWalker.js';

/** One use of a parameter. */
export interface ParameterUse {
    readonly Role: ValueUseRole;
    /** The parameter name as written. */
    readonly Span: Span;
    /** The whole tag the use sits in. */
    readonly TagSpan: Span;
    /**
     * The filter names applied to the value, innermost first; empty unless the use is a value a
     * `{{ }}` hole writes (the hole's own value, or a branch of an inline if in it).
     */
    readonly Filters: readonly string[];
    /**
     * Whether the use sits inside an `{% if %}` block, is part of an `{% if %}` condition, or is
     * any part of an inline if.
     */
    readonly InsideConditional: boolean;
    /** Whether the use is `<name>.length`, which reads the length of the value. */
    readonly ReadsLength: boolean;
    /** Whether a `default(…)` filter supplies a value when the parameter has none. */
    readonly HasDefault: boolean;
    readonly SqlContext: TemplateSqlContext;
}

/** A parameter of the template: a name the caller can supply. */
export interface TemplateParameter {
    readonly Name: string;
    /** Every filter name applied to it, in order of first appearance. */
    readonly Filters: readonly string[];
    /**
     * The type its SQL filters imply (the last SQL filter of each use), or `array` for a loop's
     * iterable. `<name>.length` implies no type of its own (an array and a string both have a
     * length); a number or boolean use beside it is reported as a type conflict.
     */
    readonly InferredType: TemplateParameterType;
    /**
     * Whether the template needs a value: true when at least one use sits outside every
     * `{% if %}` block and every inline if, and has no `default(…)`. A parameter used only inside
     * conditional blocks, only in conditions, or only inside inline ifs, is optional.
     */
    readonly IsRequired: boolean;
    /** The literal its first `default(…)` filter gives, or `null`. */
    readonly DefaultValue: TemplateLiteralValue;
    readonly Uses: readonly ParameterUse[];
}

/** One `Context.<Token>` read by the template. */
export interface ContextTokenUse {
    /** The whole reference, such as `Context.UserID`. */
    readonly FullName: string;
    /** Whether it is one of the defined tokens. */
    readonly IsKnown: boolean;
    readonly Uses: readonly ParameterUse[];
}

/** Names that are never parameters: the `loop` namespace and the `Context` object. */
const RESERVED_NAMES: ReadonlySet<string> = new Set(['loop', 'Context']);

/** Names assigned by `{% set %}` anywhere in the template. */
export function SetVariableNames(nodes: readonly TemplateNode[]): ReadonlySet<string> {
    const names = new Set<string>();
    for (const node of AllNodes(nodes)) if (node.Kind === 'Set') names.add(node.Name);
    return names;
}

/** Whether a visit reads a caller-supplied parameter (not a loop variable, set variable or reserved name). */
export function IsParameterVisit(visit: ValueVisit, setNames: ReadonlySet<string>): boolean {
    const reference = visit.Reference;
    if (reference.Kind !== 'Name') return false;
    if (RESERVED_NAMES.has(reference.Name) || setNames.has(reference.Name)) return false;
    return !visit.Scope.LoopVariables.includes(reference.Name);
}

/** The SQL type the filters imply: the last SQL filter's type, or `unknown`. */
export function TypeFromFilters(filters: readonly string[]): TemplateParameterType {
    for (let i = filters.length - 1; i >= 0; i--) {
        const filter = FindSqlFilter(filters[i]);
        if (filter) return filter.ValueType;
    }
    return 'unknown';
}

/** Builds the parameter list of a template tree. */
export class ParameterAnalyzer {
    private readonly uses = new Map<string, ParameterUse[]>();
    private readonly defaults = new Map<string, TemplateLiteralValue>();
    private readonly contextUses = new Map<string, ParameterUse[]>();

    private constructor(private readonly nodes: readonly TemplateNode[]) {}

    /** The parameters of a template, in order of first use. */
    static Parameters(nodes: readonly TemplateNode[], complete: boolean): Analysis<readonly TemplateParameter[]> {
        const analyzer = new ParameterAnalyzer(nodes);
        analyzer.collect();
        const diagnostics: Diagnostic[] = [];
        const parameters = [...analyzer.uses.entries()].map(([name, uses]) => analyzer.toParameter(name, uses, diagnostics));
        return { Value: parameters, Complete: complete, Diagnostics: diagnostics };
    }

    /** The `Context` tokens a template reads, in order of first use. */
    static ContextTokens(nodes: readonly TemplateNode[], complete: boolean): Analysis<readonly ContextTokenUse[]> {
        const analyzer = new ParameterAnalyzer(nodes);
        analyzer.collect();
        const value = [...analyzer.contextUses.entries()].map(([fullName, uses]) => ({
            FullName: fullName, IsKnown: MJ_QUERY_CONTEXT_TOKENS.includes(fullName), Uses: uses,
        }));
        return { Value: value, Complete: complete, Diagnostics: [] };
    }

    private collect(): void {
        const setNames = SetVariableNames(this.nodes);
        WalkTemplate(this.nodes, {
            Value: visit => {
                if (visit.Reference.Kind === 'Context') this.addUse(this.contextUses, visit.Reference.FullName, visit);
                else if (IsParameterVisit(visit, setNames) && visit.Reference.Kind === 'Name') this.addParameterUse(visit.Reference.Name, visit);
            },
        });
    }

    private addParameterUse(name: string, visit: ValueVisit): void {
        this.addUse(this.uses, name, visit);
        const defaultFilter = visit.Filters.find(f => f.Name === DEFAULT_FILTER_NAME);
        if (defaultFilter && !this.defaults.has(name)) this.defaults.set(name, literalArgument(defaultFilter));
    }

    private addUse(target: Map<string, ParameterUse[]>, key: string, visit: ValueVisit): void {
        const filters = visit.Filters.map(f => f.Name);
        const use: ParameterUse = {
            Role: visit.Role, Span: visit.Reference.Span, TagSpan: visit.Owner.Span, Filters: filters,
            InsideConditional: visit.Scope.Conditional, ReadsLength: visit.ReadsLength,
            HasDefault: filters.includes(DEFAULT_FILTER_NAME), SqlContext: visit.SqlContext,
        };
        const list = target.get(key);
        if (list) list.push(use);
        else target.set(key, [use]);
    }

    private toParameter(name: string, uses: ParameterUse[], diagnostics: Diagnostic[]): TemplateParameter {
        const filters: string[] = [];
        for (const use of uses) for (const f of use.Filters) if (!filters.includes(f)) filters.push(f);
        return {
            Name: name, Filters: filters, InferredType: inferType(name, uses, diagnostics),
            IsRequired: uses.some(u => !u.InsideConditional && !u.HasDefault),
            DefaultValue: this.defaults.get(name) ?? null, Uses: uses,
        };
    }
}

/** Types that have no length: `<name>.length` of such a value is always `undefined`. */
const TYPES_WITHOUT_LENGTH: ReadonlySet<TemplateParameterType> = new Set<TemplateParameterType>(['number', 'boolean']);

/** The type the uses imply; a second, different type is reported, as is `.length` of a number or boolean. */
function inferType(name: string, uses: readonly ParameterUse[], diagnostics: Diagnostic[]): TemplateParameterType {
    let type: TemplateParameterType = 'unknown';
    for (const use of uses) {
        const implied = use.Role === 'LoopIterable' ? 'array' : TypeFromFilters(use.Filters);
        if (implied === 'unknown') continue;
        if (type === 'unknown') type = implied;
        else if (implied !== type) diagnostics.push(typeConflict(use.Span, `"${name}" is used as ${type} elsewhere but as ${implied} here.`));
    }
    if (TYPES_WITHOUT_LENGTH.has(type)) {
        for (const use of uses.filter(u => u.ReadsLength)) diagnostics.push(typeConflict(use.Span, `"${name}" is used as ${type} elsewhere, which has no length.`));
    }
    return type;
}

function typeConflict(span: Span, message: string): Diagnostic {
    return MakeDiagnostic(MJQueryDiagnosticCodes.ParameterTypeConflict, 'Warning', span, message, 'Use one type, and the filter for it, at every use.');
}

/** The literal value of a filter's first argument, or `null`. */
function literalArgument(filter: FilterExpression): TemplateLiteralValue {
    const first = filter.Arguments[0];
    return first !== undefined && first.Kind === 'Literal' ? first.Value : null;
}
