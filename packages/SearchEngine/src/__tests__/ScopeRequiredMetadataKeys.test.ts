/**
 * Tests for the Phase E ingest label contract — `SearchScopeExternalIndex.RequiredMetadataKeys`.
 *
 * The failure this exists to catch is a filter that rendered PARTIALLY. Every other guard in
 * ScopeFilterGuard asks a yes/no question about the filter as a whole: is it absent, is it
 * parseable, did the template render at all. None of them can see that a filter which renders
 * fine is missing one of its clauses, because a scope filter is normally built from several
 * optional `{% if %}` blocks and "this one didn't fire" is indistinguishable from "this one was
 * never authored".
 *
 * That is not a hypothetical. A dropped clause is the expected outcome whenever a dimension is
 * absent — a mistyped dimension name, a caller that omitted it, or (the important one) a value
 * the dimension resolver DISCARDED as spoofed. In each case the remaining clauses still render,
 * the filter is non-empty and syntactically valid, and the lane quietly searches a wider set
 * than its author intended. Declaring the keys makes that intent checkable.
 */
import { describe, it, expect } from 'vitest';

import { ParseRequiredMetadataKeys, CheckRequiredMetadataKeys } from '../generic/ScopeFilterGuard';

const ORG = '628FAAC0-6935-4ECB-BDDB-F9CE246EC542';

describe('ParseRequiredMetadataKeys', () => {
    it('treats an absent declaration as "no contract" so existing rows are untouched', () => {
        expect(ParseRequiredMetadataKeys(null)).toEqual([]);
        expect(ParseRequiredMetadataKeys(undefined)).toEqual([]);
        expect(ParseRequiredMetadataKeys('   ')).toEqual([]);
    });

    it('parses a JSON array', () => {
        expect(ParseRequiredMetadataKeys('["OrganizationID","ContentSourceID"]'))
            .toEqual(['OrganizationID', 'ContentSourceID']);
    });

    it('parses a comma-separated list, because both shapes turn up in hand-authored metadata', () => {
        expect(ParseRequiredMetadataKeys('OrganizationID, ContentSourceID'))
            .toEqual(['OrganizationID', 'ContentSourceID']);
    });

    it('THROWS on a malformed declaration rather than degrading to "no contract"', () => {
        // The whole point is fail-closed. If a typo in the declaration silently meant "no keys
        // required", a broken contract would produce an UNGUARDED lane — strictly worse than
        // never having declared one, because the author believes they are protected.
        expect(() => ParseRequiredMetadataKeys('["OrganizationID"')).toThrow(/not valid JSON/i);
        expect(() => ParseRequiredMetadataKeys('["OrganizationID", "  "]')).toThrow(/blank key/i);
    });

    it('rejects a JSON OBJECT rather than treating the whole literal as one key name', () => {
        // Found by this test. `{...}` does not start with `[`, so it fell through to the
        // comma-split branch and came back as the single "key" `{"a":1}` — a name no rendered
        // filter can ever contain, which skips the lane forever with an unactionable reason.
        expect(() => ParseRequiredMetadataKeys('{"a":1}')).toThrow(/JSON object/i);
    });

    it('rejects key names that are not identifiers, naming the offending token', () => {
        expect(() => ParseRequiredMetadataKeys('OrganizationID, Content"SourceID'))
            .toThrow(/not valid metadata key names/i);
    });

    it('allows dotted and hyphenated key names, which real indexes use', () => {
        expect(ParseRequiredMetadataKeys('["meta.OrganizationID","content-source-id"]'))
            .toEqual(['meta.OrganizationID', 'content-source-id']);
    });
});

describe('CheckRequiredMetadataKeys — the partially-rendered filter', () => {
    it('passes a filter that constrains on every declared key', () => {
        const rendered = JSON.stringify({ OrganizationID: ORG, ContentSourceID: { $in: ['a', 'b'] } });
        const check = CheckRequiredMetadataKeys(rendered, ['OrganizationID', 'ContentSourceID']);
        expect(check.Status).toBe('usable');
    });

    it('CATCHES the vanished clause — the case no other guard can see', () => {
        // The channel dimension was absent (or discarded as spoofed), so the ContentSourceID
        // clause never rendered. The filter is non-empty, valid JSON, free of template syntax:
        // CheckRenderedTemplate and CheckScopeJsonFilter both pass it. Only the declared
        // contract reveals that the lane is now searching the whole tenant.
        const partiallyRendered = JSON.stringify({ OrganizationID: ORG });
        const check = CheckRequiredMetadataKeys(partiallyRendered, ['OrganizationID', 'ContentSourceID']);
        expect(check.Status).toBe('unusable');
        if (check.Status !== 'unusable') return;
        // The MISSING-key list names only what is missing; the rendered filter is echoed
        // afterwards for context, so OrganizationID legitimately appears later in the message.
        expect(check.Reason).toMatch(/required metadata key \[ContentSourceID\]/);
    });

    it('names every missing key at once, not just the first', () => {
        const check = CheckRequiredMetadataKeys('{}', ['OrganizationID', 'ContentSourceID', 'Tier']);
        expect(check.Status).toBe('unusable');
        if (check.Status !== 'unusable') return;
        for (const key of ['OrganizationID', 'ContentSourceID', 'Tier']) {
            expect(check.Reason).toContain(key);
        }
    });

    it('is a no-op when no keys are declared, so every existing lane behaves as before', () => {
        expect(CheckRequiredMetadataKeys(null, []).Status).toBe('usable');
        expect(CheckRequiredMetadataKeys('{"anything": 1}', []).Status).toBe('usable');
    });

    it('rejects when keys are declared but nothing rendered at all', () => {
        const check = CheckRequiredMetadataKeys('', ['OrganizationID']);
        expect(check.Status).toBe('unusable');
        if (check.Status !== 'unusable') return;
        expect(check.Reason).toMatch(/no filter was rendered/i);
    });
});

describe('CheckRequiredMetadataKeys — filter dialects', () => {
    it('finds keys nested inside a provider boolean wrapper', () => {
        // Pinecone/Mongo-style: the key is real but two levels down. A flat top-level-keys-only
        // check would report a false failure here and skip a perfectly good lane.
        const rendered = JSON.stringify({
            $and: [{ OrganizationID: { $eq: ORG } }, { ContentSourceID: { $in: ['a'] } }],
        });
        expect(CheckRequiredMetadataKeys(rendered, ['OrganizationID', 'ContentSourceID']).Status).toBe('usable');
    });

    it('accepts an already-parsed object as well as a JSON string', () => {
        const rendered = { OrganizationID: ORG, ContentSourceID: ['a'] };
        expect(CheckRequiredMetadataKeys(rendered, ['ContentSourceID']).Status).toBe('usable');
    });

    it('handles a non-JSON string dialect (Azure OData) by scanning identifier tokens', () => {
        // OData expresses a constraint as `Key eq 'value'`, not as structure, so structural
        // walking finds nothing. Token scanning is the only option that works here.
        const odata = `OrganizationID eq '${ORG}' and search.in(ContentSourceID, 'a,b')`;
        expect(CheckRequiredMetadataKeys(odata, ['OrganizationID', 'ContentSourceID']).Status).toBe('usable');
        const missingChannel = `OrganizationID eq '${ORG}'`;
        expect(CheckRequiredMetadataKeys(missingChannel, ['OrganizationID', 'ContentSourceID']).Status)
            .toBe('unusable');
    });

    it('matches key names case-insensitively', () => {
        // Index label casing drifts between the writer and the scope author constantly, and a
        // case-sensitive miss would skip a correctly-filtered lane — a false alarm that trains
        // people to delete the contract.
        expect(CheckRequiredMetadataKeys('{"organizationid": "x"}', ['OrganizationID']).Status).toBe('usable');
    });

    it('does not mistake a quoted VALUE for a key in the TOKEN-SCAN path (regression)', () => {
        // Adversarial review finding. The structured path distinguishes keys from values by
        // position; the string path had to earn that distinction and did not, so a filter that
        // merely MENTIONED the key name as a value satisfied a contract it never constrained on.
        const odata = "OrganizationID eq 'abc' and Title eq 'ContentSourceID'";
        expect(CheckRequiredMetadataKeys(odata, ['ContentSourceID']).Status).toBe('unusable');
        // Double-quoted literals too (Typesense-style).
        expect(CheckRequiredMetadataKeys('Title:="ContentSourceID"', ['ContentSourceID']).Status).toBe('unusable');
        // …while a genuine constraint on the same key still passes.
        expect(CheckRequiredMetadataKeys(`${odata} and ContentSourceID eq 'x'`, ['ContentSourceID']).Status)
            .toBe('usable');
    });

    it('does not mistake a VALUE for a key in structured filters', () => {
        // The key must actually be a key. A document whose org field merely CONTAINS the string
        // "ContentSourceID" must not satisfy the contract.
        const rendered = JSON.stringify({ OrganizationID: 'ContentSourceID' });
        expect(CheckRequiredMetadataKeys(rendered, ['ContentSourceID']).Status).toBe('unusable');
    });
});
