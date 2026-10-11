/**
 * The compile guard checks every template nunjucks parses, before it compiles, because the compiler
 * copies template-controlled names into the code it generates. These tests use plain
 * `nunjucks.Environment` instances, so they also cover environments that other packages create.
 * Each refused input only puts a quote, a backslash or a line break into a name; none runs anything.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import nunjucks from 'nunjucks';
import ts from 'typescript';
import { HardenNunjucksRuntime } from '../NunjucksSandbox';
import { TemplateSandboxError } from '../TemplateSandboxError';

/** The nunjucks parser, as the compiler calls it. */
const parser = (nunjucks as unknown as { parser: { parse(src: string): object } }).parser;

/** The nunjucks compiler. `compile` turns template text into JavaScript source; `Compiler` has one `compile<Node>` method per node type. */
const compiler = (nunjucks as unknown as {
    compiler: {
        compile(src: string, asyncFilters: string[], extensions: object[], name: string | undefined, opts: object): string;
        Compiler: { prototype: object };
    };
}).compiler;

/** The parts of the nunjucks parser and node classes the test extensions use. */
interface ProbeParser {
    nextToken(): { value: string };
    parseSignature(tolerant: null, noParens: boolean): object;
    parseUntilBlocks(...blockNames: string[]): object;
    advanceAfterBlockEnd(name?: string): void;
}
type ExtensionCallClass = new (extension: object, method: string, args: object | null, contentArgs: object[]) => object;
interface ProbeNodes {
    CallExtension: ExtensionCallClass;
    CallExtensionAsync: ExtensionCallClass;
    Output: new (lineno: number, colno: number, children: unknown[]) => object;
    Literal: new (lineno: number, colno: number, value: unknown) => object;
}

/** Extension tags with arguments and a body, one sync and one async, so the loop fixture covers extension calls. */
const PROBE_EXTENSION = {
    tags: ['probesync', 'probeasync'],
    __name: 'ProbeExt',
    parse(parser: ProbeParser, nodes: ProbeNodes): object {
        const tag = parser.nextToken();
        const args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tag.value);
        const body = parser.parseUntilBlocks(`end${tag.value}`);
        parser.advanceAfterBlockEnd();
        const CallNode = tag.value === 'probeasync' ? nodes.CallExtensionAsync : nodes.CallExtension;
        return new CallNode(this, 'run', args, [body]);
    },
};

/** The fixture's loop variables. No other name in the fixture uses them. */
const FIXTURE_LOOP_NAMES: ReadonlySet<string> = new Set(['item', 'item2', 'inner']);

/** Every kind of loop: async, parallel and key-value loops, and sync loops with and without async content. */
const LOOP_FORMS: ReadonlyArray<(body: string) => string> = [
    (body) => `{% asyncEach item in items %}${body}{% endeach %}`,
    (body) => `{% asyncEach item, item2 in items %}${body}{% endeach %}`,
    (body) => `{% asyncAll item in items %}${body}{% endall %}`,
    (body) => `{% for item in items %}${body}{% endfor %}`,
    (body) => `{% for item, item2 in items %}${body}{% else %}empty{% endfor %}`,
    // nunjucks compiles a sync loop that holds async content as an async loop.
    (body) => `{% for item in items %}${body}{{ item | asyncF }}{% endfor %}`,
    (body) => `{% for item, item2 in items %}${body}{% probeasync %}{% endprobeasync %}{% endfor %}`,
];

/** Every construct the compiler can put in a loop body. Each is compiled alone, so its code sits directly in the loop. */
const LOOP_BODY_CONSTRUCTS = [
    'text {{ item }}{{ item.member }}{{ item["key"] }}{{ fn(item) }}{{ fn(item, key=1) }}{{ item.method() }}',
    `{{ "lit" }}{{ 3 }}{{ 3.5 }}{{ true }}{{ none }}{{ r/re/g }}{{ ${'9'.repeat(400)} }}`,
    '{{ [1, item] }}{{ {a: 1, "b": item} }}{{ (item, 1) }}',
    '{{ item + 1 }}{{ item - 1 }}{{ item * 2 }}{{ item / 2 }}{{ item % 2 }}{{ item // 2 }}{{ item ** 2 }}{{ -item }}{{ +item }}',
    '{{ "a" ~ item }}{{ item == 1 }}{{ item < 2 <= 3 }}{{ item or 1 }}{{ item and 1 }}{{ not item }}{{ item in items }}',
    '{{ item is defined }}{{ item is divisibleby(3) }}{{ 1 if item else 2 }}{{ 1 if item }}',
    '{{ item | upper }}{{ item | replace("a", "b") }}{{ item | asyncF }}',
    '{% filter upper %}text{% endfilter %}{% filter asyncF %}text{% endfilter %}',
    '{% if item %}a{% elif items %}b{% else %}c{% endif %}', '{% if item %}{{ item | asyncF }}{% endif %}',
    '{% switch item %}{% case 1 %}one{% case 2 %}{% default %}other{% endswitch %}',
    '{% set x = item %}{{ x }}{% set p, q = 1 %}', '{% set y %}captured {{ item }}{% endset %}',
    '{% for inner in items %}{{ inner }}{% endfor %}', '{% asyncEach inner in items %}{{ inner }}{% endeach %}',
    '{% asyncAll inner in items %}{{ inner }}{% endall %}',
    '{% macro m(a, b=2) %}{{ a }}{{ caller() if caller }}{% endmacro %}{{ m(1) }}{{ m(1, b=3) }}',
    '{% macro m() %}{{ caller(1) }}{% endmacro %}{% call(x) m() %}{{ x }}{% endcall %}',
    '{% include "child" %}{% include "maybe" ignore missing %}',
    '{% import "lib" as lib %}{% import "lib" as lib2 with context %}{{ lib.helper() }}',
    '{% from "lib" import helper, other as alias %}{% from "lib" import more with context %}{{ helper() }}',
    '{% extends "parent" %}', '{% block blk %}body{% endblock %}', '{% block blk2 %}{{ super() }}{% endblock %}',
    '{% probesync item, 1 %}body {{ item }}{% endprobesync %}', '{% probeasync item %}body {{ item }}{% endprobeasync %}',
    '{% macro m() %}{% asyncEach inner in items %}{{ inner }}{% endeach %}{% endmacro %}',
    '{% macro mm(a) %}{% asyncEach inner in items %}{{ a }}{% endeach %}{% endmacro %}',
    '{% block blk3 %}{% asyncEach inner in items %}{{ super() }}{% endeach %}{% endblock %}',
    '{% set y %}{% asyncEach inner in items %}{{ inner }}{% endeach %}{% endset %}',
    '{% probesync %}{% asyncEach inner in items %}{{ inner }}{% endeach %}{% endprobesync %}',
    '{{ range(3) }}{{ cycler(1, 2).next() }}{{ joiner()() }}{{ loop.index }}{{ loop.first }}', '{% raw %}{{ item }}{% endraw %}',
];

/** The one `compile<Node>` method template text never reaches: the parser wraps text in Output nodes, which compile it inline. */
const UNREACHABLE_COMPILE_METHODS = ['compileTemplateData'];

/** Each fixture compiles with and without a template name (engine renders have none), and with and without `throwOnUndefined`. */
const COMPILE_VARIANTS: ReadonlyArray<readonly [string | undefined, object]> = [
    [undefined, {}], [undefined, { throwOnUndefined: true }], ['named.njk', {}], ['named.njk', { throwOnUndefined: true }],
];

type FunctionNode = ts.FunctionExpression | ts.FunctionDeclaration | ts.ArrowFunction;

function isFunctionNode(node: ts.Node): node is FunctionNode {
    return ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node) || ts.isArrowFunction(node);
}

/** True for a member name (`a.name`) or an object literal key, which do not name a variable. */
function isPropertyName(id: ts.Identifier): boolean {
    const parent = id.parent;
    return (ts.isPropertyAccessExpression(parent) && parent.name === id) || (ts.isPropertyAssignment(parent) && parent.name === id);
}

/** Calls the callback for every identifier under the node that names a variable. */
function forEachVariable(root: ts.Node, callback: (id: ts.Identifier) => void): void {
    const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && !isPropertyName(node)) {
            callback(node);
        }
        ts.forEachChild(node, visit);
    };
    visit(root);
}

/** How a function or catch clause binds a name: as a parameter, by a declaration in its own body, or not at all. */
function bindingOf(scope: ts.Node, name: string): 'parameter' | 'declaration' | undefined {
    if (ts.isCatchClause(scope)) {
        const declaration = scope.variableDeclaration;
        return declaration && ts.isIdentifier(declaration.name) && declaration.name.text === name ? 'parameter' : undefined;
    }
    if (!isFunctionNode(scope)) {
        return undefined;
    }
    if (scope.parameters.some((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === name)) {
        return 'parameter';
    }
    if (ts.isFunctionExpression(scope) && scope.name?.text === name) {
        return 'declaration';
    }
    return scope.body && declaresInOwnBody(scope.body, name) ? 'declaration' : undefined;
}

/** True when a `var` or a function declaration in the body, outside nested functions, declares the name. */
function declaresInOwnBody(body: ts.Node, name: string): boolean {
    let found = false;
    const visit = (node: ts.Node): void => {
        if (found) {
            return;
        }
        if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name && ts.isIdentifier(node.name) && node.name.text === name) {
            found = true;
        } else if (!isFunctionNode(node)) {
            ts.forEachChild(node, visit);
        }
    };
    ts.forEachChild(body, visit);
    return found;
}

/** The closest function or catch clause around the identifier that binds its name. */
function bindingScope(id: ts.Identifier): ts.Node | undefined {
    for (let node: ts.Node | undefined = id.parent; node !== undefined; node = node.parent) {
        if (bindingOf(node, id.text) !== undefined) {
            return node;
        }
    }
    return undefined;
}

/** True when a function or catch clause between the identifier and the loop function binds the name. */
function isBoundInside(id: ts.Identifier, loopFunction: FunctionNode): boolean {
    for (let node: ts.Node = id.parent; node !== loopFunction; node = node.parent) {
        if (bindingOf(node, id.text) !== undefined) {
            return true;
        }
    }
    return false;
}

/**
 * Parses compiled template code and returns the identifiers its loop functions use, other than the
 * fixture's loop variables. A loop function takes a fixture loop variable as a parameter, which is how
 * nunjucks compiles an async loop. The identifiers are its parameters, and every variable its body uses
 * that no nested function or catch clause binds. Any other way of binding a loop variable fails the test.
 */
function loopFunctionIdentifiers(code: string): { names: string[]; loopFunctions: number } {
    const source = ts.createSourceFile('compiled.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const loopFunctions = new Set<FunctionNode>();
    forEachVariable(source, (id) => {
        if (!FIXTURE_LOOP_NAMES.has(id.text)) {
            return;
        }
        const scope = bindingScope(id);
        if (scope === undefined || !isFunctionNode(scope) || bindingOf(scope, id.text) !== 'parameter') {
            throw new Error(`The compiled code binds the loop variable "${id.text}" other than as a function parameter; extend this test`);
        }
        loopFunctions.add(scope);
    });
    const names: string[] = [];
    loopFunctions.forEach((loopFunction) => forEachVariable(loopFunction, (id) => {
        if (!isBoundInside(id, loopFunction)) {
            names.push(id.text);
        }
    }));
    return { names: names.filter((name) => !FIXTURE_LOOP_NAMES.has(name)), loopFunctions: loopFunctions.size };
}

/** Compiles every loop-body construct in every loop form, and collects the identifiers the loop functions use. */
function compileLoopFixture(): { names: Set<string>; loopFunctions: number } {
    const names = new Set<string>();
    let loopFunctions = 0;
    for (const construct of LOOP_BODY_CONSTRUCTS) {
        for (const loopForm of LOOP_FORMS) {
            for (const [templateName, options] of COMPILE_VARIANTS) {
                const code = compiler.compile(loopForm(construct), ['asyncF'], [PROBE_EXTENSION], templateName, options);
                const result = loopFunctionIdentifiers(code);
                result.names.forEach((name) => names.add(name));
                loopFunctions += result.loopFunctions;
            }
        }
    }
    return { names, loopFunctions };
}

/** Runs the callback and returns its result, with the `compile<Node>` methods of the nunjucks compiler that never ran. */
function withCompileMethodCoverage<T>(callback: () => T): { result: T; notReached: string[] } {
    const prototype = compiler.Compiler.prototype as Record<string, unknown>;
    const methodNames = Object.getOwnPropertyNames(prototype).filter((key) => /^compile[A-Z]/.test(key) && typeof prototype[key] === 'function');
    const originals = new Map(methodNames.map((key) => [key, prototype[key] as (this: object, ...args: unknown[]) => unknown]));
    const reached = new Set<string>();
    originals.forEach((original, key) => {
        prototype[key] = function recordCall(this: object, ...args: unknown[]): unknown {
            reached.add(key);
            return original.apply(this, args);
        };
    });
    try {
        return { result: callback(), notReached: methodNames.filter((key) => !reached.has(key)) };
    } finally {
        originals.forEach((original, key) => {
            prototype[key] = original;
        });
    }
}

/** A loader that serves one in-memory template, for the include and import paths. */
function environmentServing(childSource: string): nunjucks.Environment {
    const loader = { getSource: (name: string) => ({ src: childSource, path: name, noCache: true }) };
    return new nunjucks.Environment(loader as unknown as nunjucks.ILoader);
}

/**
 * Renders with a callback, as the MJ template engine does. nunjucks reports a compile error in an
 * included template to that callback, not as a synchronous throw.
 */
function renderWithCallback(env: nunjucks.Environment, templateText: string, data: object = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        env.renderString(templateText, data, (err, result) => (err ? reject(err) : resolve(result ?? '')));
    });
}

function renderPlain(templateText: string, data: object = {}): string {
    const env = new nunjucks.Environment(null, { autoescape: false });
    env.addFilter('ns.upper', (value: string) => value.toUpperCase());
    return env.renderString(templateText, data);
}

/** What the callback throws, or `undefined` when it does not throw. */
function thrownBy(callback: () => unknown): unknown {
    try {
        callback();
    } catch (error) {
        return error;
    }
    return undefined;
}

/** The message of the error the callback throws, or an empty string when it does not throw. */
function thrownMessage(callback: () => unknown): string {
    const error = thrownBy(callback);
    return error instanceof Error ? error.message : '';
}

/** True when the guard refuses the name as the variable of a sync loop and of an async loop. */
function isRefusedAsLoopVariable(name: string): boolean {
    return [`{% for ${name} in items %}{% endfor %}`, `{% asyncEach ${name} in items %}{% endeach %}`]
        .every((templateText) => thrownBy(() => parser.parse(templateText)) instanceof TemplateSandboxError);
}

beforeAll(() => {
    HardenNunjucksRuntime();
});

describe('compile guard: names', () => {
    it('checks every template the nunjucks parser reads', () => {
        expect(() => parser.parse('{{ a"b }}')).toThrow(TemplateSandboxError);
    });

    it.each([
        ['a variable name with a quote', '{{ a"b }}'],
        ['a variable name with a backslash', '{{ a\\b }}'],
        ['a variable name with a backtick', '{{ a`b }}'],
        ['a filter name with a quote', '{{ x | a"b }}'],
        ['a dotted filter name with a quote', '{{ x | ns.a"b }}'],
        ['an is-test name with a quote', `{{ 1 is 'a"b' }}`],
        ['a set target with a quote', '{% set "a\\"b" = 1 %}'],
        ['a name inside a set block', '{% set v %}{{ a"b }}{% endset %}'],
        ['a second loop variable with a quote', '{% for k, "a\\"b" in x %}{% endfor %}'],
        ['a macro name with a quote', '{% macro "a\\"b"() %}{% endmacro %}'],
        ['a macro keyword argument with a quote', '{% macro m("a\\"b"=1) %}{% endmacro %}'],
        ['a call-block keyword argument with a quote', '{% macro m() %}{% endmacro %}{% call("a\\"b"=1) m() %}{% endcall %}'],
        ['an import alias with a quote', '{% import "x" as "a\\"b" %}'],
        ['a from-import name with a quote', '{% from "x" import "a\\"b" %}'],
        ['a from-import alias with a quote', '{% from "x" import a as "b\\"c" %}'],
        ['a block name with a quote', '{% block a"b %}{% endblock %}'],
    ])('refuses %s', (_name, templateText) => {
        expect(() => renderPlain(templateText)).toThrow(TemplateSandboxError.name);
    });

    it('reports where the refused name is', () => {
        expect(() => renderPlain('ok\n  {{ a"b }}')).toThrow(/line 2, column \d+/);
    });
});

describe('compile guard: called members', () => {
    it.each([
        ['a backslash', `{{ foo['a\\\\b']() }}`],
        ['a line feed', `{{ foo['a\\nb']() }}`],
        ['a carriage return', `{{ foo['a\\rb']() }}`],
        ['a line separator', '{{ foo[\'a\u2028b\']() }}'],
        ['a backslash in a nested member', `{{ foo.bar['a\\\\b'].baz() }}`],
    ])('refuses a called member whose name contains %s', (_name, templateText) => {
        expect(() => renderPlain(templateText)).toThrow(TemplateSandboxError.name);
    });

    it('accepts a called member whose name has spaces and quotes', () => {
        expect(renderPlain(`{{ greet["say \\"hi\\""]() }}`, { greet: { 'say "hi"': () => 'hi' } })).toBe('hi');
    });
});

describe('compile guard: loop variables', () => {
    it.each(['env', 'context', 'frame', 'runtime', 'cb', 'next', 'output', 'tasks', 'undefined', 'Object', 't_1', 'l_x', 'b_x'])(
        'refuses %s as a loop variable, in for and in asyncEach',
        (name) => {
            expect(() => renderPlain(`{% for ${name} in [1] %}{% endfor %}`)).toThrow(TemplateSandboxError.name);
            expect(() => renderPlain(`{% asyncEach ${name} in [1] %}{% endeach %}`)).toThrow(TemplateSandboxError.name);
        },
    );

    it('refuses, as a loop variable, every identifier that the compiled loop code uses', () => {
        const { result: fixture, notReached } = withCompileMethodCoverage(compileLoopFixture);
        // The fixture must reach every kind of node the compiler handles and produce loop functions,
        // or the check below proves nothing.
        expect(notReached).toEqual(UNREACHABLE_COMPILE_METHODS);
        expect(fixture.loopFunctions).toBeGreaterThan(0);
        expect([...fixture.names]).toEqual(expect.arrayContaining(['runtime', 'context', 'frame', 'env', 'cb', 'next', 'tasks', 'undefined']));
        expect([...fixture.names].filter((name) => !isRefusedAsLoopVariable(name)).sort()).toEqual([]);
    });

    it('accepts ordinary loop variables, including a key-value pair', () => {
        expect(renderPlain('{% for item in [1, 2] %}{{ item }}{% endfor %}|{% for k, v in obj %}{{ k }}{{ v }}{% endfor %}', {
            obj: { a: 1 },
        })).toBe('12|a1');
    });
});

describe('compile guard: every compile path', () => {
    it('checks a template loaded through include', async () => {
        await expect(renderWithCallback(environmentServing('{{ a"b }}'), '{% include "child" %}'))
            .rejects.toThrow(TemplateSandboxError.name);
    });

    it('checks a template loaded through import', async () => {
        await expect(renderWithCallback(environmentServing('{% macro m() %}{{ a"b }}{% endmacro %}'), '{% import "child" as c %}{{ c.m() }}'))
            .rejects.toThrow(TemplateSandboxError.name);
    });

    it('checks a template loaded through extends', async () => {
        await expect(renderWithCallback(environmentServing('{{ a"b }}'), '{% extends "parent" %}'))
            .rejects.toThrow(TemplateSandboxError.name);
    });

    it('still renders an ordinary included template', async () => {
        await expect(renderWithCallback(environmentServing('child:{{ v }}'), '{% include "child" %}', { v: 1 })).resolves.toBe('child:1');
    });
});

describe('compile guard: is-tests', () => {
    it.each([
        ['is none', '{% if v is none %}empty{% endif %}', { v: null }, 'empty'],
        ['is not none', '{% if v is not none %}set{% endif %}', { v: 1 }, 'set'],
        ['is null', '{{ v is null }}', { v: null }, 'true'],
    ])('renders %s as nunjucks does', (_name, templateText, data, expected) => {
        expect(renderPlain(templateText, data)).toBe(expected);
    });

    it.each([
        ['a backslash', `{{ 1 is 'a\\\\b' }}`],
        ['a line break', `{{ 1 is 'a\\nb' }}`],
        ['a quote, written as a regular expression', '{{ 1 is r/a"b/ }}'],
    ])('refuses an is-test name with %s', (_name, templateText) => {
        expect(() => renderPlain(templateText)).toThrow(TemplateSandboxError.name);
    });
});

describe('compile guard: filter and test names', () => {
    it('refuses filter and test names that resolve to members every object inherits', () => {
        const unrefused = Object.getOwnPropertyNames(Object.prototype)
            .flatMap((name) => [`{{ 1 | ${name} }}`, `{% filter ${name} %}x{% endfilter %}`, `{{ 1 is ${name} }}`])
            .filter((templateText) => !(thrownBy(() => parser.parse(templateText)) instanceof TemplateSandboxError));
        expect(unrefused).toEqual([]);
    });

    it('still compiles registered filters and tests, including dotted filter names', () => {
        expect(renderPlain('{{ "a" | upper }}|{{ "b" | ns.upper }}|{{ 3 is odd }}|{% filter upper %}c{% endfilter %}')).toBe('A|B|true|C');
    });
});

describe('compile guard: macro and call-block arguments', () => {
    it('refuses argument names that every object inherits, positional or with a default', () => {
        const unrefused = Object.getOwnPropertyNames(Object.prototype)
            .flatMap((name) => [
                `{% macro m(${name}) %}{% endmacro %}`,
                `{% macro m(${name}=1) %}{% endmacro %}`,
                `{% macro m() %}{% endmacro %}{% call(${name}) m() %}{% endcall %}`,
                `{% macro m() %}{% endmacro %}{% call(${name}=1) m() %}{% endcall %}`,
            ])
            .filter((templateText) => !(thrownBy(() => parser.parse(templateText)) instanceof TemplateSandboxError));
        expect(unrefused).toEqual([]);
    });

    it('still accepts ordinary argument names, and an argument the call leaves out reads as empty', () => {
        expect(renderPlain('{% macro m(a, b, c=3) %}[{{ a }}][{{ b }}][{{ c }}]{% endmacro %}{{ m(1) }}')).toBe('[1][][3]');
    });
});

describe('compile guard: extensions', () => {
    /** A tag extension that renders "ok", registered under the given key. */
    function environmentWithExtension(key: string): nunjucks.Environment {
        const env = new nunjucks.Environment(null);
        const extension = {
            tags: ['probe'],
            parse(parser: ProbeParser, nodes: ProbeNodes): object {
                const tag = parser.nextToken();
                parser.advanceAfterBlockEnd(tag.value);
                return new nodes.CallExtension(this, 'run', null, []);
            },
            run: () => 'ok',
        };
        env.addExtension(key, extension);
        return env;
    }

    /** An environment with a `{% fake %}` tag whose extension returns the tree that `build` makes. */
    function environmentWithTree(build: (nodes: ProbeNodes) => object): nunjucks.Environment {
        const env = new nunjucks.Environment(null);
        env.addExtension('Fake', {
            tags: ['fake'],
            parse(parser: ProbeParser, nodes: ProbeNodes): object {
                const tag = parser.nextToken();
                parser.advanceAfterBlockEnd(tag.value);
                return build(nodes);
            },
        });
        return env;
    }

    it('accepts an extension registered under a key with dots and hyphens', () => {
        expect(environmentWithExtension('probe-ext.v2').renderString('{% probe %}', {})).toBe('ok');
    });

    it('refuses an extension registered under a key with a quote', () => {
        expect(() => environmentWithExtension('probe"ext').renderString('{% probe %}', {})).toThrow(TemplateSandboxError.name);
    });

    it('leaves the position out of a refusal when the node has none', () => {
        const message = thrownMessage(() => environmentWithExtension('probe"ext').renderString('{% probe %}', {}));
        expect(message).toContain(TemplateSandboxError.name);
        expect(message).not.toContain('NaN');
    });

    it.each([
        ['an object that is not a nunjucks node', (nodes: ProbeNodes) => new nodes.Output(0, 0, [{ typename: 'Symbol', value: 'x' }])],
        ['a function as a literal value', (nodes: ProbeNodes) => new nodes.Output(0, 0, [new nodes.Literal(0, 0, () => 'x')])],
        ['a regular expression outside a literal', (nodes: ProbeNodes) => new nodes.Output(0, 0, [/x/])],
    ])('refuses a parse tree that holds %s', (_name, build) => {
        expect(() => environmentWithTree(build).renderString('{% fake %}', {})).toThrow(TemplateSandboxError.name);
    });
});

describe('compile guard: ordinary templates', () => {
    it('accepts names from any script, digits, _ and $, and dotted filter names', () => {
        expect(renderPlain('{{ città }}|{{ _x1 }}|{{ $y }}|{{ "a" | ns.upper }}', { città: 'Roma', _x1: 1, $y: 2 }))
            .toBe('Roma|1|2|A');
    });

    it('accepts names with combining marks and connector punctuation', () => {
        expect(renderPlain('{{ नाम }}|{{ ชื่อ }}|{{ a‿b }}', { नाम: 'a', ชื่อ: 'b', 'a‿b': 'c' })).toBe('a|b|c');
    });

    it('accepts is-tests written as names, calls and quoted names', () => {
        expect(renderPlain('{{ 1 is defined }}|{{ 6 is divisibleby(3) }}|{{ 1 is "defined" }}')).toBe('true|true|true');
    });

    it('accepts regular expression literals', () => {
        expect(renderPlain('{{ "aaa" | replace(r/a+/g, "b") }}')).toBe('b');
    });

    it('accepts macros with keyword arguments, call blocks, set blocks and multiple set targets', () => {
        expect(renderPlain(
            '{% macro m(a, b=2) %}{{ a }}{{ b }}{{ caller() if caller }}{% endmacro %}{% call m(1) %}!{% endcall %}|' +
            '{% set captured %}x{% endset %}{{ captured }}|{% set p, q = 3 %}{{ p }}{{ q }}',
        )).toBe('12!|x|33');
    });

    it('parses import and from-import with plain names', () => {
        expect(() => parser.parse('{% import "x" as lib %}{% from "x" import a, b as c %}')).not.toThrow();
    });
});
