import { describe, it, expect } from 'vitest';
import type nunjucks from 'nunjucks';
import { CollectReferencedVariables, type ReferencedVariablesOptions } from '../TemplateVariableAnalysis';

interface EmbedParser { nextToken(): { value: string }; parseSignature(a: null, b: boolean): object; advanceAfterBlockEnd(name: string): void }
interface EmbedNodes { CallExtensionAsync: new (ext: object, prop: string, args: object) => object }

/** Same parse as TemplateEmbedExtension; `__name` is what env.addExtension would set. */
const embedExtension = {
    __name: 'TemplateEmbed',
    tags: ['template'],
    parse(parser: EmbedParser, nodes: EmbedNodes) {
        const tok = parser.nextToken();
        const args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);
        return new nodes.CallExtensionAsync(this, 'run', args);
    },
} as nunjucks.Extension;

function options(templates: Record<string, string[]> = {}): ReferencedVariablesOptions {
    return { Extensions: [embedExtension], ResolveTemplateTexts: (name) => templates[name.toLowerCase()] ?? null };
}

interface BlockParser extends EmbedParser { parseUntilBlocks(...names: string[]): object; advanceAfterBlockEnd(name?: string): void }
interface BlockNodes { CallExtensionAsync: new (ext: object, prop: string, args: object, contentArgs: object[]) => object }

/** Same parse as AIPromptExtension, without its optional error block. */
const aiPromptExtension = {
    __name: 'AIPrompt',
    tags: ['AIPrompt'],
    parse(parser: BlockParser, nodes: BlockNodes) {
        const tok = parser.nextToken();
        const args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);
        const body = parser.parseUntilBlocks('endAIPrompt');
        parser.advanceAfterBlockEnd();
        return new nodes.CallExtensionAsync(this, 'run', args, [body]);
    },
} as nunjucks.Extension;

/** A registered extension the analysis does not know. */
const customExtension = { ...embedExtension, __name: 'Custom', tags: ['custom'] } as nunjucks.Extension;

/** The embed extension without the registration name that env.addExtension sets. */
const unnamedEmbedExtension = { tags: ['template'], parse: embedExtension.parse } as nunjucks.Extension;

describe('CollectReferencedVariables', () => {
    it('collects top-level names from output, loops, conditions and filters', () => {
        const r = CollectReferencedVariables('{% for r in rows %}{{ r.name }}{% endfor %}{% if user %}{{ user.email | upper }}{% endif %}{{ _CURRENT_PAYLOAD | dump }}', options());
        expect(r.Complete).toBe(true);
        for (const n of ['rows', 'r', 'user', '_CURRENT_PAYLOAD']) expect(r.Names.has(n)).toBe(true);
        expect(r.Names.has('name')).toBe(false);
        expect(r.Names.has('email')).toBe(false);
    });

    it('parses custom tags and follows a literal {% template %} embed', () => {
        const r = CollectReferencedVariables('{% template "Child", type="HTML" %}{{ a }}', options({ child: ['{{ childVar }}'] }));
        expect(r.Complete).toBe(true);
        expect(r.Names.has('a')).toBe(true);
        expect(r.Names.has('childVar')).toBe(true);
    });

    it('follows literal include, import and from-import, across every content of the target', () => {
        const r = CollectReferencedVariables('{% include "Inc" %}{% import "M" as m %}{% from "F" import g %}', options({
            inc: ['{{ incVar }}', '{{ incVarHtml }}'], m: ['{{ mVar }}'], f: ['{{ fVar }}'],
        }));
        expect(r.Complete).toBe(true);
        for (const n of ['incVar', 'incVarHtml', 'mVar', 'fVar']) expect(r.Names.has(n)).toBe(true);
    });

    it('stops on a cycle without failing', () => {
        const r = CollectReferencedVariables('{% include "A" %}', options({ a: ['{{ aVar }}{% include "B" %}'], b: ['{{ bVar }}{% include "A" %}'] }));
        expect(r.Complete).toBe(true);
        expect(r.Names.has('aVar')).toBe(true);
        expect(r.Names.has('bVar')).toBe(true);
    });

    it('is incomplete for a template named by an expression', () => {
        const inc = CollectReferencedVariables('{% include someVar %}', options());
        expect(inc.Complete).toBe(false);
        expect(inc.Reason).toMatch(/expression/);
        const embed = CollectReferencedVariables('{% template dyn %}', options());
        expect(embed.Complete).toBe(false);
    });

    it('is incomplete when a named template is not found', () => {
        const r = CollectReferencedVariables('{% include "Missing" %}', options());
        expect(r.Complete).toBe(false);
        expect(r.Reason).toContain('"Missing"');
        expect(r.ParseFailed).toBeUndefined();
    });

    it('is incomplete when the text does not parse', () => {
        const r = CollectReferencedVariables('{% for x in %}', options());
        expect(r.Complete).toBe(false);
        expect(r.Reason).toMatch(/could not be parsed/);
        expect(r.ParseFailed).toBe(true);
    });

    it('marks a parse failure in a template it pulls in', () => {
        const r = CollectReferencedVariables('{% include "Broken" %}{{ a }}', options({ broken: ['{% if %}'] }));
        expect(r.Complete).toBe(false);
        expect(r.ParseFailed).toBe(true);
        expect(r.Names.has('a')).toBe(true);
    });

    it('is incomplete when a custom tag has no registered extension', () => {
        const r = CollectReferencedVariables('{% template "Child" %}', { Extensions: [], ResolveTemplateTexts: () => null });
        expect(r.Complete).toBe(false);
    });
});

describe('CollectReferencedVariables: block {% set %}', () => {
    it('collects names inside the body', () => {
        const r = CollectReferencedVariables('{% set greeting %}Hello {{ user.name }}{% endset %}{{ greeting }}', options());
        expect(r.Complete).toBe(true);
        expect(r.Names.has('user')).toBe(true);
        expect(r.Names.has('greeting')).toBe(true);
    });

    it('is incomplete when the body pulls in a template it cannot follow', () => {
        expect(CollectReferencedVariables('{% set b %}{% include "Missing" %}{% endset %}', options()).Complete).toBe(false);
        expect(CollectReferencedVariables('{% set b %}{% template dyn %}{% endset %}', options()).Complete).toBe(false);
    });

    it('follows a literal {% template %} embed in the body', () => {
        const r = CollectReferencedVariables('{% set b %}{% template "Child" %}{% endset %}', options({ child: ['{{ childVar }}'] }));
        expect(r.Complete).toBe(true);
        expect(r.Names.has('childVar')).toBe(true);
    });
});

describe('CollectReferencedVariables: statement bodies', () => {
    it.each([
        ['block set', '{% set x %}{{ inBody }}{% endset %}'],
        ['macro', '{% macro m() %}{{ inBody }}{% endmacro %}'],
        ['call', '{% macro m() %}{{ caller() }}{% endmacro %}{% call m() %}{{ inBody }}{% endcall %}'],
        ['filter block', '{% filter upper %}{{ inBody }}{% endfilter %}'],
        ['switch case', '{% switch s %}{% case 1 %}{{ inBody }}{% endswitch %}'],
        ['switch default', '{% switch s %}{% case 1 %}one{% default %}{{ inBody }}{% endswitch %}'],
        ['block', '{% block b %}{{ inBody }}{% endblock %}'],
        ['extends block', '{% extends "Base" %}{% block b %}{{ inBody }}{% endblock %}'],
        ['if else', '{% if c %}yes{% else %}{{ inBody }}{% endif %}'],
        ['for else', '{% for i in items %}{{ i }}{% else %}{{ inBody }}{% endfor %}'],
    ])('collects a name inside a %s body', (_label, text) => {
        const r = CollectReferencedVariables(text, options({ base: ['{% block b %}{% endblock %}'] }));
        expect(r.Complete).toBe(true);
        expect(r.Names.has('inBody')).toBe(true);
    });
});

describe('CollectReferencedVariables: template references', () => {
    it('follows a literal {% extends %} through the resolver', () => {
        const r = CollectReferencedVariables('{% extends "Base" %}{% block content %}{{ childVar }}{% endblock %}', options({
            base: ['{{ baseVar }}{% block content %}{% endblock %}'],
        }));
        expect(r.Complete).toBe(true);
        expect(r.Names.has('baseVar')).toBe(true);
        expect(r.Names.has('childVar')).toBe(true);
    });

    it('names the {% from %} tag when it names its template with an expression', () => {
        const r = CollectReferencedVariables('{% from someVar import g %}', options());
        expect(r.Complete).toBe(false);
        expect(r.Reason).toContain('{% from %}');
    });

    it('is incomplete when loading a named template throws', () => {
        const r = CollectReferencedVariables('{% include "Inc" %}{{ a }}', {
            Extensions: [],
            ResolveTemplateTexts: () => { throw new Error('template metadata is not loaded'); },
        });
        expect(r.Complete).toBe(false);
        expect(r.Reason).toContain('"Inc"');
        expect(r.Reason).toContain('template metadata is not loaded');
        expect(r.Names.has('a')).toBe(true);
    });
});

describe('CollectReferencedVariables: custom tags', () => {
    it('walks the arguments and body of an {% AIPrompt %} tag', () => {
        const r = CollectReferencedVariables('{% AIPrompt AIModel=model %}Summarize {{ notes }}{% endAIPrompt %}', {
            Extensions: [aiPromptExtension], ResolveTemplateTexts: () => null,
        });
        expect(r.Complete).toBe(true);
        expect(r.Names.has('model')).toBe(true);
        expect(r.Names.has('notes')).toBe(true);
    });

    it('is incomplete for a tag from an extension the analysis does not know', () => {
        const r = CollectReferencedVariables('{% custom "x" %}{{ a }}', { Extensions: [embedExtension, customExtension], ResolveTemplateTexts: () => null });
        expect(r.Complete).toBe(false);
        expect(r.Reason).toContain('{% custom %}');
        expect(r.Reason).toContain('"Custom"');
        expect(r.Names.has('a')).toBe(true);
    });

    it('is incomplete for a tag from an extension with no registered name', () => {
        const r = CollectReferencedVariables('{% template "Child" %}', { Extensions: [unnamedEmbedExtension], ResolveTemplateTexts: () => ['{{ childVar }}'] });
        expect(r.Complete).toBe(false);
        expect(r.Reason).toContain('{% template %}');
    });
});
