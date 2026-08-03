/**
 * §5.4 — automatic per-lane escaping, "the security core".
 *
 * Two properties have to hold simultaneously, and they pull against each other:
 *
 *   1. An attack payload must be neutralised in every lane dialect.
 *   2. A LEGITIMATE value must render byte-for-byte as it did before, or turning escaping on by
 *      default would silently change what every existing scope retrieves — which is why the
 *      feature was never shipped as a reject-if-missing rule in the first place.
 *
 * Property 2 is what makes property 1 deployable, so it is tested just as hard.
 */
import { describe, it, expect } from 'vitest';

import {
    EscapeSqlLiteral, EscapeODataLiteral, EscapeJsonValue, EscapeFilterByLiteral,
    EscapePathSegment, EscapeScopeValueDeep, LaneKindForIndexType, type ScopeLaneKind,
} from '../generic/ScopeValueEscaper';
import { RenderScopeTemplate } from '../generic/ScopeTemplateRenderer';
import type { SearchContext } from '../generic/search.types';

const UUID = '628FAAC0-6935-4ECB-BDDB-F9CE246EC542';
const ALL_KINDS: ScopeLaneKind[] = ['sql', 'odata', 'json', 'filter_by', 'esdsl', 'path', 'none'];

describe('legitimate values are untouched in every lane (what makes default-on safe)', () => {
    // The permitted grammars for a restricting dimension: uuid, enum, int, iso-date, bool. None can
    // contain a character any escaper changes — so escaping cannot alter a correct scope's output.
    const legit = [UUID, UUID.toLowerCase(), 'member', 'public-tier', '42', '2026-07-28', 'true', 'meta.OrgID'];

    for (const kind of ALL_KINDS) {
        it(`is a no-op on legitimate values for lane "${kind}"`, () => {
            for (const v of legit) {
                expect(EscapeScopeValueDeep(v, kind)).toBe(v);
            }
        });
    }

    it('leaves non-strings alone rather than stringifying them', () => {
        expect(EscapeScopeValueDeep(42, 'sql')).toBe(42);
        expect(EscapeScopeValueDeep(true, 'sql')).toBe(true);
        expect(EscapeScopeValueDeep(null, 'sql')).toBeNull();
    });
});

describe('each escaper neutralises its own dialect', () => {
    it('SQL: doubles the single quote that would close a literal', () => {
        expect(EscapeSqlLiteral("x' OR 1=1--")).toBe("x'' OR 1=1--");
        // A backslash is DATA in T-SQL — escaping it would corrupt a legitimate value.
        expect(EscapeSqlLiteral('a\\b')).toBe('a\\b');
        expect(EscapeSqlLiteral("drop\n--")).toBe('drop--');
    });

    it('OData: doubles the quote AND the backslash Azure treats as an escape', () => {
        expect(EscapeODataLiteral("x' or true")).toBe("x'' or true");
        expect(EscapeODataLiteral('a\\b')).toBe('a\\\\b');
    });

    it('JSON: escapes the quote and backslash WITHOUT adding surrounding quotes', () => {
        // Adding quotes here would render `""value""` in every existing `"{{ x }}"` template.
        expect(EscapeJsonValue('plain')).toBe('plain');
        expect(EscapeJsonValue('a"b')).toBe('a\\"b');
        expect(EscapeJsonValue('a\\b')).toBe('a\\\\b');
        expect(EscapeJsonValue('a\nb')).toBe('a\\nb');
    });

    it('filter_by: removes the delimiter and boolean operators, nothing else', () => {
        expect(EscapeFilterByLiteral('a`b')).toBe('ab');
        expect(EscapeFilterByLiteral('x && y || z')).toBe('x  y  z');
    });

    it('filter_by does NOT corrupt an iso-date carrying a time (regression)', () => {
        // An earlier version stripped the class [&|:[]()], turning 2026-07-28T10:30:00Z into
        // 2026-07-28T103000Z — a legitimate value silently mangled, so the filter matched nothing.
        const iso = '2026-07-28T10:30:00Z';
        expect(EscapeFilterByLiteral(iso)).toBe(iso);
        for (const kind of ALL_KINDS) expect(EscapeScopeValueDeep(iso, kind)).toBe(iso);
    });

    it('path: strips traversal and separators, not quotes', () => {
        expect(EscapePathSegment('../../etc/passwd')).toBe('etcpasswd');
        expect(EscapePathSegment('a\\b/c')).toBe('abc');
        // The one escaper that is NOT a no-op on a value containing a separator — by design.
        expect(EscapePathSegment('tenant-a')).toBe('tenant-a');
    });
});

describe('arrays are escaped ELEMENT-WISE, which is what makes join() safe', () => {
    it('a malicious member cannot terminate the literal it is joined into', () => {
        const ids = [UUID, "x') OR 1=1 --"];
        const escaped = EscapeScopeValueDeep(ids, 'sql') as string[];
        expect(escaped[0]).toBe(UUID);
        expect(escaped[1]).toBe("x'') OR 1=1 --");   // quote doubled => stays inside the literal
    });

    it('descends into nested objects', () => {
        const v = EscapeScopeValueDeep({ a: { b: ["it's"] } }, 'sql') as { a: { b: string[] } };
        expect(v.a.b[0]).toBe("it''s");
    });
});

describe('the renderer applies it automatically, with a greppable opt-out', () => {
    const ctx = (scopes: Record<string, unknown>): SearchContext =>
        ({ PrimaryScopeRecordID: UUID, SecondaryScopes: scopes as SearchContext['SecondaryScopes'] });

    it('escapes an injected value in a SQL filter with NO template change', () => {
        const template = `OrgID = '{{ context.PrimaryScopeRecordID }}' AND Tier = '{{ context.SecondaryScopes.Tier }}'`;
        const out = RenderScopeTemplate(template, ctx({ Tier: "x' OR 1=1 --" }), undefined, 'sql');
        expect(out).toContain("Tier = 'x'' OR 1=1 --'");
        // The critical assertion: the injected quote can no longer close the literal.
        expect(out).not.toContain("Tier = 'x' OR");
    });

    it('renders a legitimate SQL filter identically to the un-escaped behaviour', () => {
        const template = `OrgID = '{{ context.PrimaryScopeRecordID }}'`;
        expect(RenderScopeTemplate(template, ctx({}), undefined, 'sql')).toBe(`OrgID = '${UUID}'`);
        expect(RenderScopeTemplate(template, ctx({}), undefined, 'none')).toBe(`OrgID = '${UUID}'`);
    });

    it('escapes each member of a joined id list (Betty\'s actual template shape)', () => {
        const template = `ContentSourceID IN ('{{ context.SecondaryScopes.IDs | join("','") }}')`;
        const out = RenderScopeTemplate(template, ctx({ IDs: [UUID, "y') OR 1=1 --"] }), undefined, 'sql');

        // The payload survives as TEXT inside a literal rather than as syntax:
        //   IN ('<uuid>','y'') OR 1=1 --')
        // where `''` is an escaped quote, so the second element is the harmless string
        // `y') OR 1=1 --` and the IN list still has exactly two members.
        expect(out).toContain("'y'') OR 1=1 --'");

        // The real safety property is BALANCED quoting — an injection succeeds precisely by leaving
        // an odd number of quotes so the literal closes early. Substring matching is a poor proxy
        // here (`''` trivially contains `'`), which is what an earlier version of this test got wrong.
        expect((out.match(/'/g) ?? []).length % 2).toBe(0);
    });

    it('uses the OData escaper on an Azure lane and the JSON escaper on a vector lane', () => {
        const t = `f eq '{{ context.SecondaryScopes.V }}'`;
        expect(RenderScopeTemplate(t, ctx({ V: "a'b" }), undefined, 'odata')).toBe(`f eq 'a''b'`);
        const j = `{"k": "{{ context.SecondaryScopes.V }}"}`;
        expect(RenderScopeTemplate(j, ctx({ V: 'a"b' }), undefined, 'json')).toBe('{"k": "a\\"b"}');
    });

    it('does NOT escape a non-filter position, because that would corrupt the query', () => {
        const t = `{{ context.SecondaryScopes.Q }}`;
        expect(RenderScopeTemplate(t, ctx({ Q: "member's benefits" }), undefined, 'none'))
            .toBe("member's benefits");
    });

    it('escapes extraData as well as context (regression — it used to bypass)', () => {
        // The bypass was latent (no in-repo caller passes extraData) but it sat in the signature of
        // the one function whose whole purpose is escaping.
        const out = RenderScopeTemplate(`x='{{ evil }}'`, ctx({}), { evil: "a' OR 1=1--" }, 'sql');
        expect(out).toBe(`x='a'' OR 1=1--'`);
    });

    it('exposes contextRaw as the deliberate, greppable opt-out', () => {
        const t = `{{ context.SecondaryScopes.V }}|{{ contextRaw.SecondaryScopes.V }}`;
        expect(RenderScopeTemplate(t, ctx({ V: "a'b" }), undefined, 'sql')).toBe("a''b|a'b");
    });
});

describe('LaneKindForIndexType derives the dialect from data that already exists', () => {
    it('maps each provider to its filter dialect', () => {
        expect(LaneKindForIndexType('AzureAISearch')).toBe('odata');
        expect(LaneKindForIndexType('Typesense')).toBe('filter_by');
        expect(LaneKindForIndexType('Elasticsearch')).toBe('esdsl');
        expect(LaneKindForIndexType('OpenSearch')).toBe('esdsl');
        expect(LaneKindForIndexType('Vector')).toBe('json');
    });

    it('an UNKNOWN index type gets escaping, not a pass', () => {
        // The lane we understand least must not be the only unprotected one.
        expect(LaneKindForIndexType('Other')).toBe('json');
        expect(LaneKindForIndexType(null)).toBe('json');
        expect(LaneKindForIndexType('SomethingNew')).toBe('json');
    });
});
