import type { SQLDialect } from '@memberjunction/sql-dialect';
import { AllNodes, MJQueryDiagnosticCodes, QueryTemplate, SQLParser } from '@memberjunction/sql-parser';
import type {
    CompositionReference, DeclaredTemplateParameter, Diagnostic, TemplateExpression, TemplateLiteralValue,
} from '@memberjunction/sql-parser';
import type { QueryParameterDefinition } from '@memberjunction/query-processor';

/** The body of a composition tag, `query:"…"`. */
const COMPOSITION_TAG = /^\s*query\s*:/;

/** The name of the per-render composition recorder in a template's scope. */
export const COMPOSITION_RECORDER_NAME = '__mjComposition';

/**
 * The MJ Query rules that apply to new and edited queries only: authoring rules (where a tag may
 * sit, which values need a filter, hole and argument shapes, composition placement) that a query
 * saved before the language existed may rely on. A save refuses them and a refresh reports them;
 * a run of an existing query does not stop for them (DISCUSSION §6: "existing queries keep
 * running"). Every other error stops a run, so a construct outside the language (an unsupported
 * tag, a function call, attribute or subscript access, an unknown filter, a malformed tag) never
 * reaches Nunjucks. A code added later stops a run until it is listed here.
 */
export const SAVE_TIME_ONLY_RULES: ReadonlySet<string> = new Set([
    MJQueryDiagnosticCodes.TagInStringLiteral,
    MJQueryDiagnosticCodes.TagInQuotedIdentifier,
    MJQueryDiagnosticCodes.UnfilteredValue,
    MJQueryDiagnosticCodes.UnfilteredUntyped,
    MJQueryDiagnosticCodes.ArithmeticInHole,
    MJQueryDiagnosticCodes.HoleNotAValue,
    MJQueryDiagnosticCodes.DefaultNotLiteral,
    MJQueryDiagnosticCodes.ForIterable,
    MJQueryDiagnosticCodes.FilterTypeMismatch,
    MJQueryDiagnosticCodes.ParameterTypeConflict,
    MJQueryDiagnosticCodes.CompositionPosition,
]);

/**
 * One query's SQL, read once for rendering: SQL comments removed (template tags in them are
 * inert), the template parsed by the MJ Query language, and its compositions found.
 */
export class TemplateUnit {
    /** The SQL with comments removed. */
    readonly SQL: string;
    readonly Template: QueryTemplate;
    /**
     * The compositions that are SQL (not inside a string literal or quoted identifier), in source
     * order; the recorder call for the i-th passes index `i`.
     */
    readonly References: readonly CompositionReference[];

    private constructor(sql: string, dialect: SQLDialect, keepComments: boolean) {
        this.SQL = keepComments ? sql : SQLParser.StripComments(sql, dialect);
        this.Template = QueryTemplate.Parse(this.SQL, dialect);
        this.References = this.Template.CompositionReferences().Value.filter(r => r.Node.SqlContext === 'Code');
    }

    /**
     * Reads `sql` in `dialect`. Comments are removed first, so tags in them are inert, unless
     * `keepComments` (for SQL that is composed but not rendered): composition tokens in comments
     * are inert either way.
     */
    static Read(sql: string, dialect: SQLDialect, keepComments = false): TemplateUnit {
        return new TemplateUnit(sql ?? '', dialect, keepComments);
    }

    /**
     * The interpreter gate: validates the template by the MJ Query language in Refresh mode and
     * refuses it on any error other than the {@link SAVE_TIME_ONLY_RULES}. Nunjucks only ever
     * evaluates a template that passed.
     * @param label - Names the query in the error.
     * @throws Error listing every refusing diagnostic.
     */
    AssertRenderable(label: string, declared: ReadonlyArray<QueryParameterDefinition>): void {
        const check = this.Template.Validate({ Mode: 'Refresh', DeclaredParameters: declaredParameters(declared) });
        const refusals = check.Diagnostics.filter(d => d.Severity === 'Error' && !SAVE_TIME_ONLY_RULES.has(d.Code));
        if (refusals.length === 0) return;
        throw new Error(`Query template ${label} cannot be rendered: ${refusals.map(describe).join(' ')}`);
    }

    /**
     * Whether the SQL holds template syntax besides compositions: a `{{ }}` value, a `{% %}` block or
     * a `{# #}` comment, wherever it sits outside a SQL comment. Such SQL is rendered whatever its
     * `UsesTemplate` flag says, because the flag can be stale (COMPAT-MAP B12).
     */
    HasTemplateSyntax(): boolean {
        return this.Template.Tokens.Tokens.some(t => t.Kind === 'TemplateBlock' || t.Kind === 'TemplateComment'
            || (t.Kind === 'TemplateExpression' && !COMPOSITION_TAG.test(t.Template?.Body ?? '')));
    }

    /** The names a `{% set %}` or `{% for %}` assigns: they hold template values, not parameter values. */
    AssignedNames(): ReadonlySet<string> {
        const names = new Set<string>();
        for (const node of AllNodes(this.Template.Nodes)) {
            if (node.Kind === 'Set') names.add(node.Name);
            else if (node.Kind === 'For') names.add(node.LoopVariable);
        }
        return names;
    }

    /** The SQL with every composition replaced by its recorder call, for a template render. */
    TemplateText(): string {
        return this.replaceReferences(i => RecorderCall(i, this.References[i]));
    }

    /** Only the recorder calls, for evaluating the arguments of a query that is not a template. */
    CallsText(): string {
        return this.References.map((reference, i) => RecorderCall(i, reference)).join('\n');
    }

    /** The SQL with the i-th composition replaced by `names[i]`. */
    WithNames(names: readonly string[]): string {
        return this.replaceReferences(i => names[i]);
    }

    private replaceReferences(replacement: (index: number) => string): string {
        let text = this.SQL;
        for (let i = this.References.length - 1; i >= 0; i--) {
            const span = this.References[i].Span;
            text = text.substring(0, span.Start) + replacement(i) + text.substring(span.End);
        }
        return text;
    }
}

/**
 * The Nunjucks tag that records composition `index`: its arguments, in order, are evaluated in
 * the scope where the reference stands, and the call writes the instance's CTE name.
 */
export function RecorderCall(index: number, reference: CompositionReference): string {
    const args = reference.Arguments.map(a => ToNunjucksExpression(a.Expression, a.Name)).join(', ');
    return `{{ ${COMPOSITION_RECORDER_NAME}(${index}, [${args}]) }}`;
}

/**
 * Writes an MJ Query expression as a Nunjucks expression with the same meaning. Every node is
 * parenthesized, and literals are written by MJ, so nothing of the source text is copied.
 * @throws Error for an expression outside the MJ Query grammar.
 */
export function ToNunjucksExpression(expression: TemplateExpression, argumentName: string): string {
    switch (expression.Kind) {
        case 'Name': return identifier(expression.Name, argumentName);
        case 'Context': return `Context.${identifier(expression.Token, argumentName)}`;
        case 'LoopMember': return `loop.${identifier(expression.Member, argumentName)}`;
        case 'Literal': return literal(expression.Value);
        case 'Unary': return `(${expression.Operator === 'not' ? 'not ' : expression.Operator}${ToNunjucksExpression(expression.Operand, argumentName)})`;
        case 'Binary': return `(${ToNunjucksExpression(expression.Left, argumentName)} ${expression.Operator} ${ToNunjucksExpression(expression.Right, argumentName)})`;
        case 'Filter': {
            const args = expression.Arguments.map(a => ToNunjucksExpression(a, argumentName));
            const call = args.length > 0 ? `(${args.join(', ')})` : '';
            return `(${ToNunjucksExpression(expression.Input, argumentName)} | ${identifier(expression.Name, argumentName)}${call})`;
        }
        default:
            throw new Error(`Composition argument "${argumentName}" is not an MJ Query expression: ${expression.Text}`);
    }
}

function identifier(name: string, argumentName: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(`Composition argument "${argumentName}" reads "${name}", which is not a plain name.`);
    }
    return name;
}

function literal(value: TemplateLiteralValue): string {
    if (value === null) return 'none';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    return `"${escaped}"`;
}

function declaredParameters(definitions: ReadonlyArray<QueryParameterDefinition>): DeclaredTemplateParameter[] {
    return definitions.map(d => ({ Name: d.Name, Type: d.Type, IsServerSet: d.IsServerSet ?? false }));
}

function describe(diagnostic: Diagnostic): string {
    return `${diagnostic.Code}: ${diagnostic.Message}`;
}
