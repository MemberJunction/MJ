/**
 * templates.checks.ts — the 'templates' bundle (TP1–TP6): live integration checks for the
 * Templates framework rendered through the REAL TemplateEngineServer (nunjucks environment,
 * custom filters, param validation + default-merge, dataset-backed metadata cache) against a
 * throwaway Template + Template Content + Template Params fixture created via real entity saves.
 *
 * What the unit tests already cover (MJCoreEntities TemplateEntityExtended.test.ts: content/param
 * selection + ValidateTemplateInput on mocks; Templates/engine TemplateEngine.test.ts: engine
 * internals) is deliberately NOT re-proven here. The integration value is the LIVE round-trip:
 * entity Save → Template_Metadata dataset load → virtual Content/Params association →
 * FindTemplate → RenderTemplate → exact output.
 *
 *   - TP1: rendering determinism — same template + params renders byte-identical output twice
 *   - TP2: nunjucks custom filter availability (json / jsoninline / jsonparse) + autoescape default
 *   - TP3: template-not-found and missing-TemplateText error contracts (clean failures, no throw)
 *   - TP4: bad-param contract — required-param failure message, default-value merge, SkipValidation
 *   - TP5: render injection neutralized — HTML in contextData autoescaped, `{{ 7*7 }}` not evaluated
 *   - TP6: LIVE TemplateText round-trip — engine cache byte-equals the saved entity text; an entity
 *          UPDATE + forced Config refresh re-renders the NEW text (the full entity→dataset→render loop)
 *
 * Deterministic (no model calls). The lifecycle creates the fixture rows once and tears them down
 * afterwards (params — including any the save pipeline auto-extracted — then content, then template).
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { MJTemplateEntity, MJTemplateContentEntity, MJTemplateParamEntity } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { ProcessedMessageServer } from '@memberjunction/communication-engine';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import type { TemplatesFixture } from '@memberjunction/testing-integration';

const PREFIX = `mj-templates-it-${Date.now()}`;
const TEMPLATE_TEXT = 'Hello {{ name }}! You have {{ count }} items.';
const TAG = '(mj-integration-test — safe to delete)';

/** Fetch the fixture (thrown if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext): TemplatesFixture {
    Assert(ctx.TemplatesFixture != null, 'templates fixture missing (bundle Setup did not run)');
    return ctx.TemplatesFixture!;
}

/** Resolve the fixture template from the REAL engine cache (never from the fixture handle). */
function engineTemplate(ctx: IntegrationCheckContext) {
    const t = TemplateEngineServer.Instance.FindTemplate(fx(ctx).TemplateName);
    Assert(t != null, `FindTemplate('${fx(ctx).TemplateName}') did not resolve the fixture template from the engine cache`);
    return t;
}

async function resolveID(entity: string, filter: string, user: UserInfo): Promise<string> {
    const r = await new RunView().RunView({ EntityName: entity, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, user);
    const id = (r.Results?.[0] as { ID?: string } | undefined)?.ID;
    Assert(!!id, `Could not resolve ${entity} where ${filter}`);
    return id!;
}

export const TemplatesChecks: NamedCheck[] = [
    {
        Id: 'templates.TP1',
        Name: 'TP1: RenderTemplate through the real engine is exact and deterministic',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = TemplateEngineServer.Instance;
            const t = engineTemplate(ctx);
            const content = t.GetHighestPriorityContent('Text');
            Assert(content != null, 'template content must resolve (attribution guard — review P2)');
            Assert(content != null, 'template content must resolve (attribution guard — review P2)');
            Assert(content != null, 'fixture template has no Text content in the engine cache');

            const data = { name: 'World', count: 3 };
            const first = await engine.RenderTemplate(t, content, data);
            Assert(first.Success, `first render failed: ${first.Message}`);
            AssertEqual(first.Output, 'Hello World! You have 3 items.', 'exact rendered output');

            const second = await engine.RenderTemplate(t, content, data);
            Assert(second.Success, `second render failed: ${second.Message}`);
            AssertEqual(second.Output, first.Output, 'byte-identical output across renders (determinism)');
            console.log(`      → rendered "${first.Output}" twice, identical`);
        }
    },
    {
        Id: 'templates.TP2',
        Name: 'TP2: nunjucks custom filters (json/jsoninline/jsonparse) are registered; autoescape is the default',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = TemplateEngineServer.Instance;
            const data = { a: 1, b: 'x' };

            // jsoninline piped through |safe emits raw JSON
            const inline = await engine.RenderTemplateSimple('{{ data | jsoninline | safe }}', { data });
            Assert(inline.Success, `jsoninline render failed: ${inline.Message}`);
            AssertEqual(inline.Output, JSON.stringify(data), 'jsoninline|safe emits compact JSON');

            // WITHOUT |safe the environment autoescapes the quotes — proving autoescape:true is live
            const escaped = await engine.RenderTemplateSimple('{{ data | jsoninline }}', { data });
            Assert(escaped.Success, `escaped jsoninline render failed: ${escaped.Message}`);
            Assert(escaped.Output!.includes('&quot;'), 'autoescape HTML-escapes the JSON quotes');
            Assert(!escaped.Output!.includes('"'), 'no raw double-quote survives autoescape');

            // json (pretty) filter matches JSON.stringify with the default 2-space indent
            const pretty = await engine.RenderTemplateSimple('{{ data | json | safe }}', { data });
            Assert(pretty.Success, `json render failed: ${pretty.Message}`);
            AssertEqual(pretty.Output, JSON.stringify(data, null, 2), 'json|safe matches 2-space-indent stringify');

            // jsonparse round-trips a JSON string back into an object graph
            const parsed = await engine.RenderTemplateSimple('{% set o = s | jsonparse %}{{ o.a }}', { s: '{"a":7}' });
            Assert(parsed.Success, `jsonparse render failed: ${parsed.Message}`);
            AssertEqual(parsed.Output, '7', 'jsonparse exposes parsed properties');

            // and a nunjucks builtin still works alongside the custom filters
            const upper = await engine.RenderTemplateSimple('{{ w | upper }}', { w: 'abc' });
            Assert(upper.Success, `builtin filter render failed: ${upper.Message}`);
            AssertEqual(upper.Output, 'ABC', 'builtin upper filter available');
            console.log('      → json / jsoninline / jsonparse / upper all render; autoescape confirmed live');
        }
    },
    {
        Id: 'templates.TP3',
        Name: 'TP3: template-not-found and missing-TemplateText fail cleanly (error contracts, no throw)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = TemplateEngineServer.Instance;

            // Not-found contract: FindTemplate returns undefined, never throws
            const missing = engine.FindTemplate(`${PREFIX}-definitely-not-a-template`);
            Assert(missing == null, 'FindTemplate returns undefined for an unknown name');

            // Missing-TemplateText contract: an unsaved content row with no text → clean failure
            const t = engineTemplate(ctx);
            const emptyContent = await ctx.Provider.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents', ctx.User);
            emptyContent.NewRecord(); // never saved — no DB row, TemplateText stays null
            const r = await engine.RenderTemplate(t, emptyContent, { name: 'x' });
            AssertEqual(r.Success, false, 'render without TemplateText reports failure');
            Assert(r.Output == null, 'no output on failure');
            Assert(!!r.Message && /TemplateText/.test(r.Message), `error names TemplateText (got: ${r.Message})`);
            console.log(`      → clean failures: undefined lookup + "${r.Message}"`);
        }
    },
    {
        Id: 'templates.TP4',
        Name: 'TP4: required-param failure, default-value merge, and SkipValidation behavior',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = TemplateEngineServer.Instance;
            const t = engineTemplate(ctx);
            const content = t.GetHighestPriorityContent('Text');

            // Missing required 'name' → validation blocks the render with the param named
            const bad = await engine.RenderTemplate(t, content, {});
            AssertEqual(bad.Success, false, 'missing required param fails the render');
            Assert(!!bad.Message && /Parameter name is required/.test(bad.Message), `failure message names the param (got: ${bad.Message})`);

            // 'count' has DefaultValue 42 — omitted from data, merged in by the engine
            const defaulted = await engine.RenderTemplate(t, content, { name: 'X' });
            Assert(defaulted.Success, `defaulted render failed: ${defaulted.Message}`);
            AssertEqual(defaulted.Output, 'Hello X! You have 42 items.', 'DefaultValue merged for the omitted param');

            // SkipValidation renders anyway (missing required renders empty; defaults still merge)
            const skipped = await engine.RenderTemplate(t, content, {}, true, true);
            Assert(skipped.Success, `SkipValidation render failed: ${skipped.Message}`);
            AssertEqual(skipped.Output, 'Hello ! You have 42 items.', 'SkipValidation renders with empty required param + merged default');
            console.log('      → validation blocks, defaults merge, SkipValidation renders through');
        }
    },
    {
        Id: 'templates.TP5',
        Name: 'TP5: injection in contextData is neutralized (autoescape) and template syntax is not re-evaluated',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = TemplateEngineServer.Instance;
            const t = engineTemplate(ctx);
            const content = t.GetHighestPriorityContent('Text');

            const script = await engine.RenderTemplate(t, content, { name: '<script>alert(1)</script>', count: 1 });
            Assert(script.Success, `script-injection render failed: ${script.Message}`);
            Assert(script.Output!.includes('&lt;script&gt;'), 'HTML in data is autoescaped');
            Assert(!script.Output!.includes('<script>'), 'no live <script> tag in the output');

            const ssti = await engine.RenderTemplate(t, content, { name: '{{ 7*7 }}', count: 1 });
            Assert(ssti.Success, `SSTI-probe render failed: ${ssti.Message}`);
            Assert(ssti.Output!.includes('{{ 7*7 }}'), 'template syntax in data stays literal');
            Assert(!ssti.Output!.includes('Hello 49'), 'data is never re-evaluated as a template');
            console.log('      → <script> escaped; {{ 7*7 }} stayed literal (no SSTI)');
        }
    },
    {
        Id: 'templates.TP6',
        Name: 'TP6: LIVE TemplateText round-trip — entity save → dataset refresh → engine cache → render',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = TemplateEngineServer.Instance;
            const f = fx(ctx);

            // The engine-cached template's virtual Content collection carries our exact saved row + text
            const t = engineTemplate(ctx);
            Assert(t.Content.some((c) => UUIDsEqual(c.ID, f.Content.ID)), 'virtual Content collection contains the fixture content row');
            const cached = t.GetHighestPriorityContent('Text');
            AssertEqual(cached.TemplateText, f.TemplateText, 'engine-cached TemplateText byte-equals the saved entity text');

            // Round-trip an UPDATE: entity save → forced Config refresh → new text renders
            const newText = 'Goodbye {{ name }}!';
            f.Content.TemplateText = newText;
            Assert(await f.Content.Save(), `updating fixture TemplateText failed: ${f.Content.LatestResult?.CompleteMessage}`);
            await engine.Config(true, ctx.User, ctx.Provider);

            const t2 = engineTemplate(ctx);
            const c2 = t2.GetHighestPriorityContent('Text');
            AssertEqual(c2.TemplateText, newText, 'refreshed engine cache carries the UPDATED text');
            const r = await engine.RenderTemplate(t2, c2, { name: 'X' }, true, true);
            Assert(r.Success, `post-update render failed: ${r.Message}`);
            AssertEqual(r.Output, 'Goodbye X!', 'render output reflects the updated entity text');
            console.log('      → save → refresh → render round-trip verified (old text fully replaced)');
        }
    },
    {
        Id: 'templates.TP7',
        Name: 'TP7 (CT3a): ProcessedMessage — a Text-only BodyTemplate renders the body AND the HTML body falls back to the rendered text',
        Fn: async (ctx: IntegrationCheckContext) => {
            const t = engineTemplate(ctx);
            const msg = new ProcessedMessageServer();
            msg.BodyTemplate = t;
            msg.ContextData = { name: 'Integration', count: 3 };
            const r = await msg.Process(false, ctx.User);
            Assert(r.Success, `TP7: Process failed: ${r.Message}`);
            // Sibling checks may add higher-priority content rows to the fixture template, so the
            // expectation is a DIRECT render of whatever GetHighestPriorityContent('Text') returns —
            // the contract is "body == rendered highest-priority Text", not a fixed string.
            const expected = await TemplateEngineServer.Instance.RenderTemplate(t, t.GetHighestPriorityContent('Text')!, msg.ContextData);
            Assert(expected.Success, `TP7: control render failed: ${expected.Message}`);
            AssertEqual(msg.ProcessedBody, expected.Output, 'TP7: ProcessedBody equals the rendered highest-priority Text content');
            Assert(msg.ProcessedBody.includes('Integration'), 'TP7: the context data reached the render');
            // The matrix's fallback edge: no HTML content + no HTMLBodyTemplate/HTMLBody ⇒ the
            // HTML body is the RENDERED TEXT, never empty.
            AssertEqual(msg.ProcessedHTMLBody, msg.ProcessedBody, 'TP7: HTML body falls back to the rendered text body when the template has no HTML content');
        }
    },
    {
        Id: 'templates.TP8',
        Name: 'TP8 (CT3b): ProcessedMessage — a SubjectTemplate WITHOUT HTML content fails loudly (the subject path requires HTML content)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const t = engineTemplate(ctx);
            // The fixture template has only a Text content row — the subject path resolves content
            // via GetHighestPriorityContent('HTML') and must REFUSE, naming the requirement, rather
            // than silently sending an empty subject.
            const msg = new ProcessedMessageServer();
            msg.SubjectTemplate = t;
            msg.ContextData = { name: 'x', count: 1 };
            const r = await msg.Process(false, ctx.User);
            AssertEqual(r.Success, false, 'TP8: a Text-only SubjectTemplate must fail Process');
            Assert(/subject/i.test(r.Message ?? '') && /HTML/i.test(r.Message ?? ''),
                `TP8: the failure names the subject-requires-HTML rule (got "${r.Message}")`);
        }
    },
];

for (const check of TemplatesChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('templates', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const md = ctx.Provider;
        const user = ctx.User;

        // Publish the handle up-front and populate as records are created, so a mid-Setup crash
        // leaves Teardown a handle to sweep partials.
        const paramIds: string[] = [];
        const templateName = `${PREFIX}-template ${TAG}`;
        const fixture = (ctx.TemplatesFixture = {
            TemplateName: templateName,
            TemplateText: TEMPLATE_TEXT,
            ParamIds: paramIds,
        } as TemplatesFixture);

        const textTypeID = await resolveID('MJ: Template Content Types', "Name='Text'", user);

        const tmpl = await md.GetEntityObject<MJTemplateEntity>('MJ: Templates', user);
        tmpl.NewRecord();
        tmpl.Name = templateName;
        tmpl.Description = `templates-bundle fixture ${TAG}`;
        tmpl.UserID = user.ID;
        tmpl.IsActive = true;
        Assert(await tmpl.Save(), `creating fixture template failed: ${tmpl.LatestResult?.CompleteMessage}`);
        fixture.Template = tmpl;

        const content = await md.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents', user);
        content.NewRecord();
        content.TemplateID = tmpl.ID;
        content.TypeID = textTypeID;
        content.TemplateText = TEMPLATE_TEXT;
        content.Priority = 1;
        content.IsActive = true;
        Assert(await content.Save(), `creating fixture template content failed: ${content.LatestResult?.CompleteMessage}`);
        fixture.Content = content;

        // The content save pipeline auto-extracts params for {{ name }} / {{ count }} (server
        // entity subclass). Normalize them to the shapes TP4 needs — required 'name', defaulted
        // 'count' — creating either one only if extraction didn't. BypassCache: the rows were
        // created mid-save through the server pipeline, a cached read can miss them.
        const existing = await new RunView().RunView<MJTemplateParamEntity>(
            { EntityName: 'MJ: Template Params', ExtraFilter: `TemplateID='${tmpl.ID}'`, ResultType: 'entity_object', BypassCache: true }, user,
        );
        const byName = new Map<string, MJTemplateParamEntity>();
        for (const p of existing.Results ?? []) {
            byName.set(p.Name.trim().toLowerCase(), p);
        }

        const ensureParam = async (name: string, isRequired: boolean, defaultValue: string | null): Promise<void> => {
            let p = byName.get(name);
            if (!p) {
                p = await md.GetEntityObject<MJTemplateParamEntity>('MJ: Template Params', user);
                p.NewRecord();
                p.TemplateID = tmpl.ID;
                p.Name = name;
                p.Type = 'Scalar';
            }
            p.IsRequired = isRequired;
            p.DefaultValue = defaultValue;
            Assert(await p.Save(), `saving fixture param '${name}' failed: ${p.LatestResult?.CompleteMessage}`);
            paramIds.push(p.ID);
        };
        await ensureParam('name', true, null);
        await ensureParam('count', false, '42');

        // Load the REAL engine against the just-created fixture (forced dataset refresh)
        await TemplateEngineServer.Instance.Config(true, user, md);
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.TemplatesFixture;
        if (!f) {
            return;
        }
        const user = ctx.User;
        if (f.Template) {
            // Sweep ALL params on the fixture template — ours plus any the render/save pipeline
            // auto-extracted after Setup (FK-safe: params before content/template).
            const params = await new RunView().RunView<MJTemplateParamEntity>(
                { EntityName: 'MJ: Template Params', ExtraFilter: `TemplateID='${f.Template.ID}'`, ResultType: 'entity_object', BypassCache: true }, user,
            );
            for (const p of params.Results ?? []) {
                await p.Delete().catch(() => undefined);
            }
        }
        if (f.Content) {
            await f.Content.Delete().catch(() => undefined);
        }
        if (f.Template) {
            await f.Template.Delete().catch(() => undefined);
        }
        ctx.TemplatesFixture = undefined;
    }
});
