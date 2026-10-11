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
}
const runtime = (nunjucks as unknown as { runtime: RuntimeHooks }).runtime;

/** The nunjucks parser module and lexer, as the compiler uses them. */
interface ParserModule {
    parse: (src: string) => object;
    Parser: new (tokens: object) => { parseAsRoot(): object };
}
const { parser, lexer } = nunjucks as unknown as { parser: ParserModule; lexer: { lex(src: string): object } };

/** The environment methods that find a registered filter, test or global by name. */
interface EnvironmentRegistries {
    getFilter(name: string): unknown;
    getTest(name: string): unknown;
    getGlobal(name: string): unknown;
    addFilter(name: string, filter: (this: object, ...args: never[]) => unknown): void;
}

/** nunjucks classes whose instances only nunjucks itself uses. */
const { Template, Loader } = nunjucks as unknown as { Template: new (src: string) => object; Loader: new () => object };
const { Frame } = (nunjucks as unknown as { runtime: { Frame: new () => object } }).runtime;

/** Names every plain object inherits, such as `hasOwnProperty`. */
const INHERITED_NAMES = Object.getOwnPropertyNames(Object.prototype);

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

        HardenNunjucksRuntime();

        expect(runtime.memberLookup).toBe(installed.memberLookup);
        expect(runtime.contextOrFrameLookup).toBe(installed.contextOrFrameLookup);
        expect(runtime.callWrap).toBe(installed.callWrap);
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
            expect(renderPlain(`[{{ range.constructor }}]`)).toBe('[]');
        } finally {
            runtime.memberLookup = guarded;
        }
    });
});

describe('member access', () => {
    it.each(['constructor', 'prototype', '__defineGetter__', '__lookupGetter__'])(
        'reads own data stored under the restricted name %s',
        (name) => {
            expect(renderPlain(`[{{ data["${name}"] }}]`, { data: JSON.parse(`{"${name}": "own value"}`) })).toBe('[own value]');
        },
    );

    it('never reads __proto__, even when the data defines it', () => {
        expect(renderPlain('[{{ data["__proto__"] }}]', { data: JSON.parse('{"__proto__": "own value"}') })).toBe('[]');
    });

    it('does not read a restricted name that holds a function, that the value inherits, or that a function owns', () => {
        expect(renderPlain('[{{ data.constructor }}][{{ plain.constructor }}][{{ range.prototype }}]', {
            data: { constructor: () => 'own function' },
            plain: {},
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
