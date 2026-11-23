import nunjucks from "nunjucks";

/** A node of nunjucks' syntax tree. */
interface SyntaxNode {
    lineno: number;
    colno: number;
}
/** A literal in template code; `value` is already unescaped by the lexer. */
interface LiteralNode extends SyntaxNode {
    value: string | number | boolean | RegExp | null;
}
/** A bare name: a context variable, a filter or test name, a loop or macro variable. */
interface SymbolNode extends SyntaxNode {
    value: string;
}
/** Member access. `a.b` and `a["b"]` both parse to a literal in `val`; `a[expr]` does not. */
interface LookupValNode extends SyntaxNode {
    target: SyntaxNode;
    val: SyntaxNode;
}
type NodeClass<T extends SyntaxNode> = abstract new (...args: never[]) => T;

/**
 * The part of nunjucks' parser API this guard reads. nunjucks exports `parser` and `nodes` at
 * runtime; this package has no type declarations for nunjucks, so the shape is stated here.
 */
interface NunjucksSyntaxApi {
    parser: { parse(src: string): SyntaxNode };
    nodes: {
        Node: NodeClass<SyntaxNode>;
        Literal: NodeClass<LiteralNode>;
        Symbol: NodeClass<SymbolNode>;
        LookupVal: NodeClass<LookupValNode>;
        Include: NodeClass<SyntaxNode>;
        Import: NodeClass<SyntaxNode>;
        FromImport: NodeClass<SyntaxNode>;
        Extends: NodeClass<SyntaxNode>;
        CallExtension: NodeClass<SyntaxNode>;
    };
}

const { parser, nodes }: NunjucksSyntaxApi = nunjucks;

/**
 * Property names that lead from any value to JavaScript internals: `x.constructor.constructor`
 * is the Function constructor, and a bare `constructor` resolves on the render context itself.
 */
const INTERNAL_PROPERTY_NAMES: ReadonlySet<string> = new Set(['constructor', '__proto__', 'prototype']);

const INTERNALS_REASON = 'access to JavaScript object internals (constructor/__proto__/prototype)';

/**
 * SSTI defense for the Data Mapper action. The mapping template is CALLER-supplied (including by
 * AI agents through tool calls) and full Nunjucks is not a sandbox: template code that reaches a
 * function constructor runs arbitrary JavaScript inside the server process. Data mapping needs
 * property paths, filters and control flow, so a template is refused when it:
 * - names `constructor`, `__proto__` or `prototype` anywhere, in code or in static text;
 * - reads a member whose name is computed (`x[expr]`), which could build those names at run time
 *   (numeric indexes and fixed names, `x[0]` and `x["first name"]`, are allowed);
 * - loads another template (include / import / from / extends).
 *
 * The template is checked on the syntax tree from nunjucks' own parser, the one that compiles it
 * for rendering. Scanning the text for `{{ ... }}` instead disagrees with that parser whenever a
 * string literal contains `}}`, and code hidden behind such a literal would go unchecked.
 *
 * @throws Error when the template is refused, or when it is not valid Nunjucks.
 */
export function AssertMappingTemplateSafe(template: string): void {
    if (mentionsInternalProperty(template)) {
        throw rejection(INTERNALS_REASON);
    }
    for (const node of walkSyntaxTree(parser.parse(template))) {
        const reason = refusalReason(node);
        if (reason) {
            throw rejection(reason);
        }
    }
}

function rejection(reason: string): Error {
    return new Error(`Mapping template rejected: ${reason} is not allowed in Data Mapper templates`);
}

/** Whole-template check, so the names are refused in static text as well as in code. */
function mentionsInternalProperty(template: string): boolean {
    return /\b(constructor|__proto__|prototype)\b/.test(template);
}

/** Why this node makes the template unsafe, or null when the node is fine. */
function refusalReason(node: SyntaxNode): string | null {
    if (isTemplateLoad(node)) {
        return 'external template loading';
    }
    if (node instanceof nodes.LookupVal && !isFixedMemberName(node.val)) {
        return 'computed member access (use dot paths, fixed names or numeric indexes)';
    }
    if (namesInternalProperty(node)) {
        return INTERNALS_REASON;
    }
    return null;
}

/** Node types that fetch another template through the environment's loaders. */
const TEMPLATE_LOAD_NODES: ReadonlyArray<NodeClass<SyntaxNode>> = [
    nodes.Include, nodes.Import, nodes.FromImport, nodes.Extends, nodes.CallExtension,
];

function isTemplateLoad(node: SyntaxNode): boolean {
    return TEMPLATE_LOAD_NODES.some(loadNode => node instanceof loadNode);
}

function isFixedMemberName(memberName: SyntaxNode): boolean {
    return memberName instanceof nodes.Literal
        && (typeof memberName.value === 'string' || typeof memberName.value === 'number');
}

/**
 * True for a name or string literal that spells an internal property. Literals are compared after
 * the lexer unescapes them, so `"con\structor"` is caught here although the text check misses it.
 */
function namesInternalProperty(node: SyntaxNode): boolean {
    if (node instanceof nodes.Symbol) {
        return INTERNAL_PROPERTY_NAMES.has(node.value);
    }
    return node instanceof nodes.Literal
        && typeof node.value === 'string'
        && INTERNAL_PROPERTY_NAMES.has(node.value);
}

/**
 * Yields every node under `root`. It follows each property rather than the `fields` list that
 * nunjucks' own `findAll` uses: the body of a block `{% set %}` and the cases of a `{% switch %}`
 * are not in `fields`, so `findAll` never visits the code inside them.
 */
function* walkSyntaxTree(root: SyntaxNode): Generator<SyntaxNode> {
    const pending: object[] = [root];
    while (pending.length > 0) {
        const item = pending.pop();
        if (item instanceof nodes.Node) {
            yield item;
        }
        if (item) {
            pending.push(...childObjects(item));
        }
    }
}

/** The nodes, and arrays of nodes, held directly by a node or an array. */
function childObjects(parent: object): object[] {
    const children: object[] = [];
    for (const value of Object.values(parent)) {
        if (Array.isArray(value) || value instanceof nodes.Node) {
            children.push(value);
        }
    }
    return children;
}
