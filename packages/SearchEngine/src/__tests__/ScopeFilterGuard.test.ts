/**
 * Tests for the scope-filter guard.
 *
 * The property under test is the one the providers depend on for tenant safety:
 * a filter that was AUTHORED but cannot be applied must report `unusable` so the lane
 * fails closed — never `absent`, which would let the lane query unfiltered.
 *
 * Before this guard, every provider used a bare `typeof` check, so a truthy-but-wrong-shape
 * MetadataFilter fell through and the lane ran with NO filter at all — silently dropping
 * the scope's tenant/permission push-down. Breaking the filter was the cheapest way to
 * defeat it.
 */
import { describe, it, expect } from 'vitest';

import {
    CheckScopeStringFilter,
    CheckScopeObjectFilter,
    CheckScopeJsonFilter,
    CheckRenderedTemplate,
} from '../generic/ScopeFilterGuard';

describe('CheckScopeStringFilter (Azure OData / Typesense filter_by lanes)', () => {
    it('reports absent for null, undefined and blank — legitimately unfiltered', () => {
        expect(CheckScopeStringFilter(null).Status).toBe('absent');
        expect(CheckScopeStringFilter(undefined).Status).toBe('absent');
        expect(CheckScopeStringFilter('   ').Status).toBe('absent');
    });

    it('reports usable for a string and preserves it verbatim', () => {
        const result = CheckScopeStringFilter("OrganizationID eq 'org-a'");
        expect(result.Status).toBe('usable');
        if (result.Status === 'usable') expect(result.Value).toBe("OrganizationID eq 'org-a'");
    });

    it('reports UNUSABLE for an object — a JSON filter reached a string-only lane', () => {
        // Previously: `typeof !== 'string'` → clause skipped → unfiltered query.
        const result = CheckScopeStringFilter({ term: { org: 'a' } });
        expect(result.Status).toBe('unusable');
        if (result.Status === 'unusable') expect(result.Reason).toMatch(/string/i);
    });

    it('reports UNUSABLE for other non-string types', () => {
        expect(CheckScopeStringFilter(42).Status).toBe('unusable');
        expect(CheckScopeStringFilter(true).Status).toBe('unusable');
    });
});

describe('CheckScopeObjectFilter (Elasticsearch / OpenSearch DSL lanes)', () => {
    it('reports absent for null, undefined and blank', () => {
        expect(CheckScopeObjectFilter(null).Status).toBe('absent');
        expect(CheckScopeObjectFilter(undefined).Status).toBe('absent');
        expect(CheckScopeObjectFilter('').Status).toBe('absent');
    });

    it('reports usable for an object and passes it through', () => {
        const dsl = { term: { OrganizationID: 'org-a' } };
        const result = CheckScopeObjectFilter(dsl);
        expect(result.Status).toBe('usable');
        if (result.Status === 'usable') expect(result.Value).toBe(dsl);
    });

    it('reports UNUSABLE for a leftover string — the template never parsed to JSON', () => {
        // This is the render-failure signature: RenderScopeJsonTemplate returns the raw
        // rendered text when JSON.parse fails, and it used to be silently ignored here.
        const result = CheckScopeObjectFilter('{"term": {"org": ');
        expect(result.Status).toBe('unusable');
        if (result.Status === 'unusable') expect(result.Reason).toMatch(/valid JSON|string/i);
    });

    it('reports UNUSABLE for a rendered-but-unsubstituted template', () => {
        expect(CheckScopeObjectFilter('{% if context.SecondaryScopes.X %}').Status).toBe('unusable');
    });
});

describe('CheckScopeJsonFilter (vector metadata-filter lane)', () => {
    it('reports absent for null, undefined and blank', () => {
        expect(CheckScopeJsonFilter(null).Status).toBe('absent');
        expect(CheckScopeJsonFilter(undefined).Status).toBe('absent');
        expect(CheckScopeJsonFilter('  ').Status).toBe('absent');
    });

    it('accepts an already-parsed object', () => {
        const f = { OrganizationID: { $eq: 'org-a' } };
        const result = CheckScopeJsonFilter(f);
        expect(result.Status).toBe('usable');
        if (result.Status === 'usable') expect(result.Value).toBe(f);
    });

    it('parses a JSON string into an object', () => {
        const result = CheckScopeJsonFilter('{"OrganizationID": {"$eq": "org-a"}}');
        expect(result.Status).toBe('usable');
        if (result.Status === 'usable') expect(result.Value).toEqual({ OrganizationID: { $eq: 'org-a' } });
    });

    it('reports UNUSABLE for malformed JSON — the path that used to drop the tenant clause', () => {
        // A truthy-but-invalid value (e.g. a template that rendered `[`) previously made
        // mergeMetadataFilters return the base filter — usually undefined — so the vector
        // query ran across the ENTIRE index, tenant predicate included.
        const result = CheckScopeJsonFilter('[');
        expect(result.Status).toBe('unusable');
        if (result.Status === 'unusable') expect(result.Reason).toMatch(/not valid JSON/i);
    });

    it('reports UNUSABLE when JSON parses to a non-object scalar', () => {
        expect(CheckScopeJsonFilter('"just a string"').Status).toBe('unusable');
        expect(CheckScopeJsonFilter('7').Status).toBe('unusable');
        expect(CheckScopeJsonFilter('null').Status).toBe('unusable');
    });

    it('reports UNUSABLE for unsupported types', () => {
        expect(CheckScopeJsonFilter(42).Status).toBe('unusable');
        expect(CheckScopeJsonFilter(false).Status).toBe('unusable');
    });

    it('never reports `absent` for an authored-but-broken filter (the core invariant)', () => {
        // `absent` is the only status that permits an unfiltered query, so a broken filter
        // must never produce it.
        for (const broken of ['[', '{oops', 'not json at all', 42, true, '"scalar"']) {
            expect(CheckScopeJsonFilter(broken).Status).not.toBe('absent');
        }
    });
});

describe('CheckRenderedTemplate (restricting fields: ExtraFilter / MetadataFilter / ExternalIndexConfig)', () => {
    it('reports absent when no template was authored', () => {
        expect(CheckRenderedTemplate(null, undefined).Status).toBe('absent');
        expect(CheckRenderedTemplate(undefined, '').Status).toBe('absent');
        expect(CheckRenderedTemplate('   ', '').Status).toBe('absent');
    });

    it('reports usable when a template rendered to real content', () => {
        const result = CheckRenderedTemplate(
            "OrgID = '{{ context.PrimaryScopeRecordID }}'",
            "OrgID = 'org-a'");
        expect(result.Status).toBe('usable');
    });

    it('reports UNUSABLE when a restricting template rendered to EMPTY', () => {
        // THE SILENT-WIDENING PATH. Nunjucks runs with throwOnUndefined:false, so a mistyped
        // dimension makes a {% if %} guard false and the whole clause disappears — the lane
        // would then run with no restriction at all.
        const result = CheckRenderedTemplate(
            '{% if context.SecondaryScopes.EffectiveChanneID %} AND ContentSourceID IN (1){% endif %}',
            '');
        expect(result.Status).toBe('unusable');
        if (result.Status === 'unusable') expect(result.Reason).toMatch(/rendered to nothing/i);
    });

    it('reports UNUSABLE when the value is null/undefined but a template existed', () => {
        expect(CheckRenderedTemplate('{{ x }}', undefined).Status).toBe('unusable');
        expect(CheckRenderedTemplate('{{ x }}', null).Status).toBe('unusable');
    });

    it('reports UNUSABLE when raw template syntax survived (render error returned the source)', () => {
        // RenderScopeTemplate returns the RAW template on error, so `{%`/`{{` in the output
        // means the render failed and literal template text is about to become a filter.
        expect(CheckRenderedTemplate('{% if x %}a{% endif %}', '{% if x %}a{% endif %}').Status).toBe('unusable');
        expect(CheckRenderedTemplate("OrgID = '{{ y }}'", "OrgID = '{{ y }}'").Status).toBe('unusable');
    });

    it('accepts a rendered object (MetadataFilter parsed to JSON)', () => {
        const result = CheckRenderedTemplate('{"a":1}', { a: 1 });
        expect(result.Status).toBe('usable');
    });

    it('never reports absent once a template was authored (the core invariant)', () => {
        for (const rendered of ['', '   ', undefined, null, '{% if x %}']) {
            expect(CheckRenderedTemplate('{{ something }}', rendered).Status).not.toBe('absent');
        }
    });
});
