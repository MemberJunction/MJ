/**
 * `HardenNunjucksRuntime` guards the nunjucks runtime module that every environment in the process
 * shares. These tests render through plain `nunjucks.Environment` instances, the way QueryProcessor,
 * SearchEngine and the Data Mapper action build theirs, to show the guard does not depend on the
 * MJ template engine. Every payload is harmless: it only sets a canary global and returns a marker.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import nunjucks from 'nunjucks';
import { HardenNunjucksRuntime, TemplateSandboxError } from '../NunjucksSandbox';

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

function renderPlain(templateText: string, data: object = {}): string {
    return new nunjucks.Environment(null, { autoescape: false }).renderString(templateText, data);
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

        HardenNunjucksRuntime();

        expect(runtime.memberLookup).toBe(installed.memberLookup);
        expect(runtime.contextOrFrameLookup).toBe(installed.contextOrFrameLookup);
        expect(runtime.callWrap).toBe(installed.callWrap);
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
    it.each(['constructor', 'prototype', '__proto__', '__defineGetter__', '__lookupGetter__'])(
        'reads the restricted name %s as empty, even when the data defines it',
        (name) => {
            expect(renderPlain(`[{{ data["${name}"] }}]`, { data: JSON.parse(`{"${name}": "own value"}`) })).toBe('[]');
        },
    );

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
