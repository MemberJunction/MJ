import { describe, it, expect } from 'vitest';
import type { RunQueryEnrichment } from '@memberjunction/core';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';

/**
 * `Query.DefaultEnrichment` is what makes the enrichment capability reachable: without it a caller
 * has to already know an enricher exists in order to ask for one, so a saved report can never carry
 * predictions. These cover the parsing contract — the column is operator-authored JSON, and a typo
 * in it must degrade to an un-enriched query rather than break a report that worked yesterday.
 */

/** Reach the protected parser without standing up a provider. */
type Parser = (query: { DefaultEnrichment?: string | null; Name?: string; ID?: string }) => RunQueryEnrichment | null;
const parse = (GenericDatabaseProvider.prototype as unknown as { savedQueryEnrichment: Parser }).savedQueryEnrichment;

const q = (DefaultEnrichment?: string | null) => ({ DefaultEnrichment, Name: 'Top Members', ID: 'q1' });

describe('savedQueryEnrichment', () => {
  it('reads a well-formed directive', () => {
    const out = parse(q(JSON.stringify({ EnricherKey: 'ML Model Score', Config: { modelId: 'm1', outputField: 'RenewalScore' } })));
    expect(out).toEqual({ EnricherKey: 'ML Model Score', Config: { modelId: 'm1', outputField: 'RenewalScore' } });
  });

  it('returns null when the query has none', () => {
    expect(parse(q(null))).toBeNull();
    expect(parse(q(undefined))).toBeNull();
    expect(parse(q('   '))).toBeNull();
  });

  it('defaults a missing Config rather than dropping the directive', () => {
    // The enricher owns the Config shape; an absent one is that enricher's problem to report, not
    // a reason to silently skip enrichment altogether.
    expect(parse(q(JSON.stringify({ EnricherKey: 'ML Model Score' })))).toEqual({ EnricherKey: 'ML Model Score', Config: {} });
  });

  it('defaults a Config that is not an object', () => {
    expect(parse(q(JSON.stringify({ EnricherKey: 'k', Config: 'nope' })))?.Config).toEqual({});
    expect(parse(q(JSON.stringify({ EnricherKey: 'k', Config: [1, 2] })))?.Config).toEqual({});
  });

  it('rejects a directive with no usable enricher key', () => {
    // Without a key there is nothing to resolve, so this is not a directive at all.
    expect(parse(q(JSON.stringify({ Config: { modelId: 'm1' } })))).toBeNull();
    expect(parse(q(JSON.stringify({ EnricherKey: '   ' })))).toBeNull();
    expect(parse(q(JSON.stringify({ EnricherKey: 42 })))).toBeNull();
  });

  it('rejects JSON that is not an object', () => {
    // `[]` matters specifically: typeof [] === 'object', so an array slips past a naive guard.
    expect(parse(q('[]'))).toBeNull();
    expect(parse(q('"a string"'))).toBeNull();
    expect(parse(q('null'))).toBeNull();
  });

  it('degrades to no enrichment on malformed JSON instead of throwing', () => {
    // The database CHECK rejects non-JSON, so this is the belt to that braces — a provider that
    // threw here would take down a query that has nothing to do with enrichment.
    expect(() => parse(q('{not json'))).not.toThrow();
    expect(parse(q('{not json'))).toBeNull();
  });
});
