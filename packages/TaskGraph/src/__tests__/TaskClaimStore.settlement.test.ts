/**
 * The guarded writes that make settlement survive a second instance (P3/P4, PR #3745), now that the
 * statements live in stored procedures (#4575).
 *
 * **In this store the statement IS the guarantee.** There is no behaviour to observe apart from what
 * the database is asked to do: a predicate dropped from a WHERE clause turns a compare-and-swap into
 * a last-write-wins update, which is exactly the defect P4 exists to remove, and it would leave
 * every mock-based test green.
 *
 * So these assertions follow the statements. They moved out of TypeScript and into
 * `migrations/v6/V202609191819__v6.2.x__TaskGraph_Guarded_Write_Sprocs.sql`, because a runtime login
 * may execute procedures and may not write tables — so the SQL assertions read the migration, and
 * the TypeScript assertions check that the store calls the right procedure with the right arguments.
 * Between the two, a dropped guard still fails a test.
 *
 * The atomicity claims themselves belong in IT74, where a real database answers.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TaskClaimStore, TERMINAL_PARENT_STATUS_SQL } from '../TaskClaimStore';
import { ParseTaskGraphParentMetadata } from '../TaskGraphService';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { SQLServerDialect } from '@memberjunction/sql-dialect';

// ─── the migration under test ────────────────────────────────────────────────────────────────────

/**
 * Located by suffix, not by full filename: a certified line renames the version in the migration's
 * name (`v6.1.x` rather than `v6.2.x`) while the migration itself is identical, and a hardcoded path
 * would make that rename look like a test failure.
 */
function findMigration(): string {
    const dir = join(__dirname, '../../../../migrations/v6');
    const name = readdirSync(dir).find((f) => f.endsWith('__TaskGraph_Guarded_Write_Sprocs.sql'));
    if (!name) throw new Error(`No TaskGraph guarded-write migration found in ${dir}`);
    return join(dir, name);
}

const MIGRATION = readFileSync(findMigration(), 'utf8');

/** One procedure's body, from CREATE to its terminating END. */
function proc(name: string): string {
    const marker = `CREATE PROCEDURE [\${flyway:defaultSchema}].[${name}]`;
    const start = MIGRATION.indexOf(marker);
    expect(start, `procedure ${name} is missing from the migration`).toBeGreaterThan(-1);
    const end = MIGRATION.indexOf('\nEND;', start);
    expect(end, `procedure ${name} has no END`).toBeGreaterThan(start);
    return MIGRATION.slice(start, end);
}

/** The migration with its comments stripped — the SQL that actually runs. */
function sqlOnly(text: string): string {
    return text.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
}

/** The SET clause of a procedure's single UPDATE — what it writes. */
function setClause(name: string): string {
    const body = proc(name);
    const from = body.indexOf('SET [');
    return body.slice(from, body.indexOf('WHERE', from));
}

/** The WHERE clause — what it guards on. */
function whereClause(name: string): string {
    const body = proc(name);
    return body.slice(body.indexOf('WHERE'));
}

// ─── the store under test ────────────────────────────────────────────────────────────────────────

type Call = { sql: string; values: unknown[] };

/**
 * Captures the procedure calls a method issues and answers with a caller-chosen rowcount.
 *
 * The REAL dialect, not a stub: the call wrapper is `Dialect.ProcedureCallSyntax`, so a provider
 * without one would throw inside the store's catch and every assertion would read `undefined`.
 */
function recordingProvider(rowsAffected = 1, viewRows: unknown[] = []) {
    const calls: Call[] = [];
    const views: Record<string, unknown>[] = [];
    const provider = {
        MJCoreSchemaName: '__mj',
        PlatformKey: 'sqlserver',
        QuoteIdentifier: (id: string) => `[${id}]`,
        BuildParameterPlaceholder: (i: number) => `@p${i}`,
        Dialect: new SQLServerDialect(),
        ExecuteSQL: async (sql: string, values: unknown[]) => {
            calls.push({ sql, values });
            return sql.includes('ReleaseExpiredClaims')
                ? viewRows.map((r) => ({ ID: (r as { ID: string }).ID }))
                : [{ AffectedRows: rowsAffected }];
        },
        RunView: async (params: Record<string, unknown>) => {
            views.push(params);
            return { Success: true, Results: viewRows };
        },
    } as unknown as IMetadataProvider;
    return { provider, calls, views };
}

/** A provider whose every write is refused, the way a missing GRANT refuses one. */
function deniedProvider() {
    const provider = {
        MJCoreSchemaName: '__mj',
        PlatformKey: 'sqlserver',
        QuoteIdentifier: (id: string) => `[${id}]`,
        BuildParameterPlaceholder: (i: number) => `@p${i}`,
        Dialect: new SQLServerDialect(),
        ExecuteSQL: async () => {
            throw new Error("The EXECUTE permission was denied on the object 'spTaskGraphClaimTask'");
        },
        RunView: async () => ({ Success: true, Results: [] }),
    } as unknown as IMetadataProvider;
    return provider;
}

const USER = {} as UserInfo;
const PARENT = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';
const WORKFLOW_TYPE = '11111111-2222-3333-4444-555555555555';

/** Every procedure the store calls, paired with the argument list it passes. */
function callTo(calls: Call[], procName: string): Call {
    const call = calls.find((c) => c.sql.includes(procName));
    expect(call, `expected a call to ${procName}, got ${calls.map((c) => c.sql).join(' | ')}`).toBeDefined();
    return call!;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// The TypeScript ↔ SQL contract
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('every procedure the store calls exists, and is executable by the runtime roles (#4575)', () => {
    // This is the defect that motivated the change: the statements were fine and the runtime login
    // could not run them. A procedure shipped without its GRANT reproduces it exactly.
    const CALLED = [...new Set(
        [...readFileSync(join(__dirname, '../TaskClaimStore.ts'), 'utf8').matchAll(/'(spTaskGraph\w+)'/g)]
            .map((m) => m[1]),
    )];

    it('calls at least the whole claim protocol', () => {
        expect(CALLED).toContain('spTaskGraphClaimTask');
        expect(CALLED).toContain('spTaskGraphHeartbeat');
        expect(CALLED).toContain('spTaskGraphCompleteClaimed');
        expect(CALLED.length).toBeGreaterThanOrEqual(20);
    });

    it.each(CALLED.map((name) => [name]))('%s is created by the migration', (name: string) => {
        expect(proc(name)).toContain('UPDATE');
    });

    it.each(CALLED.map((name) => [name]))('%s is granted to the runtime roles', (name: string) => {
        expect(MIGRATION).toContain(
            `GRANT EXECUTE ON [\${flyway:defaultSchema}].[${name}] TO [cdp_Developer], [cdp_Integration];`,
        );
    });

    it('grants nothing on a base table — that is the whole point', () => {
        expect(MIGRATION).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE)\s+ON\s+\[\$\{flyway:defaultSchema\}\]\.\[(Task|AIAgentRun)\]/i);
    });

    it('uses no dynamic SQL, which would break the ownership chain the grants rely on', () => {
        // Comments stripped: the header explains why these are absent, and would match itself.
        const sql = sqlOnly(MIGRATION);
        expect(sql).not.toMatch(/sp_executesql|EXEC\s*\(/i);
        expect(sql).not.toMatch(/EXECUTE\s+AS\s+OWNER/i);
    });

    it('keeps the terminal-status list in step with the code that shares it', () => {
        // Two lists that must agree is how a graph becomes invisible to the machinery meant to
        // rescue it. `Skipped` was missing from the first draft of this migration.
        for (const name of ['spTaskGraphSettleParent', 'spTaskGraphUpdateParentProgress', 'spTaskGraphCancelTask']) {
            expect(whereClause(name)).toContain(`NOT IN (${TERMINAL_PARENT_STATUS_SQL})`);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Reclamation scope
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('reclamation covers every task a dispatcher can execute (R2-1)', () => {
    // The predicate here decides whether a crashed task is ever recoverable. It scoped to
    // `AgentID OR ActionID` — written before `PromptID` existed — so a prompt task whose owner died
    // was excluded: never returned to Pending, never retaken, not even reported. It now lives in the
    // `task-predicates` module and reaches the database through the view filter, which is why these
    // assertions read the filter rather than a statement.
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('releases an expired claim on a PROMPT task, not just agent and action ones', async () => {
        const { provider, views } = recordingProvider();
        await store.ReleaseExpiredClaims(provider, USER);
        expect(views[0].ExtraFilter).toContain('PromptID IS NOT NULL');
    });

    it('reports an orphaned PROMPT task rather than leaving it invisible', async () => {
        const { provider, views } = recordingProvider();
        await store.FindOrphanedInProgress(provider, USER);
        expect(views[0].ExtraFilter).toContain('PromptID IS NOT NULL');
    });

    it('still exempts tasks a person completes — reclaiming those would reset an approval', async () => {
        const { provider, views } = recordingProvider();
        await store.ReleaseExpiredClaims(provider, USER);
        expect(views[0].ExtraFilter).toContain('AgentID IS NOT NULL');
        expect(views[0].ExtraFilter).toContain('ActionID IS NOT NULL');
    });

    it('reads from the entity, never the base table, and never from cache', async () => {
        const { provider, views } = recordingProvider();
        await store.ReleaseExpiredClaims(provider, USER);
        expect(views[0].EntityName).toBe('MJ: Tasks');
        // The claim protocol mutates these rows out from under any cache; a stale read here would
        // reclaim a task somebody is still running.
        expect(views[0].BypassCache).toBe(true);
    });

    // Both reads replaced an unbounded raw SELECT. `MJ: Tasks` carries UserViewMaxRows = 1000,
    // which the provider applies as a TOP clause whenever neither IgnoreMaxRows nor MaxRows is
    // given — so without these the sweep silently reclaims only the first 1000 expired claims and
    // the orphan report silently under-reports, both while looking like they succeeded.
    it('sweeps EVERY expired claim, not the first page of them', async () => {
        const { provider, views } = recordingProvider();
        await store.ReleaseExpiredClaims(provider, USER);
        expect(views[0].IgnoreMaxRows).toBe(true);
    });

    it('reports EVERY orphaned task — a truncated reconciliation answer is worse than a slow one', async () => {
        const { provider, views } = recordingProvider();
        await store.FindOrphanedInProgress(provider, USER);
        expect(views[0].IgnoreMaxRows).toBe(true);
    });

    it('releases exactly the tasks the procedure reports, not the first N candidates', async () => {
        // The old code sliced the candidate list by a rowcount, which named the wrong tasks whenever
        // a claim was refreshed between the read and the write.
        const rows = [{ ID: 'id-1', Name: 'first', ClaimedBy: 'inst-a' }, { ID: 'id-2', Name: 'second', ClaimedBy: 'inst-b' }];
        const { provider } = recordingProvider(1, rows);
        const events = await store.ReleaseExpiredClaims(provider, USER);
        expect(events.map((e) => e.TaskID)).toEqual(['id-1', 'id-2']);
        expect(events[1].Detail).toContain('second');
        expect(events[1].Detail).toContain('inst-b');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Per-verb guards
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('TrySkipPending — a skip must not overwrite work that started (R3-1)', () => {
    // R2-10 moved the early-finish skips after `CompleteClaimed`, on the premise that "the siblings
    // are Pending and unclaimed until the skip lands". They are not: `executeClaimed` is not
    // awaited, so a sibling can be claimed and STARTED between the snapshot and its write.
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('refuses a task that is no longer Pending — the status IS the claim test', () => {
        expect(whereClause('spTaskGraphSkipPending')).toContain(`[Status] = 'Pending'`);
        // And type-scoped: MJ: Tasks also holds conversation tasks and personal to-dos, and the
        // operator verbs hand this statement caller-supplied IDs.
        expect(whereClause('spTaskGraphSkipPending')).toContain('[TypeID] = @TaskTypeID');
    });

    it('writes Status and nothing else', () => {
        const set = setClause('spTaskGraphSkipPending');
        expect(set).toContain(`[Status] = 'Skipped'`);
        expect(set).not.toContain('[ClaimedBy]');
        expect(set).not.toContain('[OutputPayload]');
        expect(set).not.toContain('[AgentRunID]');
    });

    it('does NOT test ClaimedBy — a notified human task carries a marker and must stay skippable', () => {
        // `TryClaim` moves a task to `In Progress` in the same statement that stamps `ClaimedBy`, so
        // an executor's task is never `Pending` and the status covers it. Adding `ClaimedBy IS NULL`
        // would look like defence in depth and would instead refuse to skip a notified human step.
        expect(whereClause('spTaskGraphSkipPending')).not.toContain('[ClaimedBy] IS NULL');
    });

    it('passes the task and its type, in that order', async () => {
        const { provider, calls } = recordingProvider();
        await store.TrySkipPending(provider, PARENT, WORKFLOW_TYPE, USER);
        expect(callTo(calls, 'spTaskGraphSkipPending').values).toEqual([PARENT, WORKFLOW_TYPE]);
    });

    it('reports the loss when something claimed it first — the rowcount is the verdict', async () => {
        const { provider } = recordingProvider(0);
        expect(await store.TrySkipPending(provider, PARENT, WORKFLOW_TYPE, USER)).toBe(false);
    });
});

describe('TryMarkHumanNotified — once-only, and it cannot revert a status (R3-5)', () => {
    it('guards on the marker being unset and on the task still being Pending', () => {
        expect(whereClause('spTaskGraphMarkHumanNotified')).toContain(`[Status] = 'Pending'`);
        expect(whereClause('spTaskGraphMarkHumanNotified')).toContain('[ClaimedBy] IS NULL');
    });

    it('writes the marker column alone', () => {
        const set = setClause('spTaskGraphMarkHumanNotified');
        expect(set).toContain('[ClaimedBy]');
        expect(set).not.toContain('[Status]');
        expect(set).not.toContain('[OutputPayload]');
    });

    it('passes the marker through', async () => {
        const { provider, calls } = recordingProvider();
        await new TaskClaimStore('i', 300).TryMarkHumanNotified(provider, PARENT, '__human-notified__', USER);
        expect(callTo(calls, 'spTaskGraphMarkHumanNotified').values).toEqual([PARENT, '__human-notified__']);
    });
});

describe('TryCancelTask — a cancel must not overwrite an outcome that landed first (R3-9)', () => {
    // `Cancel` tested the terminal set against an in-memory snapshot and wrote with a full-row
    // `Save()`. A child whose guarded `CompleteClaimed` landed between that load and its save had
    // its whole outcome overwritten. The moment users cancel is exactly when tasks are running.
    it('refuses a child that has already settled — the check is IN the statement', () => {
        expect(whereClause('spTaskGraphCancelTask')).toContain(`NOT IN (${TERMINAL_PARENT_STATUS_SQL})`);
    });

    it('writes Status and nothing else — the columns the full-row save was destroying', () => {
        const set = setClause('spTaskGraphCancelTask');
        expect(set).toContain(`[Status] = 'Cancelled'`);
        for (const column of ['[OutputPayload]', '[AgentRunID]', '[CompletedAt]', '[Configuration]', '[ClaimedBy]']) {
            expect(set).not.toContain(column);
        }
    });

    it('reports the loss so the verdict can stay honest', async () => {
        const { provider } = recordingProvider(0);
        expect(await new TaskClaimStore('svc', 0).TryCancelTask(provider, PARENT, USER)).toBe(false);
    });
});

describe('TryDeclareEarlyFinish — the decision has to outlive one instance\'s memory (R3-1)', () => {
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('stamps the parent once, refusing a second declaration', () => {
        // Two tasks can end the same flow; the first declaration is the one that counts.
        expect(whereClause('spTaskGraphDeclareEarlyFinish'))
            .toContain(`JSON_VALUE([InputPayload], '$.earlyFinishedAt') IS NULL`);
    });

    it('is type-scoped like every other statement here that writes a payload', () => {
        expect(whereClause('spTaskGraphDeclareEarlyFinish')).toContain('[TypeID] = @TaskTypeID');
        expect(whereClause('spTaskGraphDeclareEarlyFinish')).toContain('ISJSON([InputPayload]) = 1');
    });

    it('writes a timestamp the TS reader can parse', async () => {
        const { provider, calls } = recordingProvider();
        await store.TryDeclareEarlyFinish(provider, PARENT, WORKFLOW_TYPE, USER);
        const written = callTo(calls, 'spTaskGraphDeclareEarlyFinish').values[2] as string;
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
    it('refuses to move a parent that is already terminal', () => {
        // 'Blocked' belongs in this set: a graph blocked by an unsatisfiable dependency is settled,
        // and omitting it would let a later pass move it back out of a terminal state.
        expect(whereClause('spTaskGraphSettleParent')).toContain(`NOT IN (${TERMINAL_PARENT_STATUS_SQL})`);
    });

    it('writes ONLY status, progress and completion — never the payload', () => {
        // The whole point. A full-row terminal write carries this instance's `InputPayload` snapshot
        // — and if another instance has just claimed the continuation marker inside that JSON, the
        // marker is erased and the settlement delivers twice.
        const set = setClause('spTaskGraphSettleParent');
        expect(set).toContain('[Status]');
        expect(set).toContain('[PercentComplete]');
        expect(set).toContain('[CompletedAt]');
        expect(set).not.toContain('[InputPayload]');
        expect(set).not.toContain('[OutputPayload]');
        expect(set).not.toContain('[Configuration]');
    });

    it('rounds the percentage, and never sends a non-finite one', async () => {
        const { provider, calls } = recordingProvider();
        await new TaskClaimStore('i', 300).TrySettleParent(provider, PARENT, 'Complete', 99.6, USER);
        expect(callTo(calls, 'spTaskGraphSettleParent').values[2]).toBe(100);
        await new TaskClaimStore('i', 300).TrySettleParent(provider, PARENT, 'Complete', Number.NaN, USER);
        expect(callTo(calls, 'spTaskGraphSettleParent').values[2]).toBe(100);
    });

    it('reports false when the row was already terminal — the rowcount is the verdict', async () => {
        const { provider } = recordingProvider(0);
        expect(await new TaskClaimStore('i', 300).TrySettleParent(provider, PARENT, 'Complete', 100, USER)).toBe(false);
    });
});

describe('TryUpdateParentProgress — the NON-terminal write needs the same guard', () => {
    // The terminal write was the obvious race; this one is easier to hit and was left open.
    it('refuses to move a parent that has already settled', () => {
        expect(whereClause('spTaskGraphUpdateParentProgress')).toContain(`NOT IN (${TERMINAL_PARENT_STATUS_SQL})`);
    });

    it('writes status and progress only — never a payload column', () => {
        const set = setClause('spTaskGraphUpdateParentProgress');
        expect(set).toContain('[Status]');
        expect(set).toContain('[PercentComplete]');
        expect(set).not.toContain('[InputPayload]');
        expect(set).not.toContain('[OutputPayload]');
        expect(set).not.toContain('[CompletedAt]');
    });

    it('does not resurrect a settled graph — the rowcount reports the no-op', async () => {
        const { provider } = recordingProvider(0);
        expect(await new TaskClaimStore('i', 300).TryUpdateParentProgress(provider, PARENT, 'In Progress', 40, USER)).toBe(false);
    });
});

describe('TrySetParentOutput — the early-finish message, and nothing else', () => {
    it('writes OutputPayload alone, so a late save cannot revert a settle', () => {
        // A task that ends the flow early skips its siblings — which makes the graph terminal, so
        // another instance can settle and claim between the load and this write.
        const set = setClause('spTaskGraphSetParentOutput');
        expect(set).toContain('[OutputPayload]');
        expect(set).not.toContain('[Status]');
        expect(set).not.toContain('[InputPayload]');
        expect(whereClause('spTaskGraphSetParentOutput')).toContain('[TypeID] = @TaskTypeID');
    });
});

describe('TryStampParentStart — once-only, and equally narrow', () => {
    it('guards on StartedAt being unset and touches nothing else', () => {
        expect(whereClause('spTaskGraphStampParentStart')).toContain('[StartedAt] IS NULL');
        expect(setClause('spTaskGraphStampParentStart')).not.toContain('[InputPayload]');
    });
});

describe('TryClaimContinuation — a real compare-and-swap', () => {
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('requires the marker to be ABSENT, in the statement itself', () => {
        // This was Load → check → `Save()`: two dispatchers both read "no marker", both saved, both
        // delivered. The predicate is what makes exactly-one true.
        expect(whereClause('spTaskGraphClaimContinuation'))
            .toContain(`JSON_VALUE([InputPayload], '$.continuationDeliveredAt') IS NULL`);
    });

    it('refuses a row whose payload is not JSON, rather than overwriting it', () => {
        // `JSON_MODIFY` against unparseable content would fail the statement; the ISJSON guard makes
        // that an honest zero-rowcount instead.
        expect(whereClause('spTaskGraphClaimContinuation')).toContain('ISJSON([InputPayload]) = 1');
    });

    it('will only ever touch a WORKFLOW task, stated in the statement', () => {
        // `MJ: Tasks` is general-purpose — conversation tasks and users' own to-dos share the table.
        expect(whereClause('spTaskGraphClaimContinuation')).toContain('[TypeID] = @TaskTypeID');
    });

    it('loses the race quietly when another instance claimed first', async () => {
        const { provider } = recordingProvider(0);
        expect(await store.TryClaimContinuation(provider, PARENT, 'delivered', WORKFLOW_TYPE, USER)).toBe(false);
    });

    it('records HOW it was delivered, so an expired settlement stays distinguishable', async () => {
        const { provider, calls } = recordingProvider();
        await store.TryClaimContinuation(provider, PARENT, 'expired', WORKFLOW_TYPE, USER);
        expect(callTo(calls, 'spTaskGraphClaimContinuation').values[2]).toBe('expired');
    });

    it('writes a timestamp the TypeScript reader can parse — the round trip', async () => {
        // Writer is SQL (`JSON_MODIFY`), reader is TS (`ParseTaskGraphParentMetadata`). They are
        // pinned to each other by format alone, so the format is asserted: ISO 8601 UTC.
        const { provider, calls } = recordingProvider();
        await store.TryClaimContinuation(provider, PARENT, 'delivered', WORKFLOW_TYPE, USER);
        const written = callTo(calls, 'spTaskGraphClaimContinuation').values[3] as string;
        expect(written).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

        const meta = ParseTaskGraphParentMetadata(JSON.stringify({ continuationDeliveredAt: written }));
        expect(meta.continuationDeliveredAt).toBe(written);
        expect(new Date(meta.continuationDeliveredAt!).toISOString()).toBe(written);
    });

    it('a payload with no marker parses as undelivered — what the sweep keys on', () => {
        expect(ParseTaskGraphParentMetadata(JSON.stringify({ continuation: 'message' })).continuationDeliveredAt)
            .toBeUndefined();
        expect(ParseTaskGraphParentMetadata(null).continuationDeliveredAt).toBeUndefined();
        expect(ParseTaskGraphParentMetadata('not json').continuationDeliveredAt).toBeUndefined();
    });
});

describe('CompleteClaimed — the outcome belongs to the instance that ran it', () => {
    it('guards on this instance still owning the task', () => {
        expect(whereClause('spTaskGraphCompleteClaimed')).toContain(`[Status] = 'In Progress'`);
        expect(whereClause('spTaskGraphCompleteClaimed')).toContain('[ClaimedBy] = @ClaimedBy');
    });

    it('releases the claim in the same write, so no terminal row keeps one', () => {
        const set = setClause('spTaskGraphCompleteClaimed');
        expect(set).toContain('[ClaimedBy] = NULL');
        expect(set).toContain('[ClaimExpiresAt] = NULL');
    });

    it('leaves Configuration alone unless the caller supplied one', async () => {
        // A step whose run produces no artefacts must not have its authored configuration blanked as
        // a side effect of finishing — so the FLAG decides, not the value.
        expect(setClause('spTaskGraphCompleteClaimed'))
            .toContain('[Configuration] = CASE WHEN @SetConfiguration = 1 THEN @Configuration ELSE [Configuration] END');

        const { provider, calls } = recordingProvider();
        const store = new TaskClaimStore('instance-1', 300);
        await store.CompleteClaimed(provider, PARENT, { Status: 'Complete' }, USER);
        expect(callTo(calls, 'spTaskGraphCompleteClaimed').values[7]).toBe(false);

        const second = recordingProvider();
        await store.CompleteClaimed(second.provider, PARENT, { Status: 'Complete', Configuration: null }, USER);
        expect(callTo(second.calls, 'spTaskGraphCompleteClaimed').values[7]).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// The clock
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('the lease lives on the database clock, never this process\'s (claim-clock unification)', () => {
    // The claim protocol is multi-instance: a lease written from one host's clock and judged expired
    // against another's turns ordinary NTP skew into premature reclamation — the task runs twice —
    // or into a lease that outlives its worker. The database's clock is the only one every instance
    // shares, so the expiry is WRITTEN there and COMPARED there, and no timestamp minted in Node may
    // appear in any lease expression.
    const ISO_LITERAL = /'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('TryClaim writes and compares ClaimExpiresAt in SQL time', () => {
        const body = proc('spTaskGraphClaimTask');
        expect(body).toContain('DATEADD(SECOND, @ClaimTTLSeconds, SYSUTCDATETIME())');
        expect(body).toContain('[ClaimExpiresAt] < SYSUTCDATETIME()');
        expect(body).not.toMatch(ISO_LITERAL);
    });

    it('Heartbeat renews on the same clock the claim was written with', () => {
        const body = proc('spTaskGraphHeartbeat');
        expect(body).toContain('DATEADD(SECOND, @ClaimTTLSeconds, SYSUTCDATETIME())');
        expect(body).not.toMatch(ISO_LITERAL);
    });

    it('the claim passes a TTL, never an expiry computed here', async () => {
        const { provider, calls } = recordingProvider();
        await store.TryClaim(provider, PARENT, USER);
        expect(callTo(calls, 'spTaskGraphClaimTask').values).toEqual([PARENT, 'instance-1', 300]);
        for (const value of callTo(calls, 'spTaskGraphClaimTask').values) {
            expect(String(value)).not.toMatch(/^\d{4}-\d{2}-\d{2}T/);
        }
    });

    it('ReleaseExpiredClaims judges expiry on the clock that wrote the lease', async () => {
        const { provider, views } = recordingProvider();
        await store.ReleaseExpiredClaims(provider, USER);
        // The candidate filter asks the database for its own time, through the dialect rather than
        // a hardcoded function name...
        expect(views[0].ExtraFilter).toContain(new SQLServerDialect().CurrentTimestampUTC());
        expect(views[0].ExtraFilter).not.toMatch(ISO_LITERAL);
        // ...and the write re-checks it there, which is the check that decides.
        expect(proc('spTaskGraphReleaseExpiredClaims')).toContain('[ClaimExpiresAt] < SYSUTCDATETIME()');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// A refused write is not a lost race (#4575)
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe('a write that never ran reports itself as a failure, not as a lost race', () => {
    // Collapsing the two is what let a dispatcher skip every task in the table, forever, in silence.
    let store: TaskClaimStore;
    beforeEach(() => { store = new TaskClaimStore('instance-1', 300); });

    it('still returns false, so one bad write cannot fault the dispatch loop', async () => {
        expect(await store.TryClaim(deniedProvider(), PARENT, USER)).toBe(false);
    });

    it('records the failure, with the message, so the caller can say why it is stuck', async () => {
        await store.TryClaim(deniedProvider(), PARENT, USER);
        expect(store.LastWriteFailed).toBe(true);
        expect(store.LastWriteError).toContain('permission was denied');
        expect(store.LastWriteError).toContain('spTaskGraphClaimTask');
    });

    it('counts consecutive failures, so an inert dispatcher is visible', async () => {
        const denied = deniedProvider();
        await store.TryClaim(denied, PARENT, USER);
        await store.TryClaim(denied, PARENT, USER);
        expect(store.ConsecutiveWriteFailures).toBe(2);
    });

    it('clears the flag as soon as a write actually runs — a lost race is not a failure', async () => {
        await store.TryClaim(deniedProvider(), PARENT, USER);
        const { provider } = recordingProvider(0);
        expect(await store.TryClaim(provider, PARENT, USER)).toBe(false);
        expect(store.LastWriteFailed).toBe(false);
        expect(store.ConsecutiveWriteFailures).toBe(0);
    });
});
