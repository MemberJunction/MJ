import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Scripted by each test before it drives the prefetch.
const runViewResult = vi.hoisted(() => ({ current: { Success: true, Results: [] as Array<Record<string, unknown>> } }));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            async RunView() { return runViewResult.current; }
        },
    };
});

const { IntegrationEngine } = await import('../IntegrationEngine.js');
const { CONTENT_HASH_COLUMN } = await import('../ContentHash.js');

type PrefetchHost = {
    PrefetchContentHashes: (batch: unknown[], user: unknown) => Promise<{
        Hashes: Map<string, string>;
        Present: Set<string>;
        CoversWholeBatch: boolean;
    } | undefined>;
};

const pkField = { Name: 'id' };

/** Drives the real PrefetchContentHashes with RunView's result scripted. */
function makeHost(rows: Array<Record<string, unknown>>, success = true) {
    runViewResult.current = { Success: success, Results: rows };
    const entityInfo = { Fields: [{ Name: 'id' }, { Name: CONTENT_HASH_COLUMN }], PrimaryKeys: [pkField] };
    const host = Object.create(IntegrationEngine.prototype) as unknown as PrefetchHost & Record<string, unknown>;
    Object.assign(host, {
        extractMappedPrimaryKey: (r: { MappedFields?: Record<string, unknown> }) =>
            r.MappedFields?.id != null ? { id: r.MappedFields.id } : null,
    });
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

describe('CreateRecord — the elision is gated on proof', () => {
    const source = readFileSync(join(__dirname, '..', 'IntegrationEngine.ts'), 'utf8');

    it('skips the existence load ONLY when the batch covered every record and this key was missing', () => {
        const m = source.match(/const provablyAbsent =[\s\S]{0,400}?;/);
        expect(m).not.toBeNull();
        const decl = m![0];
        expect(decl).toMatch(/precheck\?\.CoversWholeBatch === true/);
        expect(decl).toMatch(/!precheck\.Present\.has\(/);
        expect(decl).toMatch(/mappedPK != null/);
    });

    it('still loads whenever absence is not proven', () => {
        expect(source).toMatch(/const existed = mappedPK != null && !provablyAbsent/);
    });
});
