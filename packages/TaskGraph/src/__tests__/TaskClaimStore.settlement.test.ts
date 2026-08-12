/**
 * The guarded writes that make settlement survive a second instance (P3/P4, PR #3745).
 *
 * These assert the SQL, because in this store **the statement IS the guarantee**. There is no
 * behaviour to observe apart from what the database is asked to do: a predicate dropped from a WHERE
 * clause turns a compare-and-swap into a last-write-wins update, which is exactly the defect P4
 * exists to remove, and it would leave every mock-based test green.
 *
 * The atomicity claims themselves belong in IT74, where a real database answers. What belongs here
 * is that the statements say what we think they say.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskClaimStore } from '../TaskClaimStore';
import { ParseTaskGraphParentMetadata } from '../TaskGraphService';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

/** Captures the SQL a method issues, and answers with a caller-chosen rowcount. */
function recordingProvider(rowsAffected = 1) {
    const statements: string[] = [];
    const provider = {
        MJCoreSchemaName: '__mj',
        QuoteIdentifier: (id: string) => `[${id}]`,
        ExecuteSQL: async (sql: string) => {
            statements.push(sql);
            return [{ AffectedRows: rowsAffected }];
        },
    } as unknown as IMetadataProvider;
    return { provider, statements };
}

const USER = {} as UserInfo;
const PARENT = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';

describe('TrySettleParent — the terminal write is column-scoped and guarded', () => {
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('refuses to move a parent that is already terminal', async () => {
        const { provider, statements } = recordingProvider();
        await store.TrySettleParent(provider, PARENT, 'Complete', 100, USER);
        expect(statements[0]).toContain(`NOT IN ('Complete','Failed','Cancelled','Skipped')`);
    });

    it('writes ONLY status, progress and completion — never the payload', async () => {
        // The whole point. `GenerateSaveSQL` sends every updateable column on every `Save()`, so a
        // full-row terminal write carries this instance's `InputPayload` snapshot — and if another
        // instance has just claimed the continuation marker inside that JSON, the marker is erased
        // and the settlement delivers twice. For `reinvoke` that is a second billed agent turn.
        const { provider, statements } = recordingProvider();
        await store.TrySettleParent(provider, PARENT, 'Complete', 100, USER);

        const setClause = statements[0].split('WHERE')[0];
        expect(setClause).toContain('[Status]');
        expect(setClause).toContain('[PercentComplete]');
        expect(setClause).toContain('[CompletedAt]');
        expect(setClause).not.toContain('[InputPayload]');
        expect(setClause).not.toContain('[OutputPayload]');
        expect(setClause).not.toContain('[Configuration]');
    });

    it('reports false when the row was already terminal — the rowcount is the verdict', async () => {
        const { provider } = recordingProvider(0);
        expect(await store.TrySettleParent(provider, PARENT, 'Complete', 100, USER)).toBe(false);
    });
});

describe('TryStampParentStart — once-only, and equally narrow', () => {
    it('guards on StartedAt being unset and touches nothing else', async () => {
        const { provider, statements } = recordingProvider();
        await new TaskClaimStore('i', 300).TryStampParentStart(provider, PARENT, new Date('2026-08-11T00:00:00.000Z'), USER);

        expect(statements[0]).toContain('[StartedAt] IS NULL');
        expect(statements[0].split('WHERE')[0]).not.toContain('[InputPayload]');
    });
});

describe('TryClaimContinuation — a real compare-and-swap', () => {
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('requires the marker to be ABSENT, in the statement itself', async () => {
        // This was Load → check → `Save()`: two dispatchers both read "no marker", both saved, both
        // delivered. The predicate is what makes exactly-one true; without it the method is a
        // last-write-wins update wearing the name of a CAS.
        const { provider, statements } = recordingProvider();
        await store.TryClaimContinuation(provider, PARENT, 'delivered', USER);
        expect(statements[0]).toContain(`JSON_VALUE([InputPayload], '$.continuationDeliveredAt') IS NULL`);
    });

    it('refuses a row whose payload is not JSON, rather than overwriting it', async () => {
        // `JSON_MODIFY` against unparseable content would fail the statement; the ISJSON guard makes
        // that an honest zero-rowcount instead. A graph whose metadata we cannot read is one we must
        // not deliver for.
        const { provider, statements } = recordingProvider();
        await store.TryClaimContinuation(provider, PARENT, 'delivered', USER);
        expect(statements[0]).toContain('ISJSON([InputPayload]) = 1');
    });

    it('loses the race quietly when another instance claimed first', async () => {
        const { provider } = recordingProvider(0);
        expect(await store.TryClaimContinuation(provider, PARENT, 'delivered', USER)).toBe(false);
    });

    it('records HOW it was delivered, so an expired settlement stays distinguishable', async () => {
        const { provider, statements } = recordingProvider();
        await store.TryClaimContinuation(provider, PARENT, 'expired', USER);
        expect(statements[0]).toContain(`'$.continuationDeliveredAs', 'expired'`);
    });

    it('writes a timestamp the TypeScript reader can parse — the round trip', async () => {
        // Writer is SQL (`JSON_MODIFY`), reader is TS (`ParseTaskGraphParentMetadata`). They are
        // pinned to each other by format alone, so the format is asserted: ISO 8601 UTC.
        const { provider, statements } = recordingProvider();
        await store.TryClaimContinuation(provider, PARENT, 'delivered', USER);

        const written = /\$\.continuationDeliveredAt', '([^']+)'/.exec(statements[0])?.[1];
        expect(written).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

        // The value the reader would see once JSON_MODIFY has applied it.
        const meta = ParseTaskGraphParentMetadata(JSON.stringify({ continuationDeliveredAt: written }));
        expect(meta.continuationDeliveredAt).toBe(written);
        expect(new Date(meta.continuationDeliveredAt!).toISOString()).toBe(written);
    });

    it('a payload with no marker parses as undelivered — what the sweep keys on', async () => {
        // The third sweep arm decides "terminal but unsettled" from this. If an absent marker parsed
        // as anything other than undefined, the rescue would never fire.
        expect(ParseTaskGraphParentMetadata(JSON.stringify({ continuation: 'message' })).continuationDeliveredAt)
            .toBeUndefined();
        expect(ParseTaskGraphParentMetadata(null).continuationDeliveredAt).toBeUndefined();
        expect(ParseTaskGraphParentMetadata('not json').continuationDeliveredAt).toBeUndefined();
    });
});
