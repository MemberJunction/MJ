/**
 * @fileoverview Refuses nunjucks templates whose names could change the code nunjucks compiles.
 *
 * The nunjucks 3.2.4 compiler copies template-controlled names into the JavaScript it generates
 * without escaping them. That covers variable, filter, test and loop names; the names that `set`,
 * `macro`, `import` and `from` bind; and the name of a called member. The generated code runs when
 * the template renders, so the runtime guard in `NunjucksSandbox.ts` never sees it. nunjucks also
 * reads and writes template names as keys of plain objects, so a name that every object inherits is
 * refused wherever template text names something other than a bare variable.
 * {@link AssertTemplateTreeIsSafe} checks a parsed template before it compiles.
 * @module @memberjunction/templates
 */
import nunjucks from 'nunjucks';
import { IsInheritedMemberName } from './InheritedMemberNames';
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

/**
 * Letters, combining marks, decimal digits, connector punctuation (such as `_`) and `$`. Each one is safe
 * inside a JavaScript string. In a raw identifier, a character that cannot start it (a digit, a mark, or
 * connector punctuation other than `_`) or cannot appear in it at all (U+2E2F) only makes the generated
 * code fail with a SyntaxError.
 */
const PLAIN_NAME = /^[\p{L}\p{Mn}\p{Mc}\p{Nd}\p{Pc}$]+$/u;

/** A filter name can also contain dots (`{{ x | ns.filter }}`). */
const PLAIN_FILTER_NAME = /^[\p{L}\p{Mn}\p{Mc}\p{Nd}\p{Pc}$]+(?:\.[\p{L}\p{Mn}\p{Mc}\p{Nd}\p{Pc}$]+)*$/u;

/** Characters that end a double-quoted JavaScript string, or escape out of it. */
const UNSAFE_STRING_CHARACTERS = /["\\\r\n\u2028\u2029]/;

/** The compiler escapes `"` in a called member's name, so only these characters can end that string. */
const UNSAFE_CALL_NAME_CHARACTERS = /[\\\r\n\u2028\u2029]/;

/**
 * Identifiers that the generated code of a loop body uses (nunjucks 3.2.4). An async loop binds its loop
 * variables as raw function parameters, so a loop variable with one of these names shadows them.
 * `NunjucksCompileGuard.test.ts` compiles every kind of loop body and checks this list against the
 * generated code.
 */
const RESERVED_LOOP_NAMES: ReadonlySet<string> = new Set([
    'env', 'context', 'frame', 'runtime', 'cb', 'next', 'lineno', 'colno', 'output', 'tasks',
    'parentTemplate', 'callerFrame', 'kwargs', 'Object', 'Math', 'Error', 'undefined', 'Infinity',
]);

/** Prefixes of generated identifiers: temporaries (`t_3`, `macro_t_3`, `hole_0`), blocks (`b_`), macro arguments (`l_`). */
const RESERVED_LOOP_NAME_PREFIX = /^(?:t|macro_t|hole|b|l)_/;

/**
 * Checks a parsed nunjucks template, and throws a {@link TemplateSandboxError} if a name in it could
 * change the code the compiler generates:
 * - every variable, filter, loop, `set`, macro, import and block name must be a plain name (letters,
 *   combining marks, digits, connector punctuation such as `_`, and `$`); a filter name can also contain dots
 * - a test name, and an extension's registered name and method, must not contain a quote, a backslash or a line break
 * - a name that every object inherits (`toString`, `hasOwnProperty`, ...), or `prototype`, must not be a
 *   dictionary key, a keyword argument, a macro or call-block argument, a `set`, loop, import, macro or
 *   block name, a literal member name (`obj.name`, `obj["name"]`), or a filter or test name
 * - the name of a called member must not contain a backslash or a line break
 * - a loop variable must not reuse an identifier that the generated loop code uses (`context`, `frame`,
 *   `runtime`, `tasks`, `undefined`, ...)
 * - the tree must hold only nunjucks nodes, plain values and regular expression literals
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

    /**
     * Checks a value of the tree and everything under it.
     * @param owner the node whose field holds the value
     * @param field the name of that field
     */
    public Visit(value: unknown, owner?: TemplateNode, field?: string): void {
        if (Array.isArray(value)) {
            asArray(value).forEach((item) => this.Visit(item, owner, field));
            return;
        }
        if (!isNode(value)) {
            if (!isPlainValue(value) && !isPatternLiteral(value, owner, field)) {
                throw refusal('Template parse trees may only hold nunjucks nodes, plain values and regular expressions', owner);
            }
            return;
        }
        if (this.visited.has(value)) {
            return;
        }
        this.visited.add(value);
        this.checkNode(value);
        for (const key of Object.keys(value)) {
            this.Visit(property(value, key), value, key);
        }
    }

    private checkNode(node: TemplateNode): void {
        switch (node.typename) {
            case 'Symbol':
                return this.checkName(node, node, this.filterNames.has(node) ? PLAIN_FILTER_NAME : PLAIN_NAME);
            case 'Pair':
                return this.refuseInheritedName(nameValue(property(node, 'key')), node, 'a dictionary key or keyword argument');
            case 'LookupVal':
                return this.checkMemberName(node);
            case 'Filter':
            case 'FilterAsync':
                return this.checkFilterName(node);
            case 'Is':
                return this.checkTestName(node);
            case 'FunCall':
                return this.checkCallName(node);
            case 'Set':
                return asArray(property(node, 'targets')).forEach((target) => this.checkBindingName(target, node));
            case 'For':
            case 'AsyncEach':
            case 'AsyncAll':
                return this.checkLoopNames(node);
            case 'Macro':
            case 'Caller':
                return this.checkMacroNames(node);
            case 'Import':
                return this.checkBindingName(property(node, 'target'), node);
            case 'FromImport':
                return this.checkImportedNames(node);
            case 'Block':
                return this.checkBindingName(property(node, 'name'), node);
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
            throw refusal('Templates may only use plain names (letters, marks, digits, _ and $)', owner);
        }
    }

    /** The one rule for every position that names something: a name that `IsInheritedMemberName` matches is refused. */
    private refuseInheritedName(name: string | undefined, owner: TemplateNode, position: string): void {
        if (name !== undefined && IsInheritedMemberName(name)) {
            throw refusal(`Templates may not use "${name}" as ${position}`, owner);
        }
    }

    /** A name that `set`, a loop, `import`, `from` or `macro` binds as a variable, or a block name. */
    private checkBindingName(nameNode: unknown, owner: TemplateNode): void {
        this.checkName(nameNode, owner);
        this.refuseInheritedName(nameValue(nameNode), owner, 'a variable, macro or block name');
    }

    /** A literal member name (`obj.name`, `obj["name"]`). The runtime guard checks a name computed while rendering. */
    private checkMemberName(node: TemplateNode): void {
        const key = property(node, 'val');
        if (isNode(key) && key.typename === 'Literal') {
            this.refuseInheritedName(nameValue(key), node, 'a member name');
        }
    }

    /** nunjucks finds a filter in a plain object, so a name it inherits would resolve to the inherited member. */
    private checkFilterName(node: TemplateNode): void {
        const name = property(node, 'name');
        if (isNode(name)) {
            this.filterNames.add(name);
        }
        this.checkName(name, node, PLAIN_FILTER_NAME);
        this.refuseInheritedName(nameValue(name), node, 'a filter or test name');
    }

    /** The compiler writes the test name into a double-quoted string, as text and without escaping it. */
    private checkTestName(node: TemplateNode): void {
        const name = testName(node);
        if (UNSAFE_STRING_CHARACTERS.test(name)) {
            throw refusal('Templates may not use a test name that contains a quote, a backslash or a line break', node);
        }
        this.refuseInheritedName(name, node, 'a filter or test name');
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
            this.checkBindingName(loopName, node);
            const value = nameValue(loopName) ?? '';
            if (RESERVED_LOOP_NAMES.has(value) || RESERVED_LOOP_NAME_PREFIX.test(value)) {
                throw refusal(`Templates may not use "${value}" as a loop variable`, node);
            }
        }
    }

    /** Positional arguments, and the keys of a trailing keyword-argument dictionary, become names. */
    private checkMacroNames(node: TemplateNode): void {
        this.checkBindingName(property(node, 'name'), node);
        const args = asArray(property(property(node, 'args'), 'children'));
        args.forEach((arg, index) => {
            const isKeywordArguments = index === args.length - 1 && isNode(arg) && (arg.typename === 'Dict' || arg.typename === 'KeywordArgs');
            if (!isKeywordArguments) {
                this.checkArgumentName(arg, node);
                return;
            }
            asArray(property(arg, 'children')).forEach((pair) => this.checkArgumentName(property(pair, 'key'), node));
        });
    }

    /**
     * A macro or call-block argument. When a call leaves out a positional argument, nunjucks fills it from the
     * call's keyword arguments, so an argument named after a member every object inherits would read that member.
     */
    private checkArgumentName(nameNode: unknown, owner: TemplateNode): void {
        this.checkName(nameNode, owner);
        this.refuseInheritedName(nameValue(nameNode), owner, 'a macro or call-block argument');
    }

    /** The names `from ... import` reads from the imported template, and the names it binds. */
    private checkImportedNames(node: TemplateNode): void {
        for (const entry of asArray(property(property(node, 'names'), 'children'))) {
            if (isNode(entry) && entry.typename === 'Pair') {
                this.checkBindingName(property(entry, 'key'), node);
                this.checkBindingName(property(entry, 'value'), node);
            } else {
                this.checkBindingName(entry, node);
            }
        }
    }

    /** The compiler writes an extension tag's registered name and method into double-quoted strings. */
    private checkExtensionCall(node: TemplateNode): void {
        for (const value of [property(node, 'extName'), property(node, 'prop')]) {
            if (typeof value !== 'string' || UNSAFE_STRING_CHARACTERS.test(value)) {
                throw refusal('Template extensions must have names without a quote, a backslash or a line break', node);
            }
        }
    }
}

/**
 * The test name as the compiler writes it: the text of the called name's value for `is test(...)`,
 * else the text of the test's own value. `is none` gives `"null"`.
 */
function testName(node: TemplateNode): string {
    const test = property(node, 'right');
    const calledName = property(test, 'name');
    return String(calledName ? property(calledName, 'value') : property(test, 'value'));
}

function isNode(value: unknown): value is TemplateNode {
    return value instanceof NUNJUCKS.nodes.Node;
}

/** `undefined`, `null`, a string, a number or a boolean. */
function isPlainValue(value: unknown): boolean {
    return value === undefined || value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** A regular expression literal (`r/.../`), which the parser stores as the value of a Literal node. */
function isPatternLiteral(value: unknown, owner: TemplateNode | undefined, field: string | undefined): boolean {
    return value instanceof RegExp && owner?.typename === 'Literal' && field === 'value';
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

/** The error for a refused template, with the node's position when the node has one. */
function refusal(reason: string, node: TemplateNode | undefined): TemplateSandboxError {
    const hasPosition = node !== undefined && Number.isInteger(node.lineno) && Number.isInteger(node.colno);
    return new TemplateSandboxError(hasPosition ? `${reason} (line ${node.lineno + 1}, column ${node.colno + 1})` : reason);
}
