/**
 * `HardenNunjucksRuntime` guards the nunjucks runtime module that every environment in the process
 * shares. These tests render through plain `nunjucks.Environment` instances, the way QueryProcessor,
 * SearchEngine and the Data Mapper action build theirs, to show the guard does not depend on the
 * MJ template engine. Every payload is harmless: it only sets a canary global and returns a marker.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import nunjucks from 'nunjucks';
import { HardenNunjucksRuntime } from '../NunjucksSandbox';
import { TemplateSandboxError } from '../TemplateSandboxError';

declare global {
    // Set only by template code that managed to run JavaScript.
    // eslint-disable-next-line no-var
    var __mjNunjucksSandboxCanary: string | undefined;
}

const CODE = `globalThis.__mjNunjucksSandboxCanary = 'ran'; return 'RAN'`;

/** The runtime functions the guard replaces, as nunjucks exposes them. */
interface RuntimeHooks {
    memberLookup: (obj: object, val: string) => object;
    contextOrFrameLookup: (context: object, frame: object, name: string) => object;
    callWrap: (obj: object, name: string, context: object, args: object[]) => object;
    makeMacro: (argNames: string[], kwargNames: string[], func: (...args: never[]) => unknown) => (...args: unknown[]) => unknown;
    makeKeywordArgs: (obj: object) => object;
}
const runtime = (nunjucks as unknown as { runtime: RuntimeHooks }).runtime;

/** The nunjucks code generator. `compile` turns a parse tree into JavaScript source. */
interface CompilerClass {
    new (templateName?: string, throwOnUndefined?: boolean): { compile(node: object): void };
    prototype: { compilePair: unknown };
}

/** A nunjucks parse-tree node class: the position, then the node's fields in order. */
type NodeClass = new (lineno: number, colno: number, ...fields: unknown[]) => object;
const { compiler, nodes } = nunjucks as unknown as {
    compiler: { Compiler: CompilerClass };
    nodes: Record<'Root' | 'Output' | 'Dict' | 'Pair' | 'Literal' | 'Symbol' | 'FunCall' | 'NodeList' | 'KeywordArgs', NodeClass>;
};

/** The nunjucks parser module and lexer, as the compiler uses them. */
interface ParserModule {
    parse: (src: string) => object;
    Parser: new (tokens: object) => { parseAsRoot(): object };
}
const { parser, lexer } = nunjucks as unknown as { parser: ParserModule; lexer: { lex(src: string): object } };

/** The environment methods that find a registered filter, test or global by name. nunjucks accepts any value as the name. */
interface EnvironmentRegistries {
    getFilter(name: unknown): unknown;
    getTest(name: unknown): unknown;
    getGlobal(name: unknown): unknown;
    addFilter(name: string, filter: (this: object, ...args: never[]) => unknown): void;
}

/** nunjucks classes whose instances only nunjucks itself uses. */
const { Template, Loader } = nunjucks as unknown as { Template: new (src: string) => object; Loader: new () => object };
const { Frame } = (nunjucks as unknown as { runtime: { Frame: new () => object } }).runtime;

/** Names every plain object inherits, such as `hasOwnProperty`. */
const INHERITED_NAMES = Object.getOwnPropertyNames(Object.prototype);

/** Names a dictionary key or keyword argument may not have: the inherited names, and `prototype`. */
const REFUSED_KEY_NAMES = [...INHERITED_NAMES, 'prototype'];

function renderPlain(templateText: string, data: object = {}): string {
    return new nunjucks.Environment(null, { autoescape: false }).renderString(templateText, data);
}

function newRegistries(): EnvironmentRegistries {
    return new nunjucks.Environment(null, { autoescape: false }) as unknown as EnvironmentRegistries;
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

/** True when the callback throws a sandbox refusal, directly or wrapped by nunjucks. */
function isRefused(callback: () => unknown): boolean {
    const error = thrownBy(callback);
    return error instanceof TemplateSandboxError || (error instanceof Error && error.message.includes(TemplateSandboxError.name));
}

beforeAll(() => {
    HardenNunjucksRuntime();
});

beforeEach(() => {
    delete globalThis.__mjNunjucksSandboxCanary;
});

afterEach(() => {
    delete globalThis.__mjNunjucksSandboxCanary;
});

describe('HardenNunjucksRuntime', () => {
    it('guards environments created outside the MJ template engine', () => {
        expect(() => renderPlain(`{{ range.constructor("${CODE}")() }}`)).toThrow();
        expect(() => renderPlain(`{{ "x".constructor.constructor("${CODE}")() }}`)).toThrow();
        expect(globalThis.__mjNunjucksSandboxCanary).toBeUndefined();
    });

    it('is idempotent: hardening again keeps the installed guards', () => {
        const installed = { ...runtime };
        const installedParse = parser.parse;
        const environmentPrototype = (nunjucks as unknown as { Environment: { prototype: EnvironmentRegistries } }).Environment.prototype;
        const { getFilter, getTest, getGlobal } = environmentPrototype;
        const { compilePair } = compiler.Compiler.prototype;

        HardenNunjucksRuntime();

        expect(runtime.memberLookup).toBe(installed.memberLookup);
        expect(runtime.contextOrFrameLookup).toBe(installed.contextOrFrameLookup);
        expect(runtime.callWrap).toBe(installed.callWrap);
        expect(runtime.makeMacro).toBe(installed.makeMacro);
        expect(runtime.makeKeywordArgs).toBe(installed.makeKeywordArgs);
        expect(compiler.Compiler.prototype.compilePair).toBe(compilePair);
        expect(parser.parse).toBe(installedParse);
        expect(environmentPrototype.getFilter).toBe(getFilter);
        expect(environmentPrototype.getTest).toBe(getTest);
        expect(environmentPrototype.getGlobal).toBe(getGlobal);
    });

    it('guards the parser again after something replaces it with an unguarded one', () => {
        const guarded = parser.parse;
        parser.parse = (src: string) => new parser.Parser(lexer.lex(src)).parseAsRoot();
        try {
            HardenNunjucksRuntime();
            expect(parser.parse).not.toBe(guarded);
            expect(() => renderPlain('{{ a"b }}')).toThrow(TemplateSandboxError.name);
        } finally {
            parser.parse = guarded;
        }
    });

    it('guards a hook again after something replaces it with an unguarded one', () => {
        const guarded = runtime.memberLookup;
        runtime.memberLookup = (obj, val) => Reflect.get(obj, val);
        try {
            HardenNunjucksRuntime();
            expect(runtime.memberLookup).not.toBe(guarded);
            expect(renderPlain('[{{ range[key] }}]', { key: 'constructor' })).toBe('[]');
        } finally {
            runtime.memberLookup = guarded;
        }
    });
});

/** Member names computed while rendering, which only the runtime guard sees. Literal names in this list do not compile. */
describe('member access', () => {
    it.each(['constructor', 'prototype', '__defineGetter__', '__lookupGetter__'])(
        'reads own data stored under the restricted name %s',
        (name) => {
            expect(renderPlain('[{{ data[key] }}]', { data: JSON.parse(`{"${name}": "own value"}`), key: name })).toBe('[own value]');
        },
    );

    it('never reads __proto__, even when the data defines it', () => {
        expect(renderPlain('[{{ data[key] }}]', { data: JSON.parse('{"__proto__": "own value"}'), key: '__proto__' })).toBe('[]');
    });

    it('does not read a restricted name that holds a function, that the value inherits, or that a function owns', () => {
        expect(renderPlain('[{{ data[c] }}][{{ plain[c] }}][{{ range[p] }}]', {
            data: { constructor: () => 'own function' },
            plain: {},
            c: 'constructor',
            p: 'prototype',
        })).toBe('[][][]');
    });

    it('still reads ordinary members, including MJ system fields', () => {
        expect(renderPlain('{{ r.Name }}|{{ r.__mj_UpdatedAt }}|{{ r.tags[0] }}', {
            r: { Name: 'Ada', __mj_UpdatedAt: '2026-10-08', tags: ['x'] },
        })).toBe('Ada|2026-10-08|x');
    });
});

describe('bare names', () => {
    it('do not resolve to properties the render data inherits', () => {
        expect(renderPlain('[{{ valueOf }}][{{ hasOwnProperty }}][{{ constructor }}]')).toBe('[][][]');
    });

    it('resolve to render data, template variables and globals', () => {
        expect(renderPlain('{% set v = "set" %}{{ data }}|{{ v }}|{% for n in range(2) %}{{ n }}{% endfor %}', { data: 'data' }))
            .toBe('data|set|01');
    });

    it('resolve to render data keys that shadow inherited names', () => {
        expect(renderPlain('{{ valueOf }}', { valueOf: 'own' })).toBe('own');
    });

    it('resolve a restricted name only to render data that is not a function', () => {
        expect(renderPlain('[{{ constructor }}]', { constructor: 'Acme Builders' })).toBe('[Acme Builders]');
        expect(renderPlain('[{{ constructor }}]', { constructor: () => 'own function' })).toBe('[]');
    });
});

describe('restricted values', () => {
    it('refuses to call Function even when server code passes it in the render data', () => {
        expect(() => renderPlain(`{{ fn("${CODE}")() }}`, { fn: Function })).toThrow(TemplateSandboxError.name);
        expect(globalThis.__mjNunjucksSandboxCanary).toBeUndefined();
    });

    it('refuses to read Function out of an object member', () => {
        expect(() => renderPlain(`{{ holder.make("${CODE}")() }}`, { holder: { make: Function } })).toThrow(TemplateSandboxError.name);
        expect(globalThis.__mjNunjucksSandboxCanary).toBeUndefined();
    });

    it('refuses a call that returns the render context', () => {
        const returnsThis = function (this: object): object { return this; };
        expect(() => renderPlain('{{ leak().env.opts.autoescape }}', { leak: returnsThis })).toThrow(TemplateSandboxError.name);
    });
});

describe('environment registries', () => {
    it('resolve a filter, test or global only to a name the environment registered itself', () => {
        const env = newRegistries();
        const unrefused = INHERITED_NAMES.flatMap((name) => [
            [`filter ${name}`, () => env.getFilter(name)],
            [`test ${name}`, () => env.getTest(name)],
            [`global ${name}`, () => env.getGlobal(name)],
        ] as const)
            .filter(([, lookup]) => !(thrownBy(lookup) instanceof TemplateSandboxError))
            .map(([label]) => label);
        expect(unrefused).toEqual([]);
    });

    it('refuse an inherited test name that a template passes to select or reject while it renders', () => {
        const unrefused = INHERITED_NAMES
            .flatMap((name) => [`{{ [1] | select("${name}") }}`, `{{ [1] | reject("${name}") }}`])
            .filter((templateText) => !isRefused(() => renderPlain(templateText)));
        expect(unrefused).toEqual([]);
    });

    it('refuse a name that is an object, before converting it, so nunjucks cannot read a key the guard did not check', () => {
        const env = newRegistries();
        let conversions = 0;
        const changingName = { toString: (): string => (conversions++ < 2 ? 'odd' : 'hasOwnProperty') };

        expect(thrownBy(() => env.getTest(changingName))).toBeInstanceOf(TemplateSandboxError);
        expect(conversions).toBe(0);
        expect(isRefused(() => renderPlain('{{ [1] | select(testName) }}', { testName: { toString: (): string => 'odd' } }))).toBe(true);
    });

    it('still resolve a name given as none or as a number, as nunjucks does', () => {
        const env = newRegistries();
        const numbered = (): string => 'numbered';
        env.addFilter('42', numbered);

        expect(renderPlain('{{ [none, 1] | select(none) | length }}|{{ [none, 1] | reject(none) | length }}')).toBe('1|1');
        expect(env.getFilter(42)).toBe(numbered);
    });

    it('still resolve registered names, and report a missing name as nunjucks does', () => {
        const env = newRegistries();
        const ownFilter = (): string => 'own';
        env.addFilter('toString', ownFilter);

        expect(typeof env.getFilter('upper')).toBe('function');
        expect(typeof env.getTest('odd')).toBe('function');
        expect(typeof env.getGlobal('range')).toBe('function');
        expect(env.getFilter('toString')).toBe(ownFilter);
        expect(() => env.getFilter('notRegistered')).toThrow('filter not found: notRegistered');
    });
});

describe('macro arguments and keyword arguments', () => {
    /** Keyword arguments, marked as nunjucks marks them, that inherit `inherited` instead of owning it. */
    function keywordArgumentsInheriting(inherited: object): object {
        return Object.assign(Object.create(inherited), { __keywords: true });
    }

    /** A parse tree that prints one expression. It is built by hand, so the parse-time check never sees it. */
    function treePrinting(expression: object): object {
        return new nodes.Root(0, 0, [new nodes.Output(0, 0, [expression])]);
    }

    function pairNamed(key: string): object {
        return new nodes.Pair(0, 0, new nodes.Literal(0, 0, key), new nodes.Literal(0, 0, 1));
    }

    function callWithKeywordArgument(key: string): object {
        return new nodes.FunCall(0, 0, new nodes.Symbol(0, 0, 'm'), new nodes.NodeList(0, 0, [new nodes.KeywordArgs(0, 0, [pairNamed(key)])]));
    }

    it('fill an omitted macro argument only from keyword arguments the call owns', () => {
        const echo = runtime.makeMacro(['a'], [], (a: unknown) => a);

        expect(echo(keywordArgumentsInheriting({ a: 'inherited-marker' }))).toBeUndefined();
        expect(runtime.makeMacro(['valueOf'], [], (value: unknown) => value)()).toBeUndefined();
        expect(echo({ a: 'own', __keywords: true })).toBe('own');
    });

    it('keep an omitted macro argument empty when render data passes keyword arguments that inherit a value', () => {
        expect(renderPlain('{% macro m(a) %}[{{ a }}]{% endmacro %}{{ m(kw) }}', { kw: keywordArgumentsInheriting({ a: 'MJ-MARKER' }) }))
            .toBe('[]');
    });

    it('store extra positional values as own keyword arguments, whatever keyword-argument names the macro defines', () => {
        const keywordArgumentsOf = runtime.makeMacro([], ['__proto__'], (kwargs: object) => kwargs);
        const kwargs = keywordArgumentsOf({ marker: 'inherited-marker' }) as Record<string, unknown>;

        expect(kwargs.marker).toBeUndefined();
        expect(Object.hasOwn(kwargs, '__proto__')).toBe(true);
    });

    it('refuse keyword arguments that inherit from anything but Object.prototype, or that use an inherited name', () => {
        expect(thrownBy(() => runtime.makeKeywordArgs(Object.create({ a: 1 })))).toBeInstanceOf(TemplateSandboxError);
        expect(REFUSED_KEY_NAMES.filter((name) => !(thrownBy(() => runtime.makeKeywordArgs({ [name]: 'x' })) instanceof TemplateSandboxError)))
            .toEqual([]);
    });

    it('mark ordinary keyword arguments as nunjucks does', () => {
        const kwargs = { a: 1 };
        expect(runtime.makeKeywordArgs(kwargs)).toBe(kwargs);
        expect(kwargs).toEqual({ a: 1, __keywords: true });
    });

    it('refuse, while generating code, a dictionary key or keyword argument that every object inherits', () => {
        const unrefused = REFUSED_KEY_NAMES
            .flatMap((name) => [
                [`dictionary key ${name}`, treePrinting(new nodes.Dict(0, 0, [pairNamed(name)]))],
                [`keyword argument ${name}`, treePrinting(callWithKeywordArgument(name))],
            ] as const)
            .filter(([, tree]) => !(thrownBy(() => new compiler.Compiler(undefined, false).compile(tree)) instanceof TemplateSandboxError))
            .map(([label]) => label);
        expect(unrefused).toEqual([]);
        expect(() => new compiler.Compiler(undefined, false).compile(treePrinting(new nodes.Dict(0, 0, [pairNamed('a')])))).not.toThrow();
        expect(() => new compiler.Compiler(undefined, false).compile(treePrinting(callWithKeywordArgument('a')))).not.toThrow();
    });

    it('render ordinary dictionaries, keyword arguments, macros and call blocks as nunjucks does', () => {
        const data = { items: [{ n: 'p' }, { n: 'q' }], kw: { a: 'own', __keywords: true } };

        expect(renderPlain('{% set d = {a: 1, "b c": 2, nested: {x: "y"} } %}{{ d.a }}|{{ d["b c"] }}|{{ d.nested.x }}|{{ d | length }}|{{ d | dump }}'))
            .toBe('1|2|y|3|{"a":1,"b c":2,"nested":{"x":"y"}}');
        expect(renderPlain(
            '{% macro m(a, b, c=3) %}[{{ a }}][{{ b }}][{{ c }}]{% endmacro %}' +
            '{{ m(1) }}|{{ m(1, 2) }}|{{ m(a=5) }}|{{ m(1, c=9) }}|{{ m(b=2, a=1) }}|{{ m() }}|{{ m(1, 2, 3, 4) }}',
        )).toBe('[1][][3]|[1][2][3]|[5][][3]|[1][][9]|[1][2][3]|[][][3]|[1][2][3]');
        expect(renderPlain(
            '{% macro w() %}<{{ caller(1, q=2) }}>{% endmacro %}{% call(p, q=0) w() %}{{ p }}{{ q }}{% endcall %}|' +
            '{% macro v() %}<{{ caller() }}>{% endmacro %}{% call v() %}x{% endcall %}',
        )).toBe('<12>|<x>');
        expect(renderPlain(
            '{{ [3, 1, 2] | sort(reverse=true) | join }}|{{ [3, 1, 2] | sort(true) | join }}|{{ "7" | int(default=0) }}|' +
            '{{ "x" | int(default=5) }}|{{ items | join(",", "n") }}',
            data,
        )).toBe('321|321|7|5|p,q');
        expect(renderPlain('{% macro m(a) %}[{{ a }}]{% endmacro %}{{ m({a: 1}) }}|{{ m(kw) }}', data)).toBe('[[object Object]]|[own]');
    });
});

describe('nunjucks objects', () => {
    it('refuse member reads on the render context, so a render cannot change what a later render sees', () => {
        const env = newRegistries();
        env.addFilter('currentContext', function currentContext(this: object): object {
            return this;
        });
        const environment = env as unknown as nunjucks.Environment;

        expect(isRefused(() => environment.renderString('{{ (1 | currentContext).env.addGlobal("mjPlanted", "planted") and "" }}', {})))
            .toBe(true);
        expect(environment.renderString('[{{ mjPlanted }}]', {})).toBe('[]');
    });

    it('refuse member reads on, and lookups that return, an environment, a frame, a template, a loader or the runtime module', () => {
        const data = {
            environment: new nunjucks.Environment(null),
            frame: new Frame(),
            template: new Template('x'),
            loader: new Loader(),
            runtimeModule: runtime,
        };
        const unrefused = Object.keys(data)
            .flatMap((key) => [`{{ ${key}.opts }}`, `[{{ ${key} }}]`])
            .filter((templateText) => !isRefused(() => renderPlain(templateText, data)));
        expect(unrefused).toEqual([]);
    });

    it('refuse a call that returns the environment', () => {
        const env = new nunjucks.Environment(null);
        expect(isRefused(() => renderPlain('{{ environmentOf().opts }}', { environmentOf: () => env }))).toBe(true);
    });
});
