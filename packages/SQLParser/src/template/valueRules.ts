import { MakeDiagnostic } from '../common/analysis.js';
import type { Diagnostic, DiagnosticSeverity, Span } from '../common/analysis.js';
import { MJQueryDiagnosticCodes } from '../common/diagnosticCodes.js';
import { WalkExpression } from './expressionTypes.js';
import type { FilterExpression, LengthExpression, TemplateExpression } from './expressionTypes.js';
import { SetVariableNames } from './parameterAnalysis.js';
import type { TemplateParameter } from './parameterAnalysis.js';
import {
    ContextTokenFilters, DEFAULT_FILTER_NAME, FindSqlFilter, MJ_QUERY_CONTEXT_TOKENS, MJ_QUERY_LOOP_MEMBERS,
} from './queryLanguage.js';
import type { TemplateParameterType } from './queryLanguage.js';
import { AllNodes, NodeExpressions } from './templateNodes.js';
import type { ExpressionNode, ForNode, SetNode, TemplateNode } from './templateNodes.js';
import { UnwrapFilters, WalkTemplate } from './templateWalker.js';
import type { ValueVisit, WalkScope } from './templateWalker.js';
import type { DeclaredTemplateParameter, QueryTemplateValidateOptions } from './validationTypes.js';

const FILTER_FOR_TYPE: Readonly<Record<string, string>> = {
    string: 'sqlString', number: 'sqlNumber', date: 'sqlDate', boolean: 'sqlBoolean', array: 'sqlIn',
};
const NUMERIC_OPERATORS: ReadonlySet<string> = new Set(['-', '*', '/', '%']);

/**
 * The save-time rules for values: hole shapes, filter names, unfiltered values, filter/type
 * fit, `Context` tokens, loop members and loop iterables.
 */
export class ValueRules {
    private readonly diagnostics: Diagnostic[] = [];
    private readonly declared = new Map<string, DeclaredTemplateParameter>();
    private readonly inferred = new Map<string, TemplateParameterType>();
    private readonly setNames: ReadonlySet<string>;
    private readonly setValues = new Map<string, SetNode>();
    private readonly contextTokens: readonly string[];
    private readonly refreshMode: boolean;

    private constructor(nodes: readonly TemplateNode[], parameters: readonly TemplateParameter[], options: QueryTemplateValidateOptions) {
        for (const p of options.DeclaredParameters ?? []) this.declared.set(p.Name, p);
        for (const p of parameters) this.inferred.set(p.Name, p.InferredType);
        this.setNames = SetVariableNames(nodes);
        for (const node of AllNodes(nodes)) if (node.Kind === 'Set' && !this.setValues.has(node.Name)) this.setValues.set(node.Name, node);
        this.contextTokens = options.ContextTokens ?? MJ_QUERY_CONTEXT_TOKENS;
        this.refreshMode = options.Mode === 'Refresh';
    }

    /** Applies the value rules to a template tree. */
    static Check(nodes: readonly TemplateNode[], parameters: readonly TemplateParameter[], options: QueryTemplateValidateOptions): Diagnostic[] {
        const rules = new ValueRules(nodes, parameters, options);
        WalkTemplate(nodes, {
            Node: (node, scope) => rules.checkNode(node, scope),
            Value: visit => rules.checkReference(visit),
        });
        return rules.diagnostics;
    }

    private checkNode(node: TemplateNode, scope: WalkScope): void {
        if (node.Kind === 'Expression') this.checkHole(node, scope);
        else if (node.Kind === 'For') this.checkFor(node, scope);
        for (const expression of NodeExpressions(node)) this.checkFilterNames(expression);
    }

    // ─── Holes ────────────────────────────────────────────

    private checkHole(node: ExpressionNode, scope: WalkScope): void {
        this.checkHoleValue(node.Expression, [], scope, false);
    }

    /**
     * Checks a value a hole writes: the hole's expression, or a branch of an inline if in it.
     * `outer` are the filters applied around it, innermost first. A literal is allowed as a branch
     * (the author wrote it), not as a whole hole; an inline if's condition is not written.
     */
    private checkHoleValue(expression: TemplateExpression, outer: readonly FilterExpression[], scope: WalkScope, inBranch: boolean): void {
        const { Base, Filters } = UnwrapFilters(expression);
        if (Base.Kind === 'Binary' || Base.Kind === 'Unary') {
            this.add(MJQueryDiagnosticCodes.ArithmeticInHole, 'Error', Base.Span, 'Operators are not allowed inside a {{ }} hole.',
                'Do the arithmetic in SQL around the hole ({{ Year | sqlNumber }} - 1), or in a {% set %}.');
            return;
        }
        if (Base.Kind === 'Literal') {
            if (!inBranch) {
                this.add(MJQueryDiagnosticCodes.HoleNotAValue, 'Error', Base.Span, 'A {{ }} hole must start from a parameter, a Context token or a loop value.',
                    'Write the literal into the SQL itself.');
            }
            return;
        }
        this.checkDefaults(Filters);
        const filters = [...Filters, ...outer];
        if (Base.Kind === 'InlineIf') {
            this.checkHoleValue(Base.Body, filters, scope, true);
            if (Base.Else !== null) this.checkHoleValue(Base.Else, filters, scope, true);
            return;
        }
        const sqlFilters = filters.filter(f => FindSqlFilter(f.Name) !== undefined);
        const last = sqlFilters.length > 0 ? sqlFilters[sqlFilters.length - 1] : undefined;
        if (Base.Kind === 'Context') this.checkContextHole(Base.FullName, Base.Span, last);
        else if (Base.Kind === 'Name') this.checkNameHole(Base.Name, Base.Span, last, scope);
        else if (Base.Kind === 'Length') this.checkLengthHole(Base, last);
    }

    private checkDefaults(filters: readonly FilterExpression[]): void {
        for (const filter of filters) {
            if (filter.Name !== DEFAULT_FILTER_NAME) continue;
            const literal = filter.Arguments.length > 0 && filter.Arguments.every(a => a.Kind === 'Literal');
            if (literal) continue;
            this.add(MJQueryDiagnosticCodes.DefaultNotLiteral, 'Error', filter.Span, 'default(…) takes a literal value.',
                "Write default('value'), default(10), default(true) or default(null).");
        }
    }

    private checkContextHole(fullName: string, span: Span, last: FilterExpression | undefined): void {
        const allowed = ContextTokenFilters(fullName);
        if (last === undefined) this.unfiltered(span, fullName, allowed[0]);
        else if (!allowed.includes(last.Name)) this.mismatch(last, fullName, allowed.join(' or '));
    }

    private checkNameHole(name: string, span: Span, last: FilterExpression | undefined, scope: WalkScope): void {
        if (scope.LoopVariables.includes(name)) {
            if (last === undefined) this.unfiltered(span, name, 'the filter for the array\'s element type');
            return;
        }
        if (this.setNames.has(name)) {
            if (last === undefined && !this.isSafeSet(name)) this.unfiltered(span, name, 'the filter for its type');
            return;
        }
        if (name === 'loop' || name === 'Context') return;
        if (last === undefined) this.checkUnfilteredParameter(name, span);
        else this.checkFilterFits(name, last);
    }

    /** `<name>.length` written into the SQL: a number, so it takes `sqlNumber` like any value of unchecked shape. */
    private checkLengthHole(length: LengthExpression, last: FilterExpression | undefined): void {
        const text = `${length.Object.Name}.length`;
        if (last === undefined) this.unfiltered(length.Span, text, 'sqlNumber');
        else if (FindSqlFilter(last.Name)?.ValueType !== 'number') this.mismatch(last, text, 'sqlNumber');
    }

    /** An unfiltered parameter: allowed for numbers, booleans and server-set values. */
    private checkUnfilteredParameter(name: string, span: Span): void {
        const declared = this.declared.get(name);
        if (declared?.IsServerSet) return;
        const type = declared ? declared.Type : this.inferred.get(name) ?? 'unknown';
        if (type === 'number' || type === 'boolean') return;
        if (type === 'string' || type === 'array' || type === 'date') this.unfiltered(span, name, FILTER_FOR_TYPE[type]);
        else this.untyped(span, name);
    }

    /** The last SQL filter must format the declared type. */
    private checkFilterFits(name: string, last: FilterExpression): void {
        const declared = this.declared.get(name);
        const filter = FindSqlFilter(last.Name);
        if (!declared || !filter || !(declared.Type in FILTER_FOR_TYPE) || filter.ValueType === declared.Type) return;
        this.mismatch(last, name, `${FILTER_FOR_TYPE[declared.Type]} (declared ${declared.Type})`);
    }

    /**
     * Whether a `{% set %}` value may be written unfiltered: a constant the author wrote (it reads
     * no parameter or `Context` token), or plainly a number or boolean.
     */
    private isSafeSet(name: string): boolean {
        const value = this.setValues.get(name)?.Value;
        if (value === undefined) return false;
        let readsValue = false;
        WalkExpression(value, n => { if (n.Kind === 'Name' || n.Kind === 'Context' || n.Kind === 'LoopMember') readsValue = true; });
        if (!readsValue) return true;
        if (value.Kind === 'Literal') return typeof value.Value === 'number' || typeof value.Value === 'boolean';
        if (value.Kind === 'Unary') return value.Operator === '-';
        return value.Kind === 'Binary' && NUMERIC_OPERATORS.has(value.Operator);
    }

    // ─── Loops, Context tokens, filter names ─────────────

    private checkFor(node: ForNode, scope: WalkScope): void {
        const iterable = node.Iterable;
        if (iterable.Kind !== 'Name' || scope.LoopVariables.includes(iterable.Name) || this.setNames.has(iterable.Name)) {
            this.add(MJQueryDiagnosticCodes.ForIterable, 'Error', iterable.Span, '{% for %} must loop over an array parameter.',
                'Declare an array parameter and write {% for Item in ArrayParameter %}.');
            return;
        }
        const declared = this.declared.get(iterable.Name);
        if (declared && declared.Type !== 'array') {
            this.add(MJQueryDiagnosticCodes.ForIterable, 'Error', iterable.Span, `"${iterable.Name}" is declared ${declared.Type}, but {% for %} loops over it.`,
                'Declare the parameter as array.');
        }
    }

    private checkReference(visit: ValueVisit): void {
        const reference = visit.Reference;
        if (reference.Kind === 'Context' && !this.contextTokens.includes(reference.FullName)) {
            this.unknownContext(reference.Span, reference.FullName);
        } else if (reference.Kind === 'Name' && reference.Name === 'Context') {
            this.unknownContext(reference.Span, 'Context');
        } else if (reference.Kind === 'LoopMember' || (reference.Kind === 'Name' && reference.Name === 'loop')) {
            this.checkLoopMember(reference.Kind === 'LoopMember' ? reference.Member : '', reference.Span, visit.Scope);
        }
    }

    private checkLoopMember(member: string, span: Span, scope: WalkScope): void {
        if (scope.LoopVariables.length === 0) {
            this.add(MJQueryDiagnosticCodes.LoopOutsideFor, 'Error', span, 'loop is defined only inside a {% for %} body.', 'Move the use inside the loop.');
        } else if (!MJ_QUERY_LOOP_MEMBERS.includes(member)) {
            this.add(MJQueryDiagnosticCodes.LoopOutsideFor, 'Error', span, `loop.${member} is not a loop member.`,
                `Use one of loop.${MJ_QUERY_LOOP_MEMBERS.join(', loop.')}.`);
        }
    }

    private checkFilterNames(expression: TemplateExpression): void {
        WalkExpression(expression, node => {
            if (node.Kind !== 'Filter' || node.Name === DEFAULT_FILTER_NAME || FindSqlFilter(node.Name)) return;
            this.add(MJQueryDiagnosticCodes.UnknownFilter, 'Error', node.NameSpan, `"${node.Name}" is not an MJ Query filter.`,
                'Use an MJ SQL filter (sqlString, sqlNumber, sqlDate, sqlBoolean, sqlIn, sqlIdentifier, sqlLikeContains, sqlLikeBegins, sqlLikeEnds, sqlNoKeywordsExpression) or default.');
        });
    }

    // ─── Reporting ────────────────────────────────────────

    private unfiltered(span: Span, name: string, filter: string): void {
        this.add(MJQueryDiagnosticCodes.UnfilteredValue, 'Error', span, `"${name}" is written into the SQL without an MJ SQL filter.`,
            `Pipe it through ${filter}, e.g. {{ ${name} | ${filter.startsWith('sql') ? filter : 'sqlString'} }}.`);
    }

    private untyped(span: Span, name: string): void {
        this.add(MJQueryDiagnosticCodes.UnfilteredUntyped, 'Warning', span, `"${name}" is written without a filter, and its type is not known.`,
            'Add the SQL filter for its type, or declare it as a number or boolean parameter.');
    }

    private mismatch(filter: FilterExpression, name: string, expected: string): void {
        const severity: DiagnosticSeverity = this.refreshMode ? 'Warning' : 'Error';
        this.add(MJQueryDiagnosticCodes.FilterTypeMismatch, severity, filter.NameSpan, `${filter.Name} does not fit "${name}".`, `Use ${expected}.`);
    }

    private unknownContext(span: Span, fullName: string): void {
        this.add(MJQueryDiagnosticCodes.UnknownContextToken, 'Error', span, `${fullName} is not a Context token.`,
            `Use one of ${this.contextTokens.join(', ')}.`);
    }

    private add(code: string, severity: DiagnosticSeverity, span: Span, message: string, hint: string): void {
        this.diagnostics.push(MakeDiagnostic(code, severity, span, message, hint));
    }
}
