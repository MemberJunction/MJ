/**
 * Stored templates are user-editable: the UI role can update `MJ: Template Contents`. The engine
 * renders them for `RunTemplate`, `Template.Run`, AI prompts and email. nunjucks has no sandbox, so
 * a template can walk from any value to `Function` and run code on the server, or reach the
 * shared render environment and change it for every later render.
 *
 * These tests render such templates through the same call those paths make
 * (`RenderTemplate(template, content, data, true)`) and check that no code runs and nothing leaks.
 * Every payload is harmless: it only sets a canary global and returns a marker string.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { MJTemplateContentEntity, MJTemplateEntityExtended } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '../TemplateEngine';

declare global {
    // Set only by template code that managed to run JavaScript.
    // eslint-disable-next-line no-var
    var __mjTemplateSandboxCanary: string | undefined;
}

/** JavaScript a payload tries to run: it sets the canary and returns a marker. */
const CODE = `globalThis.__mjTemplateSandboxCanary = 'ran'; return 'RAN'`;

/** A minimal entity definition, so the fixtures are real entity objects. */
function entityInfo(name: string, fieldNames: string[]): EntityInfo {
    const entityId = `entity-${name}`;
    return new EntityInfo({
        ID: entityId, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: `vw${name}`,
        Fields: fieldNames.map((field, index) => ({
            ID: `${entityId}-${field}`, EntityID: entityId, Sequence: index + 1, Name: field, Entity: name,
            Type: field.endsWith('ID') ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: field === 'ID',
        })),
    });
}

const TEMPLATE_ENTITY = entityInfo('MJ: Templates', ['ID', 'Name']);
const CONTENT_ENTITY = entityInfo('MJ: Template Contents', ['ID', 'TemplateID', 'TemplateText']);

function makeTemplate(): MJTemplateEntityExtended {
    const template = new MJTemplateEntityExtended(TEMPLATE_ENTITY);
    template.Hydrate({ ID: 'template-1', Name: 'Sandbox Test' });
    return template;
}

let contentCounter = 0;
/** A fresh content row per render, so the engine's compiled-template cache never serves an older one. */
function makeContent(templateText: string): MJTemplateContentEntity {
    const content = new MJTemplateContentEntity(CONTENT_ENTITY);
    content.Hydrate({ ID: `content-${++contentCounter}`, TemplateID: 'template-1', TemplateText: templateText });
    return content;
}

const engine = TemplateEngineServer.Instance;

/** Renders stored-template text the way RunTemplate and Template.Run do. */
async function render(templateText: string, data: Record<string, unknown> = {}) {
    return engine.RenderTemplate(makeTemplate(), makeContent(templateText), data, true);
}

beforeEach(() => {
    engine.SetupNunjucks();
    delete globalThis.__mjTemplateSandboxCanary;
});

afterEach(() => {
    delete globalThis.__mjTemplateSandboxCanary;
});

describe('TemplateEngineServer sandbox: templates cannot run JavaScript', () => {
    it.each([
        ['dotted member access (the audit payload shape)', `{{ range.constructor("${CODE}")() }}`],
        ['bracket member access', `{{ range["constructor"]("${CODE}")() }}`],
        ['a member name built at render time', `{% set k = "constr" ~ "uctor" %}{{ range[k]("${CODE}")() }}`],
        ['a string literal constructor chain', `{{ "x".constructor.constructor("${CODE}")() }}`],
        ['the output of a filter', `{{ ([range] | first).constructor("${CODE}")() }}`],
        ['__proto__ member access', `{{ range.__proto__.constructor("${CODE}")() }}`],
        [
            'the bare name constructor (Object reflection, no .constructor member)',
            `{{ constructor.getOwnPropertyDescriptor(constructor.getPrototypeOf(range), "con" ~ "structor").value("${CODE}")() }}`,
        ],
        ['re-parenting the render data with set __proto__', `{% set __proto__ = range %}{{ constructor("${CODE}")() }}`],
    ])('refuses %s', async (_route, templateText) => {
        const result = await render(templateText);

        expect(globalThis.__mjTemplateSandboxCanary).toBeUndefined();
        expect(result.Output ?? '').not.toContain('RAN');
    });
});

describe('TemplateEngineServer sandbox: templates cannot reach the shared render environment', () => {
    it.each([
        ['valueOf() on the render context', '{% set c = valueOf() %}{{ c.env.addGlobal("mjPlanted", "planted") and "" }}'],
        ['concat() after re-parenting the render data', '{% set __proto__ = [] %}{{ concat()[0].env.addGlobal("mjPlanted", "planted") and "" }}'],
    ])('does not let a template plant a global through %s', async (_route, templateText) => {
        await render(templateText);
        const later = await engine.RenderTemplateSimple('[{{ mjPlanted }}]', {});

        expect(later.Output).toBe('[]');
    });
});

describe('TemplateEngineServer sandbox: ordinary templates still render', () => {
    it('reads members, indexes and keys with spaces', async () => {
        const result = await render('{{ user.name }}|{{ items[1] }}|{{ row["Full Name"] }}|{{ items.length }}', {
            user: { name: 'Ada' }, items: ['a', 'b'], row: { 'Full Name': 'Ada Lovelace' },
        });
        expect(result.Output).toBe('Ada|b|Ada Lovelace|2');
    });

    it('calls methods on strings, arrays and data', async () => {
        const result = await render('{{ name.toUpperCase() }}|{{ items.join("-") }}|{{ "a,b".split(",") | length }}', {
            name: 'ada', items: ['x', 'y'],
        });
        expect(result.Output).toBe('ADA|x-y|2');
    });

    it('reads MJ system fields', async () => {
        const result = await render('{{ record.__mj_CreatedAt }}', { record: { __mj_CreatedAt: '2026-10-08' } });
        expect(result.Output).toBe('2026-10-08');
    });

    it('runs loops, loop variables, conditionals and set', async () => {
        const result = await render(
            '{% set total = 0 %}{% for i in items %}{{ loop.index }}:{{ i }}{% if not loop.last %},{% endif %}{% endfor %}',
            { items: ['a', 'b', 'c'] },
        );
        expect(result.Output).toBe('1:a,2:b,3:c');
    });

    it('calls macros, including caller() from a call block', async () => {
        const result = await render(
            '{% macro wrap(tag) %}<{{ tag }}>{{ caller() }}</{{ tag }}>{% endmacro %}{% call wrap("b") %}hi{% endcall %}',
        );
        expect(result.Output).toBe('<b>hi</b>');
    });

    it('uses the built-in globals range, cycler and joiner', async () => {
        const result = await render(
            '{% for n in range(3) %}{{ n }}{% endfor %}|{% set c = cycler("odd", "even") %}{{ c.next() }}{{ c.next() }}|' +
            '{% set j = joiner("+") %}{% for x in [1, 2] %}{{ j() }}{{ x }}{% endfor %}',
        );
        expect(result.Output).toBe('012|oddeven|1+2');
    });

    it('applies built-in and MJ filters, and dict and array literals', async () => {
        const result = await render(
            '{{ [3, 1, 2] | sort | join(",") }}|{% set o = s | jsonparse %}{{ o.a }}|{{ {"k": "v"} | jsoninline | safe }}',
            { s: '{"a":7}' },
        );
        expect(result.Output).toBe('1,2,3|7|{"k":"v"}');
    });

    it('treats a missing variable as empty', async () => {
        const result = await render('[{{ nothingHere }}]');
        expect(result.Success).toBe(true);
        expect(result.Output).toBe('[]');
    });
});
