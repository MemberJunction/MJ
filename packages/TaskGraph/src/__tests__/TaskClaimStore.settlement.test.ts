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

describe('reclamation covers every task a dispatcher can execute (R2-1)', () => {
    // The predicate here decides whether a crashed task is ever recoverable. It scoped to
    // `AgentID OR ActionID` — written before `PromptID` existed — so a prompt task whose owner died
    // was excluded from both statements: never returned to Pending, never retaken (TryClaim needs
    // `Status='Pending'`), and not even reported by the orphan sweep. The graph wedges In Progress
    // forever, its run stays Paused forever, and the stall detector calls it healthy because an
    // In Progress node counts as active. There is no symptom to assert on — only the predicate.
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('releases an expired claim on a PROMPT task, not just agent and action ones', async () => {
        const { provider, statements } = recordingProvider();
        await store.ReleaseExpiredClaims(provider, USER);
        // Both statements — the SELECT that names what will be reclaimed, and the UPDATE that
        // reclaims it — must agree, or the log describes a different set than the write touches.
        for (const sql of statements) {
            expect(sql).toContain('[PromptID] IS NOT NULL');
        }
    });

    it('reports an orphaned PROMPT task rather than leaving it invisible', async () => {
        const { provider, statements } = recordingProvider();
        await store.FindOrphanedInProgress(provider, USER);
        expect(statements[0]).toContain('[PromptID] IS NOT NULL');
    });

    it('still exempts tasks a person completes — reclaiming those would reset an approval', async () => {
        const { provider, statements } = recordingProvider();
        await store.ReleaseExpiredClaims(provider, USER);
        // The exemption is expressed as "has no executor", so an unassigned human step (legitimate:
        // "somebody needs to look at this") stays exempt too.
        expect(statements[0]).toContain('[AgentID] IS NOT NULL');
        expect(statements[0]).toContain('[ActionID] IS NOT NULL');
    });
});

describe('TrySkipPending — a skip must not overwrite work that started (R3-1)', () => {
    // R2-10 moved the early-finish skips after `CompleteClaimed`, on the premise that "the siblings
    // are Pending and unclaimed until the skip lands". They are not: `executeClaimed` is not
    // awaited, so this instance's own poll tick runs concurrently with the skip loop, and a sibling
    // can be claimed and STARTED between the snapshot and its write. A full-row save then reverted
    // `In Progress` to `Skipped` mid-execution — the agent's side effects had fired, its completion
    // was refused by the claim guard, and its output was discarded, with the graph settling
    // `Complete` and nothing recording that the step ran.
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('refuses a task that is no longer Pending — the status IS the claim test', () => {
        const { provider, statements } = recordingProvider();
        return store.TrySkipPending(provider, PARENT, USER).then(() => {
            expect(statements[0]).toContain(`[Status] = 'Pending'`);
        });
    });

    it('writes Status and nothing else', async () => {
        const { provider, statements } = recordingProvider();
        await store.TrySkipPending(provider, PARENT, USER);
        const setClause = statements[0].split('WHERE')[0];
        expect(setClause).toContain(`[Status] = 'Skipped'`);
        expect(setClause).not.toContain('[ClaimedBy]');
        expect(setClause).not.toContain('[OutputPayload]');
        expect(setClause).not.toContain('[AgentRunID]');
    });

    it('does NOT test ClaimedBy — a notified human task carries a marker and must stay skippable', async () => {
        // `TryClaim` moves a task to `In Progress` in the same statement that stamps `ClaimedBy`, so
        // an executor's task is never `Pending` and the status covers it. Adding `ClaimedBy IS NULL`
        // would look like defence in depth and would instead refuse to skip a notified human step,
        // which is a case the early-finish path exists to handle.
        const { provider, statements } = recordingProvider();
        await store.TrySkipPending(provider, PARENT, USER);
        expect(statements[0]).not.toContain('[ClaimedBy] IS NULL');
    });

    it('reports the loss when something claimed it first — the rowcount is the verdict', async () => {
        const { provider } = recordingProvider(0);
        expect(await store.TrySkipPending(provider, PARENT, USER)).toBe(false);
    });
});

describe('TryMarkHumanNotified — once-only, and it cannot revert a status (R3-5)', () => {
    it('guards on the marker being unset and on the task still being Pending', async () => {
        const { provider, statements } = recordingProvider();
        await new TaskClaimStore('i', 300).TryMarkHumanNotified(provider, PARENT, '__human-notified__', USER);
        expect(statements[0]).toContain(`[Status] = 'Pending'`);
        expect(statements[0]).toContain('[ClaimedBy] IS NULL');
    });

    it('writes the marker column alone', async () => {
        const { provider, statements } = recordingProvider();
        await new TaskClaimStore('i', 300).TryMarkHumanNotified(provider, PARENT, '__human-notified__', USER);
        const setClause = statements[0].split('WHERE')[0];
        expect(setClause).toContain('[ClaimedBy]');
        expect(setClause).not.toContain('[Status]');
        expect(setClause).not.toContain('[OutputPayload]');
    });
});

describe('TryCancelTask — a cancel must not overwrite an outcome that landed first (R3-9)', () => {
    // `Cancel` tested the terminal set against an in-memory snapshot and wrote with a full-row
    // `Save()` — every updateable column, PK-only predicate. A child whose guarded `CompleteClaimed`
    // landed between that load and its save had its whole outcome overwritten: Complete back to
    // Cancelled, OutputPayload to NULL, AgentRunID and CompletedAt reverted, stale claim columns
    // re-instated on a terminal row. The moment users cancel is exactly when tasks are running.
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('svc', 0); });

    it('refuses a child that has already settled — the check is IN the statement', async () => {
        const { provider, statements } = recordingProvider();
        await store.TryCancelTask(provider, PARENT, USER);
        expect(statements[0]).toContain(`NOT IN ('Complete','Failed','Cancelled','Skipped','Blocked')`);
    });

    it('writes Status and nothing else — the columns the full-row save was destroying', async () => {
        const { provider, statements } = recordingProvider();
        await store.TryCancelTask(provider, PARENT, USER);
        const setClause = statements[0].split('WHERE')[0];
        expect(setClause).toContain(`[Status] = 'Cancelled'`);
        for (const column of ['[OutputPayload]', '[AgentRunID]', '[CompletedAt]', '[Configuration]', '[ClaimedBy]']) {
            expect(setClause).not.toContain(column);
        }
    });

    it('reports the loss so the verdict can stay honest', async () => {
        const { provider } = recordingProvider(0);
        expect(await store.TryCancelTask(provider, PARENT, USER)).toBe(false);
    });
});

describe('TryDeclareEarlyFinish — the decision has to outlive one instance\'s memory (R3-1)', () => {
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('stamps the parent once, refusing a second declaration', async () => {
        // Two tasks can end the same flow; the first declaration is the one that counts, exactly as
        // with the continuation marker.
        const { provider, statements } = recordingProvider();
        await store.TryDeclareEarlyFinish(provider, PARENT, WORKFLOW_TYPE, USER);
        expect(statements[0]).toContain(`JSON_VALUE([InputPayload], '$.earlyFinishedAt') IS NULL`);
    });

    it('is type-scoped like every other statement here that writes a payload', async () => {
        const { provider, statements } = recordingProvider();
        await store.TryDeclareEarlyFinish(provider, PARENT, WORKFLOW_TYPE, USER);
        expect(statements[0]).toContain(`[TypeID] = '${WORKFLOW_TYPE}'`);
        expect(statements[0]).toContain('ISJSON([InputPayload]) = 1');
    });

    it('writes a timestamp the TS reader can parse', async () => {
        const { provider, statements } = recordingProvider();
        await store.TryDeclareEarlyFinish(provider, PARENT, WORKFLOW_TYPE, USER);
        const written = /\$\.earlyFinishedAt', '([^']+)'/.exec(statements[0])?.[1];
        expect(written).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(ParseTaskGraphParentMetadata(JSON.stringify({ earlyFinishedAt: written })).earlyFinishedAt)
            .toBe(written);
    });

    it('a graph with no declaration parses as not-early-finished', () => {
        expect(ParseTaskGraphParentMetadata('{"continuation":"message"}').earlyFinishedAt).toBeUndefined();
        expect(ParseTaskGraphParentMetadata(null).earlyFinishedAt).toBeUndefined();
    });
});

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
