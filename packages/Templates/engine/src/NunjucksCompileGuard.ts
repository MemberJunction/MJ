/**
 * @fileoverview Refuses nunjucks templates whose names could change the code nunjucks compiles.
 *
 * The nunjucks 3.2.4 compiler copies template-controlled names into the JavaScript it generates
 * without escaping them. That covers variable, filter, test and loop names; the names that `set`,
 * `macro`, `import` and `from` bind; and the name of a called member. The generated code runs when
 * the template renders, so the runtime guard in `NunjucksSandbox.ts` never sees it.
 * {@link AssertTemplateTreeIsSafe} checks a parsed template before it compiles.
 * @module @memberjunction/templates
 */
import nunjucks from 'nunjucks';
import { TemplateSandboxError } from './TemplateSandboxError';

/** A node of a parsed nunjucks template. nunjucks stores the node's fields as own properties. */
interface TemplateNode {
    readonly typename: string;
    readonly lineno: number;
    readonly colno: number;
}

/** The nunjucks internals the guard reads. */
interface NunjucksInternals {
    nodes: { Node: abstract new (...args: never[]) => TemplateNode };
    compiler: { Compiler: { prototype: { _getNodeName(node: unknown): string } } };
}
const NUNJUCKS = nunjucks as unknown as NunjucksInternals;

/** Letters, decimal digits, `_` and `$`. Safe inside a JavaScript string and as part of an identifier. */
const PLAIN_NAME = /^[\p{L}\p{Nd}_$]+$/u;

/** A filter name can also contain dots (`{{ x | ns.filter }}`). */
const PLAIN_FILTER_NAME = /^[\p{L}\p{Nd}_$]+(?:\.[\p{L}\p{Nd}_$]+)*$/u;

/** Characters that let a called member's name end the string the compiler writes it into. */
const UNSAFE_CALL_NAME_CHARACTERS = /[\\\r\n\u2028\u2029]/;

/**
 * Identifiers the generated code uses inside a loop body (nunjucks 3.2.4). An async loop binds its
 * loop variables as raw function parameters, so a loop variable with one of these names shadows them.
 */
const RESERVED_LOOP_NAMES: ReadonlySet<string> = new Set([
    'env', 'context', 'frame', 'runtime', 'cb', 'next', 'lineno', 'colno', 'output',
    'parentTemplate', 'callerFrame', 'kwargs', 'Object', 'Math', 'Error',
]);

/** Prefixes of generated identifiers: temporaries (`t_3`, `macro_t_3`, `hole_0`), blocks (`b_`), macro arguments (`l_`). */
const RESERVED_LOOP_NAME_PREFIX = /^(?:t|macro_t|hole|b|l)_/;

/**
 * Checks a parsed nunjucks template, and throws a {@link TemplateSandboxError} if a name in it could
 * change the code the compiler generates:
 * - every variable, filter, test, loop, `set`, macro, import and block name must be a plain name
 *   (letters, digits, `_` and `$`); a filter name can also contain dots
 * - the name of a called member must not contain a backslash or a line break
 * - a loop variable must not reuse a name the generated code relies on (`context`, `frame`, `runtime`, ...)
 * @param tree the root node the nunjucks parser returns
 */
export function AssertTemplateTreeIsSafe(tree: unknown): void {
    new TemplateTreeCheck().Visit(tree);
}

/**
 * One pass over a parse tree. It visits every own property of every node, not only the fields
 * nunjucks lists, because the parser stores some compiled parts outside them (the body of a `set` block).
 */
class TemplateTreeCheck {
    private readonly visited = new WeakSet<TemplateNode>();
    private readonly filterNames = new WeakSet<TemplateNode>();

    public Visit(value: unknown): void {
        if (Array.isArray(value)) {
            asArray(value).forEach((item) => this.Visit(item));
            return;
        }
        if (!isNode(value) || this.visited.has(value)) {
            return;
        }
        this.visited.add(value);
        this.checkNode(value);
        for (const key of Object.keys(value)) {
            this.Visit(property(value, key));
        }
    }

    private checkNode(node: TemplateNode): void {
        switch (node.typename) {
            case 'Symbol':
                return this.checkName(node, node, this.filterNames.has(node) ? PLAIN_FILTER_NAME : PLAIN_NAME);
            case 'Filter':
            case 'FilterAsync':
                return this.checkFilterName(node);
            case 'Is':
                return this.checkName(testName(node), node);
            case 'FunCall':
                return this.checkCallName(node);
            case 'Set':
                return asArray(property(node, 'targets')).forEach((target) => this.checkName(target, node));
            case 'For':
            case 'AsyncEach':
            case 'AsyncAll':
                return this.checkLoopNames(node);
            case 'Macro':
            case 'Caller':
                return this.checkMacroNames(node);
            case 'Import':
                return this.checkName(property(node, 'target'), node);
            case 'FromImport':
                return this.checkImportedNames(node);
            case 'Block':
                return this.checkName(property(node, 'name'), node);
            case 'Super':
                return this.checkName(property(node, 'blockName'), node);
            case 'CallExtension':
            case 'CallExtensionAsync':
                return this.checkExtensionCall(node);
            default:
                return;
        }
    }

    /** A name the compiler copies as written: a symbol or a quoted string that is a plain name. */
    private checkName(nameNode: unknown, owner: TemplateNode, pattern: RegExp = PLAIN_NAME): void {
        const name = nameValue(nameNode);
        if (name === undefined || !pattern.test(name)) {
            throw refusal('Templates may only use plain names (letters, digits, _ and $)', owner);
        }
    }

    private checkFilterName(node: TemplateNode): void {
        const name = property(node, 'name');
        if (isNode(name)) {
            this.filterNames.add(name);
        }
        this.checkName(name, node, PLAIN_FILTER_NAME);
    }

    /** The compiler writes the called expression's name, built by its own `_getNodeName`, into a string. */
    private checkCallName(node: TemplateNode): void {
        let name: unknown;
        try {
            const compiler = NUNJUCKS.compiler.Compiler.prototype;
            name = compiler._getNodeName.call(compiler, property(node, 'name'));
        } catch {
            name = undefined;
        }
        if (typeof name !== 'string' || UNSAFE_CALL_NAME_CHARACTERS.test(name)) {
            throw refusal('Templates may not call a member whose name contains a backslash or a line break', node);
        }
    }

    private checkLoopNames(node: TemplateNode): void {
        const name = property(node, 'name');
        const loopNames = isNode(name) && name.typename === 'Array' ? asArray(property(name, 'children')) : [name];
        for (const loopName of loopNames) {
            this.checkName(loopName, node);
            const value = nameValue(loopName) ?? '';
            if (RESERVED_LOOP_NAMES.has(value) || RESERVED_LOOP_NAME_PREFIX.test(value)) {
                throw refusal(`Templates may not use "${value}" as a loop variable`, node);
            }
        }
    }

    /** Positional arguments, and the keys of a trailing keyword-argument dictionary, become names. */
    private checkMacroNames(node: TemplateNode): void {
        this.checkName(property(node, 'name'), node);
        const args = asArray(property(property(node, 'args'), 'children'));
        args.forEach((arg, index) => {
            const isKeywordArguments = index === args.length - 1 && isNode(arg) && (arg.typename === 'Dict' || arg.typename === 'KeywordArgs');
            if (!isKeywordArguments) {
                this.checkName(arg, node);
                return;
            }
            asArray(property(arg, 'children')).forEach((pair) => this.checkName(property(pair, 'key'), node));
        });
    }

    private checkImportedNames(node: TemplateNode): void {
        for (const entry of asArray(property(property(node, 'names'), 'children'))) {
            if (isNode(entry) && entry.typename === 'Pair') {
                this.checkName(property(entry, 'key'), node);
                this.checkName(property(entry, 'value'), node);
            } else {
                this.checkName(entry, node);
            }
        }
    }

    /** An extension tag's registered name and method are copied into the generated call. */
    private checkExtensionCall(node: TemplateNode): void {
        for (const value of [property(node, 'extName'), property(node, 'prop')]) {
            if (typeof value !== 'string' || !PLAIN_NAME.test(value)) {
                throw refusal('Template extensions must have plain names', node);
            }
        }
    }
}

/** The test name, read the way the compiler reads it: the called name of `is test(...)`, else the test itself. */
function testName(node: TemplateNode): unknown {
    const right = property(node, 'right');
    return property(right, 'name') || right;
}

function isNode(value: unknown): value is TemplateNode {
    return value instanceof NUNJUCKS.nodes.Node;
}

/** A node's field, or `undefined` when the value is not a node. */
function property(node: unknown, key: string): unknown {
    return isNode(node) ? (node as unknown as { readonly [field: string]: unknown })[key] : undefined;
}

function asArray(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
}

/** The text of a symbol or of a quoted string, or `undefined` for any other node. */
function nameValue(node: unknown): string | undefined {
    if (!isNode(node) || (node.typename !== 'Symbol' && node.typename !== 'Literal')) {
        return undefined;
    }
    const value = property(node, 'value');
    return typeof value === 'string' ? value : undefined;
}

function refusal(reason: string, node: TemplateNode): TemplateSandboxError {
    return new TemplateSandboxError(`${reason} (line ${node.lineno + 1}, column ${node.colno + 1})`);
}
