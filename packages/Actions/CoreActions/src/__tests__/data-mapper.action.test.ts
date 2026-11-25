/**
 * Data Mapper renders a Nunjucks template the caller wrote (agents reach it through tool calls).
 * Nunjucks is not a sandbox: `x.constructor.constructor("...")()` is the Function constructor and
 * runs JavaScript in the server process. The action refuses templates that can reach it.
 *
 * Every payload below is harmless: if one got through it would only compute 6*7.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

import { DataMapperAction } from '../custom/data/data-mapper.action';
import { AssertMappingTemplateSafe } from '../custom/data/mapping-template-guard';

type Param = { Name: string; Type: 'Input' | 'Output'; Value: unknown };
type Result = { Success: boolean; ResultCode: string; Message?: string };
type Runnable = { InternalRunAction(params: { Params: Param[] }): Promise<Result> };

function mapData(template: unknown, source: unknown, templateType?: string): Promise<Result> {
    const action = new DataMapperAction() as unknown as Runnable;
    const params: Param[] = [
        { Name: 'SourceData', Type: 'Input', Value: source },
        { Name: 'MappingTemplate', Type: 'Input', Value: template },
    ];
    if (templateType) {
        params.push({ Name: 'TemplateType', Type: 'Input', Value: templateType });
    }
    return action.InternalRunAction({ Params: params });
}

function mappedResult(result: Result): unknown {
    return JSON.parse(result.Message ?? '{}').result;
}

describe('Data Mapper', () => {
    describe('refuses templates that reach JavaScript internals', () => {
        it.each([
            ['dot path to the constructor', '{{ name.constructor.constructor("return 6*7")() }}'],
            ['the constructor of the render context', '{{ constructor.constructor("return 6*7")() }}'],
            ['a quoted member name', '{{ name["constructor"]["constructor"]("return 6*7")() }}'],
            ['a member name built at run time', '{{ name["con" + "structor"]["con" + "structor"]("return 6*7")() }}'],
            ['a member name held in a variable', '{% set k = "con" + "structor" %}{{ name[k][k]("return 6*7")() }}'],
            ['an escaped member name', String.raw`{{ name["con\structor"]["con\structor"]("return 6*7")() }}`],
            ['__proto__', '{{ name.__proto__ }}'],
            ['prototype', '{{ name.toString.prototype }}'],
            // `}}` inside a string literal does not close the tag; a text scan for `{{ ... }}` stops there.
            ['code after a string literal holding }}', String.raw`{{ ("}}" and name)["con\structor"]["con\structor"]("return 6*7")() }}`],
            ['code after a regex literal holding }}', String.raw`{{ (r/}}/ and name)["con\structor"]["con\structor"]("return 6*7")() }}`],
            // The body of a block set and the cases of a switch are missing from nunjucks' `fields` lists.
            ['a computed member inside a block set', '{% set v %}{{ name[key] }}{% endset %}{{ v }}'],
            ['a computed member inside a switch case', '{% switch name %}{% case "a" %}{{ name[key] }}{% endswitch %}'],
        ])('refuses %s', async (_label, template) => {
            const result = await mapData(template, { name: 'a', key: 'length' }, 'string');

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Mapping template rejected');
        });

        it('refuses an unsafe template nested inside an object template', async () => {
            const result = await mapData({ outer: { inner: '{{ name["con" + "structor"] }}' } }, { name: 'a' });

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('computed member access');
        });
    });

    describe('refuses templates that load other templates', () => {
        it.each([
            ['{% include "secrets.txt" %}'],
            ['{% import "macros.njk" as m %}'],
            ['{% from "macros.njk" import field %}'],
            ['{% extends "base.njk" %}'],
        ])('refuses %s', async (template) => {
            const result = await mapData(template, {}, 'string');

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('external template loading');
        });
    });

    describe('renders ordinary mapping templates', () => {
        it('maps an object template with paths, filters and control flow', async () => {
            const result = await mapData(
                {
                    fullName: '{{ user.firstName }} {{ user.lastName | upper }}',
                    ageGroup: '{% if user.age < 18 %}minor{% else %}adult{% endif %}',
                    firstTag: '{{ user.tags[0] }}',
                    tagList: '{% for tag in user.tags %}{{ tag }}{% if not loop.last %},{% endif %}{% endfor %}',
                },
                { user: { firstName: 'Ada', lastName: 'Lovelace', age: 36, tags: ['math', 'engines'] } }
            );

            expect(result.Success).toBe(true);
            expect(mappedResult(result)).toEqual({
                fullName: 'Ada LOVELACE',
                ageGroup: 'adult',
                firstTag: 'math',
                tagList: 'math,engines',
            });
        });

        it('allows a fixed member name in brackets, for keys a dot path cannot spell', async () => {
            const result = await mapData('{{ row["first name"] }}', { row: { 'first name': 'Ada' } }, 'string');

            expect(result.Success).toBe(true);
            expect(mappedResult(result)).toBe('Ada');
        });

        it('allows brackets and array literals that are not member access', async () => {
            const result = await mapData('[{{ a }}, {{ [a, b] | join("-") }}]', { a: 1, b: 2 }, 'string');

            expect(result.Success).toBe(true);
            expect(mappedResult(result)).toBe('[1, 1-2]');
        });

        it('renders static text that contains }} without treating it as code', async () => {
            const result = await mapData('{{ "}}" }} [not code]', {}, 'string');

            expect(result.Success).toBe(true);
            expect(mappedResult(result)).toBe('}} [not code]');
        });
    });

    it('has no callable nunjucks globals to start from', async () => {
        const result = await mapData('{{ range }}|{{ cycler }}|{{ joiner }}', {}, 'string');

        expect(result.Success).toBe(true);
        expect(mappedResult(result)).toBe('||');
    });
});

describe('AssertMappingTemplateSafe', () => {
    it('stays linear on input built to make a tag-scanning regex backtrack', () => {
        const template = '{{{{'.repeat(50_000);
        const started = Date.now();

        // Not valid Nunjucks, so the parser refuses it; the point is that it answers promptly.
        expect(() => AssertMappingTemplateSafe(template)).toThrow();
        expect(Date.now() - started).toBeLessThan(2_000);
    });

    it('accepts a template with no code at all', () => {
        expect(() => AssertMappingTemplateSafe('plain text with [brackets] and a } brace')).not.toThrow();
    });
});
