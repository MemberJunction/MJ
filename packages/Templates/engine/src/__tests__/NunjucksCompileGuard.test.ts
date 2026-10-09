/**
 * The compile guard checks every template nunjucks parses, before it compiles, because the compiler
 * copies template-controlled names into the code it generates. These tests use plain
 * `nunjucks.Environment` instances, so they also cover environments that other packages create.
 * Each refused input only puts a quote, a backslash or a line break into a name; none runs anything.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import nunjucks from 'nunjucks';
import { HardenNunjucksRuntime } from '../NunjucksSandbox';
import { TemplateSandboxError } from '../TemplateSandboxError';

/** The nunjucks parser, as the compiler calls it. */
const parser = (nunjucks as unknown as { parser: { parse(src: string): object } }).parser;

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
    it.each(['env', 'context', 'frame', 'runtime', 'cb', 'next', 'output', 'Object', 't_1', 'l_x', 'b_x'])(
        'refuses %s as a loop variable, in for and in asyncEach',
        (name) => {
            expect(() => renderPlain(`{% for ${name} in [1] %}{% endfor %}`)).toThrow(TemplateSandboxError.name);
            expect(() => renderPlain(`{% asyncEach ${name} in [1] %}{% endeach %}`)).toThrow(TemplateSandboxError.name);
        },
    );

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

    it('still renders an ordinary included template', async () => {
        await expect(renderWithCallback(environmentServing('child:{{ v }}'), '{% include "child" %}', { v: 1 })).resolves.toBe('child:1');
    });
});

describe('compile guard: ordinary templates', () => {
    it('accepts names from any script, digits, _ and $, and dotted filter names', () => {
        expect(renderPlain('{{ città }}|{{ _x1 }}|{{ $y }}|{{ "a" | ns.upper }}', { città: 'Roma', _x1: 1, $y: 2 }))
            .toBe('Roma|1|2|A');
    });

    it('accepts is-tests written as names, calls and quoted names', () => {
        expect(renderPlain('{{ 1 is defined }}|{{ 6 is divisibleby(3) }}|{{ 1 is "defined" }}')).toBe('true|true|true');
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
