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
const WORKFLOW_TYPE = '11111111-2222-3333-4444-555555555555';

describe('TrySettleParent — the terminal write is column-scoped and guarded', () => {
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('refuses to move a parent that is already terminal', async () => {
        const { provider, statements } = recordingProvider();
        await store.TrySettleParent(provider, PARENT, 'Complete', 100, USER);
        // 'Blocked' belongs in this set: a graph blocked by an unsatisfiable dependency is settled,
        // and omitting it would let a later pass move it back out of a terminal state.
        expect(statements[0]).toContain(`NOT IN ('Complete','Failed','Cancelled','Skipped','Blocked')`);
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

describe('TryUpdateParentProgress — the NON-terminal write needs the same guard', () => {
    // The terminal write was the obvious race; this one is easier to hit and was left open. An
    // instance that computed a non-terminal rollup from a snapshot taken before another instance
    // settled would, with a full-row save, revert the status AND erase the continuation marker
    // riding in the same row — after which the next pass settles and delivers a second time.
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('refuses to move a parent that has already settled', async () => {
        const { provider, statements } = recordingProvider();
        await store.TryUpdateParentProgress(provider, PARENT, 'In Progress', 40, USER);
        expect(statements[0]).toContain(`NOT IN ('Complete','Failed','Cancelled','Skipped','Blocked')`);
    });

    it('writes status and progress only — never a payload column', async () => {
        const { provider, statements } = recordingProvider();
        await store.TryUpdateParentProgress(provider, PARENT, 'In Progress', 40, USER);

        const setClause = statements[0].split('WHERE')[0];
        expect(setClause).toContain('[Status]');
        expect(setClause).toContain('[PercentComplete]');
        expect(setClause).not.toContain('[InputPayload]');
        expect(setClause).not.toContain('[OutputPayload]');
        expect(setClause).not.toContain('[CompletedAt]');
    });

    it('does not resurrect a settled graph — the rowcount reports the no-op', async () => {
        const { provider } = recordingProvider(0);
        expect(await store.TryUpdateParentProgress(provider, PARENT, 'In Progress', 40, USER)).toBe(false);
    });
});

describe('TrySetParentOutput — the early-finish message, and nothing else', () => {
    it('writes OutputPayload alone, so a late save cannot revert a settle', async () => {
        // A task that ends the flow early skips its siblings — which makes the graph terminal, so
        // another instance can settle and claim between the load and this write.
        const { provider, statements } = recordingProvider();
        await new TaskClaimStore('i', 300)
            .TrySetParentOutput(provider, PARENT, '{"message":"stopped"}', WORKFLOW_TYPE, USER);

        const setClause = statements[0].split('WHERE')[0];
        expect(setClause).toContain('[OutputPayload]');
        expect(setClause).not.toContain('[Status]');
        expect(setClause).not.toContain('[InputPayload]');
        expect(statements[0]).toContain(`[TypeID] = '${WORKFLOW_TYPE}'`);
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
        await store.TryClaimContinuation(provider, PARENT, 'delivered', WORKFLOW_TYPE, USER);
        expect(statements[0]).toContain(`JSON_VALUE([InputPayload], '$.continuationDeliveredAt') IS NULL`);
    });

    it('refuses a row whose payload is not JSON, rather than overwriting it', async () => {
        // `JSON_MODIFY` against unparseable content would fail the statement; the ISJSON guard makes
        // that an honest zero-rowcount instead. A graph whose metadata we cannot read is one we must
        // not deliver for.
        const { provider, statements } = recordingProvider();
        await store.TryClaimContinuation(provider, PARENT, 'delivered', WORKFLOW_TYPE, USER);
        expect(statements[0]).toContain('ISJSON([InputPayload]) = 1');
    });

    it('loses the race quietly when another instance claimed first', async () => {
        const { provider } = recordingProvider(0);
        expect(await store.TryClaimContinuation(provider, PARENT, 'delivered', WORKFLOW_TYPE, USER)).toBe(false);
    });

    it('records HOW it was delivered, so an expired settlement stays distinguishable', async () => {
        const { provider, statements } = recordingProvider();
        await store.TryClaimContinuation(provider, PARENT, 'expired', WORKFLOW_TYPE, USER);
        expect(statements[0]).toContain(`'$.continuationDeliveredAs', 'expired'`);
    });

    it('writes a timestamp the TypeScript reader can parse — the round trip', async () => {
        // Writer is SQL (`JSON_MODIFY`), reader is TS (`ParseTaskGraphParentMetadata`). They are
        // pinned to each other by format alone, so the format is asserted: ISO 8601 UTC.
        const { provider, statements } = recordingProvider();
        await store.TryClaimContinuation(provider, PARENT, 'delivered', WORKFLOW_TYPE, USER);

        const written = /\$\.continuationDeliveredAt', '([^']+)'/.exec(statements[0])?.[1];
        expect(written).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

        // The value the reader would see once JSON_MODIFY has applied it.
        const meta = ParseTaskGraphParentMetadata(JSON.stringify({ continuationDeliveredAt: written }));
        expect(meta.continuationDeliveredAt).toBe(written);
        expect(new Date(meta.continuationDeliveredAt!).toISOString()).toBe(written);
    });

    it('will only ever touch a WORKFLOW task, stated in the statement', async () => {
        // `MJ: Tasks` is general-purpose — conversation tasks and users' own to-dos share the table.
        // This statement injects keys into a row's InputPayload, so a mis-derived ID would silently
        // edit somebody's data. The discriminator is a required argument rather than an optional
        // filter precisely so no caller can omit it.
        const { provider, statements } = recordingProvider();
        await store.TryClaimContinuation(provider, PARENT, 'delivered', WORKFLOW_TYPE, USER);
        expect(statements[0]).toContain(`[TypeID] = '${WORKFLOW_TYPE}'`);
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
