import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Scripted by each test before it drives the prefetch.
const runViewResult = vi.hoisted(() => ({ current: { Success: true, Results: [] as Array<Record<string, unknown>> } }));
const lastRunViewParams = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            async RunView(params: Record<string, unknown>) { lastRunViewParams.current = params; return runViewResult.current; }
        },
    };
});

const { IntegrationEngine } = await import('../IntegrationEngine.js');
const { CONTENT_HASH_COLUMN } = await import('../ContentHash.js');

type Precheck = { Hashes: Map<string, string>; Present: Set<string>; CoversWholeBatch: boolean };
type PrefetchHost = {
    PrefetchContentHashes: (batch: unknown[], user: unknown) => Promise<Precheck | undefined>;
    extractMappedPrimaryKey: (record: unknown, pkFields: Array<{ Name: string }>) => string | null;
    isProvablyAbsent: (mappedPK: string | null, precheck: Precheck | undefined) => boolean;
};

const pkField = { Name: 'id' };

/** Drives the real PrefetchContentHashes with RunView's result scripted. */
function makeHost(rows: Array<Record<string, unknown>>, success = true) {
    runViewResult.current = { Success: success, Results: rows };
    const entityInfo = { Fields: [{ Name: 'id' }, { Name: CONTENT_HASH_COLUMN }], PrimaryKeys: [pkField] };
    // The REAL extractMappedPrimaryKey runs — no stub. The first version of this file stubbed it
    // with an OBJECT-returning fake while the real method returns a '|'-joined STRING; every test
    // passed while the production code indexed that string with field names and computed '' for
    // every record. A fake that disagrees with the real shape makes the whole file vacuous.
    const host = Object.create(IntegrationEngine.prototype) as unknown as PrefetchHost & Record<string, unknown>;
    Object.defineProperty(host, 'ProviderToUse', {
        value: {
            EntityByName: () => entityInfo,
            // Dialect is a quoter, not a name — the prefetch builds its WHERE through it.
            Dialect: {
                QuoteIdentifier: (n: string) => `[${n}]`,
                QuoteStringLiteral: (v: string) => `'${v.replace(/'/g, "''")}'`,
            },
        },
        configurable: true,
    });
    return host;
}

const created = (id: string | null) => ({
    MJEntityName: 'Contacts', ChangeType: 'Create',
    MappedFields: id == null ? {} : { id },
    ExternalRecord: { ExternalID: String(id) },
});
const updated = (id: string) => ({
    MJEntityName: 'Contacts', ChangeType: 'Update', MatchedMJRecordID: id,
    MappedFields: { id }, ExternalRecord: { ExternalID: id },
});

describe('PrefetchContentHashes — presence is separate from hash', () => {
    it('records a row as PRESENT even when it carries no content hash', async () => {
        // A row written before hashing existed, or hashed NULL, is still a row. Treating "absent
        // from the hash map" as "absent from the table" would turn its update into a second insert.
        const host = makeHost([{ id: 'a', [CONTENT_HASH_COLUMN]: null }]);
        const out = await host.PrefetchContentHashes([updated('a')], {});
        expect(out?.Present.has('a')).toBe(true);
        expect(out?.Hashes.has('a')).toBe(false);
    });

    it('asks about CREATE-path keys too, not just matched updates', async () => {
        const host = makeHost([{ id: 'x', [CONTENT_HASH_COLUMN]: 'h' }]);
        const out = await host.PrefetchContentHashes([created('x'), created('y')], {});
        expect(out?.Present.has('x')).toBe(true);
        expect(out?.Present.has('y')).toBe(false); // asked about, and genuinely not there
        expect(out?.CoversWholeBatch).toBe(true);
    });

    it('refuses to claim coverage when a record has no knowable key', async () => {
        // A destination-generated key (identity / server-assigned UUID) cannot be known before the
        // insert, so this batch cannot prove anything absent.
        const host = makeHost([{ id: 'x', [CONTENT_HASH_COLUMN]: 'h' }]);
        const out = await host.PrefetchContentHashes([created('x'), created(null)], {});
        expect(out?.CoversWholeBatch).toBe(false);
    });

    it('returns nothing at all when the query fails — unknown, never "not there"', async () => {
        const host = makeHost([], false);
        const out = await host.PrefetchContentHashes([created('x')], {});
        expect(out).toBeUndefined();
    });
});

describe('the key SHAPES agree end to end (the regression that shipped)', () => {
    // Every assertion here runs the REAL extractor against the REAL prefetch and the REAL decision.
    // No re-implementation of the key on either side — a shape disagreement between the extractor
    // and Present's keying is exactly what these exist to catch.

    it('extractMappedPrimaryKey returns the "|"-joined STRING, not a field map', () => {
        const host = makeHost([]);
        const key = host.extractMappedPrimaryKey(created('ext-123'), [pkField]);
        expect(key).toBe('ext-123');
        const composite = host.extractMappedPrimaryKey(
            { MappedFields: { a: 'v1', b: 'v2' } }, [{ Name: 'a' }, { Name: 'b' }]);
        expect(composite).toBe('v1|v2');
    });

    it('an EXISTING row is never provably absent — the duplicate scenario', async () => {
        // The bug: an existing row reaching the create path (record map deleted, fresh
        // CompanyIntegration over pre-existing rows, MatchEngine "Create") was judged absent
        // because the derived lookup key was '' — and got a second INSERT. The real key must
        // hit Present, and the decision must say "not absent", forcing the load-then-update.
        const host = makeHost([{ id: 'ext-123', [CONTENT_HASH_COLUMN]: 'h' }]);
        const out = await host.PrefetchContentHashes([created('ext-123'), created('brand-new')], {});
        expect(out?.CoversWholeBatch).toBe(true);
        const keyExisting = host.extractMappedPrimaryKey(created('ext-123'), [pkField]);
        const keyNew = host.extractMappedPrimaryKey(created('brand-new'), [pkField]);
        expect(host.isProvablyAbsent(keyExisting, out)).toBe(false);   // must load, must NOT insert
        expect(host.isProvablyAbsent(keyNew, out)).toBe(true);         // genuinely new — elide the load
    });

    it('composite keys agree between extractor and Present', async () => {
        const pkFields = [{ Name: 'a' }, { Name: 'b' }];
        runViewResult.current = { Success: true, Results: [{ a: 'v1', b: 'v2', [CONTENT_HASH_COLUMN]: 'h' }] };
        const host = Object.create(IntegrationEngine.prototype) as unknown as PrefetchHost & Record<string, unknown>;
        Object.defineProperty(host, 'ProviderToUse', {
            value: {
                EntityByName: () => ({ Fields: [{ Name: 'a' }, { Name: 'b' }, { Name: CONTENT_HASH_COLUMN }], PrimaryKeys: pkFields }),
                Dialect: { QuoteIdentifier: (n: string) => `[${n}]`, QuoteStringLiteral: (v: string) => `'${v}'` },
            },
            configurable: true,
        });
        const rec = { MJEntityName: 'X', ChangeType: 'Create', MappedFields: { a: 'v1', b: 'v2' }, ExternalRecord: { ExternalID: 'v1' } };
        const out = await host.PrefetchContentHashes([rec], {});
        expect(host.isProvablyAbsent(host.extractMappedPrimaryKey(rec, pkFields), out)).toBe(false);
    });

    it('a key created during the batch stops being "absent" — mid-flush replay safety', async () => {
        // MJ_INTEGRATION_BATCH_FLUSH_AT commits part of a batch. If a later record then fails, the
        // per-record fallback re-applies the WHOLE batch against the SAME precheck object. A row
        // this run already inserted was honestly absent at prefetch time, so without recording it
        // the replay would "prove" it absent again and insert a duplicate. CreateRecord adds the
        // key to Present the moment it creates; this asserts the resulting decision flips.
        const host = makeHost([]);
        const out = await host.PrefetchContentHashes([created('new-1')], {});
        const key = host.extractMappedPrimaryKey(created('new-1'), [pkField])!;
        expect(host.isProvablyAbsent(key, out)).toBe(true);    // first pass: genuinely new, elide the load
        out!.Present.add(key);                                  // what CreateRecord does on the create path
        expect(host.isProvablyAbsent(key, out)).toBe(false);    // replay: must load, must NOT insert again
    });

    it('CreateRecord records the key it just created', () => {
        // Source-level because no CreateRecord harness exists (it needs Metadata, entity objects and
        // validation to drive). The behaviour it guards is asserted above; this only pins that the
        // production path actually performs the Present.add the replay-safety argument depends on.
        const src = readFileSync(join(__dirname, '..', 'IntegrationEngine.ts'), 'utf8');
        expect(src).toMatch(/if \(!existed && mappedPK != null && precheck\) \{\s*\n\s*precheck\.Present\.add\(mappedPK\);/);
    });

    it('no proof, no elision: partial coverage or a missing precheck always loads', () => {
        const host = makeHost([]);
        expect(host.isProvablyAbsent('k', undefined)).toBe(false);
        expect(host.isProvablyAbsent('k', { Hashes: new Map(), Present: new Set(), CoversWholeBatch: false })).toBe(false);
        expect(host.isProvablyAbsent(null, { Hashes: new Map(), Present: new Set(), CoversWholeBatch: true })).toBe(false);
    });
});

describe('the prefetch is unbounded — its result is what absence proofs are judged against', () => {
    it('passes IgnoreMaxRows so a row-limit default can never truncate the proof', async () => {
        // A plain RunView falls back to the entity's UserViewMaxRows (default 1000). CoversWholeBatch
        // is computed from the REQUEST side and never reconciled against res.Results.length, so a
        // silently truncated response marks every existing row beyond the cap "provably absent" —
        // and each one is re-INSERTed as a duplicate on every sync. The batch size happening to sit
        // under the default cap is a margin, not a guard.
        const host = makeHost([]);
        await host.PrefetchContentHashes([created('x')], {});
        expect(lastRunViewParams.current?.['IgnoreMaxRows']).toBe(true);
    });

    it('passes BypassCache so per-batch results never accumulate in a result cache', async () => {
        // Every prefetch queries THIS batch's keys, so its cache fingerprint is unique and a
        // cached result can never be hit again. With a result cache active, each batch deposits
        // one dead entry — memory grows O(records processed) for the life of the process, and a
        // full-history first sync (~500k records, measured) exhausts a default node heap. The
        // match lookups already bypass for correctness; the prefetch bypasses for survival.
        const host = makeHost([]);
        await host.PrefetchContentHashes([created('x')], {});
        expect(lastRunViewParams.current?.['BypassCache']).toBe(true);
    });
});
