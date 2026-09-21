import { describe, it, expect } from 'vitest';
import { IntegrationEngine } from '../IntegrationEngine.js';
import { CONTENT_HASH_COLUMN, computeContentHash } from '../ContentHash.js';

/**
 * A row whose stored content hash no longer matches must be repaired, not skipped forever.
 *
 * The case that produces one: the source stops sending a column. The mapper OMITS an absent key
 * rather than mapping it to null — a missing value is not a null value — so the recomputed hash
 * differs. But `SetEntityFields` never touches that column either, so the entity is NOT dirty and
 * the unchanged-record skip fires. The stored hash is then never refreshed and the mismatch is
 * PERMANENT: that row loses the content-hash fast path forever, paying a full load and a
 * field-by-field compare on every sync until some other field happens to change.
 *
 * The repair is one write. It does NOT conclude the column is gone — absence in the data is not
 * evidence of absence in the schema.
 */
type Host = {
    needsSyncStateRepair: (
        entity: { Get(f: string): unknown },
        entityInfo: { Fields: Array<{ Name: string }> } | undefined,
        record?: { MappedFields?: Record<string, unknown> },
    ) => boolean;
};

const host = () => Object.create(IntegrationEngine.prototype) as unknown as Host;

const info = (...names: string[]) => ({ Fields: names.map(Name => ({ Name })) });
const entityWith = (values: Record<string, unknown>) => ({ Get: (f: string) => values[f] });

const FULL = { id: 'ext-1', name: 'Ada', nickname: 'A' };
const MISSING_COLUMN = { id: 'ext-1', name: 'Ada' };   // source stopped sending `nickname`

describe('needsSyncStateRepair — a stale content hash re-converges', () => {
    it('repairs a row whose stored hash no longer matches what we now map', () => {
        const stored = computeContentHash(FULL);
        const h = host();
        expect(
            h.needsSyncStateRepair(
                entityWith({ [CONTENT_HASH_COLUMN]: stored }),
                info(CONTENT_HASH_COLUMN),
                { MappedFields: MISSING_COLUMN },
            ),
        ).toBe(true);
    });

    it('leaves a matching row alone — the skip is the whole point of hashing', () => {
        const stored = computeContentHash(FULL);
        const h = host();
        expect(
            h.needsSyncStateRepair(
                entityWith({ [CONTENT_HASH_COLUMN]: stored }),
                info(CONTENT_HASH_COLUMN),
                { MappedFields: FULL },
            ),
        ).toBe(false);
    });

    it('does not fire on a row that has no stored hash yet', () => {
        // Nothing to re-converge: the write path stamps one the first time it touches the row, and
        // treating "no hash" as "stale" would rewrite every pre-hash row on every sync.
        const h = host();
        for (const stored of [null, undefined, '']) {
            expect(
                h.needsSyncStateRepair(
                    entityWith({ [CONTENT_HASH_COLUMN]: stored }),
                    info(CONTENT_HASH_COLUMN),
                    { MappedFields: FULL },
                ),
            ).toBe(false);
        }
    });

    it('does not fire on a table without the hash column at all', () => {
        const h = host();
        expect(h.needsSyncStateRepair(entityWith({}), info('id'), { MappedFields: FULL })).toBe(false);
    });

    it('is inert when no record is supplied — callers that cannot know stay unaffected', () => {
        const h = host();
        expect(
            h.needsSyncStateRepair(
                entityWith({ [CONTENT_HASH_COLUMN]: computeContentHash(FULL) }),
                info(CONTENT_HASH_COLUMN),
            ),
        ).toBe(false);
    });

    it('still repairs the pre-existing sync-state cases, hash or no hash', () => {
        // Regression guard: folding hash staleness in must not weaken tombstone / error recovery.
        const h = host();
        const matching = { [CONTENT_HASH_COLUMN]: computeContentHash(FULL) };
        expect(h.needsSyncStateRepair(
            entityWith({ ...matching, __mj_integration_IsTombstoned: true }),
            info(CONTENT_HASH_COLUMN, '__mj_integration_IsTombstoned'), { MappedFields: FULL })).toBe(true);
        expect(h.needsSyncStateRepair(
            entityWith({ ...matching, __mj_integration_SyncMessage: 'boom' }),
            info(CONTENT_HASH_COLUMN, '__mj_integration_SyncMessage'), { MappedFields: FULL })).toBe(true);
        expect(h.needsSyncStateRepair(
            entityWith({ ...matching, __mj_integration_SyncStatus: 'Error' }),
            info(CONTENT_HASH_COLUMN, '__mj_integration_SyncStatus'), { MappedFields: FULL })).toBe(true);
    });

    it('the repair write is what re-converges it — the hash is recomputed from MappedFields', () => {
        // SetStandardIntegrationFields stamps CONTENT_HASH_COLUMN from record.MappedFields, so the
        // write this triggers stores the hash of what we now map. The NEXT sync then matches and
        // skips: the repair happens once, not every run.
        const afterRepair = computeContentHash(MISSING_COLUMN);
        const h = host();
        expect(
            h.needsSyncStateRepair(
                entityWith({ [CONTENT_HASH_COLUMN]: afterRepair }),
                info(CONTENT_HASH_COLUMN),
                { MappedFields: MISSING_COLUMN },
            ),
        ).toBe(false);
    });
});
