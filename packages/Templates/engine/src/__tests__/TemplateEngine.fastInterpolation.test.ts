/**
 * Unit tests for TemplateEngineServer's pure `{{ a.b }}` interpolation fast-path.
 *
 * Verifies exact Nunjucks parity for autoescape, raw mode, SafeString, missing/null values,
 * literal-only strings, sandbox restrictions (`TemplateSandboxError` + blocked prototype keys),
 * and clean fallback to full Nunjucks when tags, filters, calls, literals, or trim markers exist.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    UserInfo: class {},
    BaseEngine: class {
        static getInstance<T>(): T { return new (this as never)() as T; }
        protected ContextUser = { ID: 'test-user', Name: 'Test' };
        protected Loaded = true;
        async Config() {}
        async Load() {}
        protected async AdditionalLoading() {}
        protected HandleSingleViewResult() {}
        protected RunViewProviderToUse = undefined;
    },
    BaseEnginePropertyConfig: class {},
    IMetadataProvider: class {},
    ValidationErrorInfo: class { Message = ''; },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJTemplateContentEntity: class {
        ID = '';
        TemplateID = '';
        TemplateText = '';
        Type = '';
        Priority = 0;
    },
    MJTemplateEntityExtended: class {
        ID = '';
        Name = '';
        Content: Array<Record<string, unknown>> = [];
        Params: Array<Record<string, unknown>> = [];
        ValidateTemplateInput() { return { Success: true, Errors: [] }; }
        GetParametersForContent() { return []; }
        GetHighestPriorityContent() { return this.Content[0] ?? null; }
        GetContentByType(type: string) { return this.Content.filter((c) => c.Type === type); }
    },
    MJTemplateParamEntity: class {},
    MJTemplateCategoryEntity: class {},
    MJTemplateContentTypeEntity: class {},
}));

vi.mock('@memberjunction/templates-base-types', () => ({
    TemplateEngineBase: {
        get Instance() {
            return {
                Config: vi.fn(),
                Loaded: true,
                ContextUser: { ID: 'test-user' },
                Templates: [],
                TemplateContentTypes: [],
                TemplateCategories: [],
                TemplateContents: [],
                TemplateParams: [],
                FindTemplate: () => null,
                FindTemplateByID: () => undefined,
            };
        },
    },
    TemplateRenderResult: class {
        Success = false;
        Output = '';
        Message?: string;
    },
}));

vi.mock('@memberjunction/global', () => ({
    BaseSingleton: class BaseSingleton<T> {
        static getInstance<T>(this: new () => T): T {
            return new this();
        }
    },
    RegisterClass: () => () => {},
    MJGlobal: {
        Instance: {
            ClassFactory: {
                GetAllRegistrations: () => [],
            },
        },
    },
}));

import nunjucks from 'nunjucks';
import { TemplateEngineServer } from '../TemplateEngine';

describe('TemplateEngineServer pure interpolation fast-path', () => {
    let engine: TemplateEngineServer;

    beforeEach(async () => {
        engine = TemplateEngineServer.Instance;
        engine.ClearTemplateCache();
        await engine.Config(false);
    });

    it('renders dotted paths, missing values, falsy scalars, and literal-only templates identically to Nunjucks', async () => {
        const literalRes = await engine.RenderTemplateSimple('Plain static text without tokens', {});
        expect(literalRes.Success).toBe(true);
        expect(literalRes.Output).toBe('Plain static text without tokens');

        const res = await engine.RenderTemplateSimple(
            'Hi {{ user.profile.name }}, count={{ count }}, ok={{ flag }}, miss={{ missing.deep }}, empty={{ nul }}!',
            { user: { profile: { name: 'Ada' } }, count: 0, flag: false, nul: null },
        );
        expect(res.Success).toBe(true);
        expect(res.Output).toBe('Hi Ada, count=0, ok=false, miss=, empty=!');
    });

    it('matches Nunjucks HTML escaping in default mode, SafeString bypass, and autoescape: false mode', async () => {
        const xssPayload = `<script>alert("x&y'z")</script>`;

        const escapedRes = await engine.RenderTemplateSimple('Msg: {{ text }}', { text: xssPayload });
        expect(escapedRes.Success).toBe(true);
        expect(escapedRes.Output).toBe(
            'Msg: &lt;script&gt;alert(&quot;x&amp;y&#39;z&quot;)&lt;/script&gt;',
        );

        const safeRes = await engine.RenderTemplateSimple(
            'Msg: {{ html }}',
            { html: new nunjucks.runtime.SafeString('<b>trusted</b>') },
        );
        expect(safeRes.Success).toBe(true);
        expect(safeRes.Output).toBe('Msg: <b>trusted</b>');

        const rawRes = await engine.RenderTemplateSimple(
            'Msg: {{ text }}',
            { text: xssPayload },
            { autoescape: false },
        );
        expect(rawRes.Success).toBe(true);
        expect(rawRes.Output).toBe(`Msg: ${xssPayload}`);
    });

    it('enforces all NunjucksSandbox prototype/constructor/global rules on the fast path', async () => {
        // Inherited properties on data must not resolve
        const inherited = await engine.RenderTemplateSimple('{{ toString }}|{{ constructor }}|{{ __proto__ }}', { a: 1 });
        expect(inherited.Success).toBe(true);
        expect(inherited.Output).toBe('||');

        // Own non-function data property named `constructor` matches sandbox allow rule
        const ownCtor = await engine.RenderTemplateSimple('{{ obj.constructor }}', { obj: { constructor: 'Acme' } });
        expect(ownCtor.Success).toBe(true);
        expect(ownCtor.Output).toBe('Acme');

        // Restricted values (`Function`, `process`, `Object`, etc.) must fail with TemplateSandboxError semantics
        const restrictedRoot = await engine.RenderTemplateSimple('{{ fn }}', { fn: Function });
        expect(restrictedRoot.Success).toBe(false);
        expect(restrictedRoot.Message).toContain('Templates may not access');

        const restrictedMember = await engine.RenderTemplateSimple('{{ obj.proc }}', { obj: { proc: globalThis.process } });
        expect(restrictedMember.Success).toBe(false);
        expect(restrictedMember.Message).toContain('Templates may not access');
    });

    it('falls back seamlessly to Nunjucks when filters, literals, trim markers, tags, or nested braces are used', async () => {
        const filterRes = await engine.RenderTemplateSimple('{{ items | jsoninline }}', { items: [1, 2] });
        expect(filterRes.Success).toBe(true);
        expect(filterRes.Output).toBe('[1,2]');

        const boolRes = await engine.RenderTemplateSimple('{{ true }}|{{ false }}|{{ null }}', {});
        expect(boolRes.Success).toBe(true);
        expect(boolRes.Output).toBe('true|false|');

        const trimRes = await engine.RenderTemplateSimple('A {{- x -}} B', { x: 'mid' });
        expect(trimRes.Success).toBe(true);
        expect(trimRes.Output).toBe('AmidB');

        const forRes = await engine.RenderTemplateSimple('{% for i in list %}{{ i }}{% endfor %}', { list: ['a', 'b'] });
        expect(forRes.Success).toBe(true);
        expect(forRes.Output).toBe('ab');

        // JSON literal braces around a pure interpolation remain eligible and preserve braces
        const jsonRes = await engine.RenderTemplateSimple('{"name": "{{ user.name }}"}', { user: { name: 'Bob' } });
        expect(jsonRes.Success).toBe(true);
        expect(jsonRes.Output).toBe('{"name": "Bob"}');
    });
});
