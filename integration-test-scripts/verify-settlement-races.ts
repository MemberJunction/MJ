/**
 * verify-settlement-races.ts — force the settlement interleavings against a real database.
 *
 * **Why this is a script and not a unit test.** Every claim here is about what the DATABASE does
 * when two dispatcher instances reach the same settling graph. A stub that answered these questions
 * would be simulating the exact mechanism under test — the same trap as an oracle that reproduces
 * the bug it exists to catch. The unit tests in `TaskClaimStore.settlement.test.ts` assert that the
 * statements say what we think they say; this asserts that saying it produces the outcome we want.
 *
 * The interleavings are FORCED rather than raced, because a race that happens to come out right
 * proves nothing. Statements run in the exact order that loses.
 *
 * **Why a GLOBAL temp table (`##`).** `mssql` hands each request whichever connection is free, and a
 * `#local` temp table belongs to the session that created it — so the setup INSERT and the UPDATE
 * under test can land on different connections and the second one reports `Invalid object name`.
 * That failure has nothing to do with the behaviour being probed, and chasing it by pinning a single
 * connection would quietly serialise the very interleaving this file exists to force.
 *
 * USAGE (from the repository root):
 *
 *   npx tsx integration-test-scripts/verify-settlement-races.ts
 *
 * WHAT EACH CHECK DEFENDS
 *
 *  1. A second instance's terminal write is a no-op, not a rewind. `GenerateSaveSQL` sends every
 *     updateable column, so a full-row save from a pre-marker snapshot would erase the continuation
 *     marker and the settlement would deliver twice — for `reinvoke`, two billed agent turns.
 *  2. Exactly one instance may claim delivery. The old code was Load → check → Save(): both read
 *     "no marker", both wrote, both delivered.
 *  3. A NON-terminal progress write cannot resurrect a settled graph. This is the easier race of the
 *     two — no crash window required, just a rollup computed from a slightly stale read.
 *  4. Claiming preserves the rest of the metadata bag. The marker shares `InputPayload` with
 *     `submittedByAgentRunID` and the continuation mode; losing those would strand the run.
 *  5. A row whose payload is absent or unparseable is refused, not overwritten.
 *  6. Every payload write is scoped to the workflow task type. `MJ: Tasks` also holds conversation
 *     tasks and users' own to-dos; a mis-derived parent ID must hit nothing rather than something.
 */
import * as sql from 'mssql';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const TABLE = '##TaskGraphSettlementProbe';

/** The workflow discriminator, and a task type that is NOT one — a conversation task, say. */
const WORKFLOW_TYPE = '11111111-1111-1111-1111-111111111111';
const OTHER_TYPE = '22222222-2222-2222-2222-222222222222';

/** Mirrors `TaskClaimStore.TrySettleParent`. */
const SETTLE = `
    UPDATE ${TABLE} SET Status = @status, PercentComplete = 100, CompletedAt = SYSUTCDATETIME()
    WHERE ID = @id AND Status NOT IN ('Complete','Failed','Cancelled','Skipped','Blocked')`;

/** Mirrors `TaskClaimStore.TryUpdateParentProgress` — same guard, no CompletedAt. */
const PROGRESS = `
    UPDATE ${TABLE} SET Status = @status, PercentComplete = 50
    WHERE ID = @id AND Status NOT IN ('Complete','Failed','Cancelled','Skipped','Blocked')`;

/** Mirrors `TaskClaimStore.TryClaimContinuation`, including all three guards. */
const CLAIM = `
    UPDATE ${TABLE} SET InputPayload = JSON_MODIFY(
            JSON_MODIFY(InputPayload, '$.continuationDeliveredAt', @at),
            '$.continuationDeliveredAs', @as)
    WHERE ID = @id AND TypeID = @type AND ISJSON(InputPayload) = 1
      AND JSON_VALUE(InputPayload, '$.continuationDeliveredAt') IS NULL`;

/** Mirrors `TaskClaimStore.TrySetParentOutput` — the early-finish message, type-scoped. */
const SET_OUTPUT = `
    UPDATE ${TABLE} SET OutputPayload = @out WHERE ID = @id AND TypeID = @type`;

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? '  ✓' : '  ✗'} ${label}${ok ? '' : `  — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

async function main(): Promise<void> {
    const pool = await sql.connect({
        server: process.env.DB_HOST!,
        port: parseInt(process.env.DB_PORT ?? '1433', 10),
        database: (process.env.DB_DATABASE ?? process.env['DB_DATABASE ']!).trim(),
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        options: { encrypt: true, trustServerCertificate: true },
        // A global temp table survives only while at least one session holds it, so the pool must
        // never drain to zero between statements — which it will at min: 0 under an idle timeout.
        pool: { min: 1, max: 4 },
    });

    const rows = async (q: string, params: Record<string, string>): Promise<number> => {
        const req = pool.request();
        for (const [k, v] of Object.entries(params)) req.input(k, v);
        const r = await req.query(`${q};\nSELECT @@ROWCOUNT AS n`);
        return Number(r.recordset[0].n);
    };
    const one = async (q: string): Promise<Record<string, string | null>> =>
        (await pool.request().query(q)).recordset[0];

    await pool.request().query(`
        IF OBJECT_ID('tempdb..${TABLE}') IS NOT NULL DROP TABLE ${TABLE};
        CREATE TABLE ${TABLE} (ID NVARCHAR(50), TypeID NVARCHAR(50), Status NVARCHAR(50),
                               PercentComplete INT, CompletedAt DATETIMEOFFSET NULL,
                               InputPayload NVARCHAR(MAX), OutputPayload NVARCHAR(MAX) NULL);`);

    const seed = async (id: string, status: string, payload: string | null, type = WORKFLOW_TYPE): Promise<void> => {
        await pool.request()
            .input('id', id).input('type', type).input('status', status).input('p', payload)
            .query(`DELETE FROM ${TABLE} WHERE ID = @id;
                    INSERT ${TABLE} (ID, TypeID, Status, PercentComplete, InputPayload)
                    VALUES (@id, @type, @status, 50, @p);`);
    };

    console.log('\nTwo instances reach one settling graph — the losing interleaving, forced:');
    await seed('g1', 'In Progress', '{"continuation":"reinvoke","submittedByAgentRunID":"run-1"}');

    check('A writes terminal', await rows(SETTLE, { id: 'g1', status: 'Complete' }), 1);
    check('A claims delivery', await rows(CLAIM, { id: 'g1', type: WORKFLOW_TYPE, at: '2026-01-01T01:00:00.000Z', as: 'delivered' }), 1);
    // B arrives late holding a pre-marker snapshot. Every one of its writes must be a no-op.
    check('B cannot re-settle (no rewind)', await rows(SETTLE, { id: 'g1', status: 'Complete' }), 0);
    check('B cannot claim delivery (exactly once)', await rows(CLAIM, { id: 'g1', type: WORKFLOW_TYPE, at: '2026-01-01T02:00:00.000Z', as: 'delivered' }), 0);
    // ...including the non-terminal one, which needs no crash window at all — just a stale rollup.
    check('B cannot revert it to In Progress', await rows(PROGRESS, { id: 'g1', status: 'In Progress' }), 0);

    const after = await one(`
        SELECT JSON_VALUE(InputPayload,'$.continuationDeliveredAt') AS marker,
               JSON_VALUE(InputPayload,'$.submittedByAgentRunID')   AS runID,
               JSON_VALUE(InputPayload,'$.continuation')            AS mode,
               Status                                               AS status
        FROM ${TABLE} WHERE ID='g1'`);
    check('marker is the winner\'s', after.marker, '2026-01-01T01:00:00.000Z');
    check('status stayed terminal', after.status, 'Complete');
    check('submitting run survived the claim', after.runID, 'run-1');
    check('continuation mode survived the claim', after.mode, 'reinvoke');

    console.log('\nProgress writes move a LIVE graph, so the guard is not just a blanket refusal:');
    await seed('live', 'Pending', '{}');
    check('a pending graph does advance', await rows(PROGRESS, { id: 'live', status: 'In Progress' }), 1);
    check('and lands the new status', (await one(`SELECT Status FROM ${TABLE} WHERE ID='live'`)).Status, 'In Progress');

    console.log('\nA payload we cannot read is refused, never overwritten:');
    await seed('bad', 'Complete', 'not json');
    await seed('nul', 'Complete', null);
    check('unparseable payload refused', await rows(CLAIM, { id: 'bad', type: WORKFLOW_TYPE, at: '2026-01-01T00:00:00.000Z', as: 'delivered' }), 0);
    check('null payload refused', await rows(CLAIM, { id: 'nul', type: WORKFLOW_TYPE, at: '2026-01-01T00:00:00.000Z', as: 'delivered' }), 0);
    check('and left byte-identical', (await one(`SELECT InputPayload FROM ${TABLE} WHERE ID='bad'`)).InputPayload, 'not json');

    console.log('\nA task of another kind is never written, whatever ID we are handed:');
    // MJ: Tasks is general-purpose. A conversation task or somebody's to-do reached by a mis-derived
    // parent ID must produce nothing — the type is part of the statement, not a caller-side filter.
    await seed('todo', 'In Progress', '{"personal":"buy milk"}', OTHER_TYPE);
    check('claim refuses a non-workflow task', await rows(CLAIM, { id: 'todo', type: WORKFLOW_TYPE, at: '2026-01-01T00:00:00.000Z', as: 'delivered' }), 0);
    check('early-finish output refuses it too', await rows(SET_OUTPUT, { id: 'todo', type: WORKFLOW_TYPE, out: '{"message":"x"}' }), 0);
    const todo = await one(`SELECT InputPayload, OutputPayload FROM ${TABLE} WHERE ID='todo'`);
    check('their payload is untouched', todo.InputPayload, '{"personal":"buy milk"}');
    check('and nothing was written alongside it', todo.OutputPayload, null);

    console.log('\nThe early-finish message writes its own column and no other:');
    await seed('early', 'Complete', '{"continuationDeliveredAt":"2026-01-01T00:00:00.000Z"}');
    check('output lands on a settled graph', await rows(SET_OUTPUT, { id: 'early', type: WORKFLOW_TYPE, out: '{"message":"stopped"}' }), 1);
    const early = await one(`
        SELECT Status, OutputPayload,
               JSON_VALUE(InputPayload,'$.continuationDeliveredAt') AS marker
        FROM ${TABLE} WHERE ID='early'`);
    check('without reverting the settle', early.Status, 'Complete');
    check('and without erasing the marker', early.marker, '2026-01-01T00:00:00.000Z');
    check('message recorded', early.OutputPayload, '{"message":"stopped"}');

    console.log('\nAn expired settlement is distinguishable after the fact:');
    await seed('exp', 'Complete', '{}');
    check('expired claim wins once', await rows(CLAIM, { id: 'exp', type: WORKFLOW_TYPE, at: '2026-01-01T00:00:00.000Z', as: 'expired' }), 1);
    check('and records HOW it settled',
        (await one(`SELECT JSON_VALUE(InputPayload,'$.continuationDeliveredAs') AS d FROM ${TABLE} WHERE ID='exp'`)).d,
        'expired');

    await pool.request().query(`DROP TABLE ${TABLE}`);
    await pool.close();
    console.log(failures === 0 ? '\nAll settlement race checks passed.\n' : `\n${failures} CHECK(S) FAILED.\n`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR', e instanceof Error ? e.message : String(e)); process.exit(1); });
