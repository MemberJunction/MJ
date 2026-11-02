/**
 * query-approvals.checks.ts — the 'query-approvals' bundle (IT120, #4789 A17): server-set query
 * parameters, the reserved `Context` object, and fingerprint-bound approvals, through the real
 * save pipeline (MJQueryEntityServer: extraction, parameter sync, approval stamping) and the real
 * RunQuery path (GenericDatabaseProvider + RenderPipeline + QueryParameterProcessor).
 *
 * TRANSPORT: server. A GraphQL client's only channel for a parameter value is
 * `RunQueryParams.Parameters` — the RunQuery* resolvers never read `ServerParameters` from a
 * request (pinned by MJServer's runParamsTimeZone.test.ts) — so a caller value through
 * `Parameters` here is exactly what a GraphQL caller can send.
 *
 * Fixtures: one category and two saved queries over a literal derived table (valid unchanged on
 * SQL Server and PostgreSQL), deleted in teardown. Self-cleaning, so the deterministic tier.
 */
import { Metadata, RunQuery, RunView } from '@memberjunction/core';
import type { RunQueryParams, RunQueryResult, UserInfo } from '@memberjunction/core';
import { GetQueryApprovalStateAsync, QueryEngine } from '@memberjunction/core-entities';
import type { MJQueryEntity, MJQueryParameterEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { CreateRenderCategory, DeleteRenderQueries, RefreshRenderQueries } from './runquery-rendering-fixture';
import type { RenderFixtures } from './runquery-rendering-fixture';

/** Three rows, 1 to 3, valid unchanged on both platforms. */
const ROWS = '(SELECT 1 AS N UNION ALL SELECT 2 UNION ALL SELECT 3) AS v';
/** D1: one chapter's row. */
const D1 = `SELECT N FROM ${ROWS} WHERE N = {{ ChapterID | sqlNumber }}`;
/** D2: the same parameter, a broader filter — a material edit made without re-approval. */
const D2 = `SELECT N FROM ${ROWS} WHERE N >= {{ ChapterID | sqlNumber }}`;
/** Reads only the reserved Context object. */
const CONTEXT_SQL = `SELECT {{ Context.UserID | sqlString }} AS UserID, N FROM ${ROWS} WHERE N = 1`;

const CHAPTER_QUERY = 'IT120 Chapter Rows';
const CONTEXT_QUERY = 'IT120 Context Rows';

let fixtures: RenderFixtures | undefined;

function requireQuery(name: string): MJQueryEntity {
    const query = fixtures?.Queries.get(name);
    if (!query) {
        throw new Error(`query-approvals fixture '${name}' missing — the bundle lifecycle Setup must run first.`);
    }
    return query;
}

async function saveOrThrow(entity: { Save(): Promise<boolean>; LatestResult?: { CompleteMessage?: string } | null }, what: string): Promise<void> {
    if (!await entity.Save()) {
        throw new Error(`${what} failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

/** The stored parameter rows of a query, straight from the database. */
async function storedParameters(queryID: string, user: UserInfo): Promise<MJQueryParameterEntity[]> {
    const result = await new RunView().RunView<MJQueryParameterEntity>({
        EntityName: 'MJ: Query Parameters',
        ExtraFilter: `QueryID='${EscapeSQLString(queryID)}'`,
        ResultType: 'entity_object',
        BypassCache: true
    }, user);
    Assert(result.Success, `reading the parameters of ${queryID} failed: ${result.ErrorMessage}`);
    return result.Results;
}

async function createQuery(name: string, sql: string, user: UserInfo): Promise<MJQueryEntity> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const query = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
    query.Name = name;
    query.CategoryID = fixtures!.Category.ID;
    query.SQL = sql;
    query.Status = 'Pending';
    await saveOrThrow(query, `saving '${name}'`);
    fixtures!.Queries.set(name, query);
    return query;
}

/**
 * The chapter query: D1, its extracted ChapterID parameter marked server-set, then approved — so
 * the approval stamp covers the server-set contract.
 */
async function setupFixtures(ctx: IntegrationCheckContext): Promise<void> {
    fixtures = { Category: await CreateRenderCategory(ctx.User), Queries: new Map(), Variants: [] };
    const chapter = await createQuery(CHAPTER_QUERY, D1, ctx.User);
    const chapterParam = (await storedParameters(chapter.ID, ctx.User)).find(p => p.Name === 'ChapterID');
    Assert(!!chapterParam, `extraction did not create the ChapterID parameter of '${CHAPTER_QUERY}'`);
    chapterParam!.IsServerSet = true;
    await saveOrThrow(chapterParam!, 'marking ChapterID server-set');
    chapter.Status = 'Approved';
    await saveOrThrow(chapter, `approving '${CHAPTER_QUERY}'`);
    await createQuery(CONTEXT_QUERY, CONTEXT_SQL, ctx.User);
    await RefreshRenderQueries(ctx.User);
}

async function teardownFixtures(ctx: IntegrationCheckContext): Promise<void> {
    await DeleteRenderQueries(fixtures, ctx.User);
    fixtures = undefined;
}

/** Runs the chapter query with the given params; the engine is refreshed first so it runs what is stored. */
async function runChapter(ctx: IntegrationCheckContext, params: Partial<RunQueryParams>): Promise<RunQueryResult> {
    await RefreshRenderQueries(ctx.User);
    return new RunQuery().RunQuery({ QueryID: requireQuery(CHAPTER_QUERY).ID, ...params }, ctx.User);
}

/** Captures what console.error receives while `fn` runs (LogError writes there). */
async function captureErrors<T>(fn: () => Promise<T>): Promise<{ value: T; logged: string[] }> {
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
    try {
        return { value: await fn(), logged };
    } finally {
        console.error = original;
    }
}

function rowNumbers(result: RunQueryResult): number[] {
    return (result.Results as Array<{ N: number | string }>).map(r => Number(r.N)).sort();
}

async function editChapterSQL(ctx: IntegrationCheckContext, sql: string): Promise<void> {
    const chapter = requireQuery(CHAPTER_QUERY);
    chapter.SQL = sql;
    await saveOrThrow(chapter, 'editing the chapter query SQL');
    await RefreshRenderQueries(ctx.User);
}

export const QueryApprovalsChecks: NamedCheck[] = [
    {
        Id: 'query-approvals.QA1',
        Name: 'QA1: a caller value for the server-set ChapterID is refused, naming it, and logged',
        Fn: async (ctx) => {
            const { value: refused, logged } = await captureErrors(() => runChapter(ctx, { Parameters: { ChapterID: 2 } }));
            AssertEqual(refused.Success, false, 'a caller-supplied ChapterID must be refused');
            Assert(refused.ErrorMessage.includes("Parameter 'ChapterID' is set by the server"), `refusal must name ChapterID — got: ${refused.ErrorMessage}`);
            Assert(logged.some(line => line.includes('Query parameters refused') && line.includes('ChapterID')), `the refusal must be logged — console.error saw: ${logged.join(' | ') || 'nothing'}`);

            const both = await runChapter(ctx, { Parameters: { ChapterID: 2 }, ServerParameters: { ChapterID: 1 } });
            AssertEqual(both.Success, false, 'a caller value is refused even when the server sets one too');
        }
    },
    {
        Id: 'query-approvals.QA2',
        Name: 'QA2: server code sets ChapterID through ServerParameters; with none the run is refused',
        Fn: async (ctx) => {
            const result = await runChapter(ctx, { ServerParameters: { ChapterID: 2 } });
            Assert(result.Success, `the server-set run must succeed: ${result.ErrorMessage}`);
            AssertEqual(JSON.stringify(rowNumbers(result)), JSON.stringify([2]), 'the server value must filter the rows');
            Assert(!('ChapterID' in (result.AppliedParameters ?? {})), 'a server-set value is not handed back as an applied parameter');

            const none = await runChapter(ctx, {});
            AssertEqual(none.Success, false, 'a required server-set parameter with no server value refuses the run');
        }
    },
    {
        Id: 'query-approvals.QA3',
        Name: 'QA3: approve D1 → runs with RequireApproved; edit to D2 → refused; restore D1 exactly → runs; IsServerSet survives each edit',
        Fn: async (ctx) => {
            const chapter = requireQuery(CHAPTER_QUERY);
            Assert(UUIDsEqual(chapter.ApprovedByUserID, ctx.User.ID), `the approver must be the context user — got ${chapter.ApprovedByUserID}`);
            const approvedFingerprint = chapter.ApprovedFingerprint;
            Assert(!!approvedFingerprint && !!chapter.ApprovedAt, 'approving must stamp a fingerprint and a time');

            const d1 = await runChapter(ctx, { ServerParameters: { ChapterID: 2 }, RequireApproved: true });
            Assert(d1.Success, `approved D1 must run under RequireApproved: ${d1.ErrorMessage}`);

            await editChapterSQL(ctx, D2);
            AssertEqual(chapter.ApprovedFingerprint, approvedFingerprint, 'an edit must not re-stamp the approval');
            const d2 = await runChapter(ctx, { ServerParameters: { ChapterID: 2 }, RequireApproved: true });
            AssertEqual(d2.Success, false, 'D2 must be refused: its approval was given to D1');
            Assert(d2.ErrorMessage.includes('not approved in its current form'), `refusal reason — got: ${d2.ErrorMessage}`);
            const unflagged = await runChapter(ctx, { ServerParameters: { ChapterID: 2 } });
            Assert(unflagged.Success && rowNumbers(unflagged).length === 2, 'without RequireApproved, D2 still runs (warning only, as before)');
            const afterEdit = (await storedParameters(chapter.ID, ctx.User)).find(p => p.Name === 'ChapterID');
            AssertEqual(afterEdit?.IsServerSet, true, 'an SQL edit must not unlock the server-set parameter');

            await editChapterSQL(ctx, D1);
            const engineCopy = QueryEngine.Instance.Queries.find(q => UUIDsEqual(q.ID, chapter.ID));
            AssertEqual(engineCopy ? await GetQueryApprovalStateAsync(engineCopy) : 'missing', 'Current', 'restoring D1 exactly makes the approval current again');
            const restored = await runChapter(ctx, { ServerParameters: { ChapterID: 2 }, RequireApproved: true });
            Assert(restored.Success, `restored D1 must run again: ${restored.ErrorMessage}`);
            AssertEqual(JSON.stringify(rowNumbers(restored)), JSON.stringify([2]), 'restored D1 returns D1 rows');
        }
    },
    {
        Id: 'query-approvals.QA4',
        Name: 'QA4: Context.UserID renders the context user; Context is no parameter and cannot be set by a caller',
        Fn: async (ctx) => {
            const query = requireQuery(CONTEXT_QUERY);
            const params = await storedParameters(query.ID, ctx.User);
            AssertEqual(params.filter(p => p.Name.startsWith('Context')).length, 0, 'extraction keeps no parameter row for Context');

            await RefreshRenderQueries(ctx.User);
            const result = await new RunQuery().RunQuery({ QueryID: query.ID }, ctx.User);
            Assert(result.Success, `the Context query must run: ${result.ErrorMessage}`);
            const row = (result.Results as Array<{ UserID: string }>)[0];
            Assert(UUIDsEqual(row?.UserID, ctx.User.ID), `Context.UserID must be the context user — got ${row?.UserID}`);

            const forged = await new RunQuery().RunQuery({ QueryID: query.ID, Parameters: { Context: { UserID: 'someone-else' } } }, ctx.User);
            AssertEqual(forged.Success, false, 'a caller value for Context must be refused');
        }
    },
    {
        Id: 'query-approvals.QA5',
        Name: 'QA5: Composed query dependency approval (Qparent -> Qchild): mutating Qchild while Qparent is untouched refuses both direct and composed runs under RequireApproved',
        Fn: async (ctx) => {
            const chapter = requireQuery(CHAPTER_QUERY);
            chapter.Reusable = true;
            await saveOrThrow(chapter, 'marking chapter query reusable');
            await RefreshRenderQueries(ctx.User);

            const catPath = QueryEngine.Instance.Queries.find(q => UUIDsEqual(q.ID, chapter.ID))?.CategoryPath?.replace(/^\/|\/$/g, '') ?? fixtures!.Category.Name;
            const parentSQL = `SELECT c.N FROM {{query:"${catPath}/${CHAPTER_QUERY}"}} c`;
            const parent = await createQuery('IT120 Composed Parent', parentSQL, ctx.User);
            parent.Status = 'Approved';
            await saveOrThrow(parent, 'approving composed parent');
            await RefreshRenderQueries(ctx.User);
            const parentApprovedFingerprint = parent.ApprovedFingerprint;
            Assert(!!parentApprovedFingerprint, 'parent must have an approved fingerprint');

            // 1. Both Qchild (D1) and Qparent (P1) approved -> composed Qparent runs under RequireApproved
            const bothApproved = await new RunQuery().RunQuery({ QueryID: parent.ID, ServerParameters: { ChapterID: 2 }, RequireApproved: true }, ctx.User);
            Assert(bothApproved.Success, `composed parent must run when both parent and child are approved: ${bothApproved.ErrorMessage}`);
            AssertEqual(JSON.stringify(rowNumbers(bothApproved)), JSON.stringify([2]), 'composed parent returns D1 rows');

            // 2. Mutate Qchild to D2 without re-approving, leaving Qparent byte-identical at P1
            await editChapterSQL(ctx, D2);
            AssertEqual(parent.ApprovedFingerprint, parentApprovedFingerprint, 'Qparent approval fingerprint is untouched');

            const directChildRefused = await runChapter(ctx, { ServerParameters: { ChapterID: 2 }, RequireApproved: true });
            AssertEqual(directChildRefused.Success, false, 'direct Qchild at D2 must be refused under RequireApproved');

            const composedParentRefused = await new RunQuery().RunQuery({ QueryID: parent.ID, ServerParameters: { ChapterID: 2 }, RequireApproved: true }, ctx.User);
            AssertEqual(composedParentRefused.Success, false, 'composed Qparent must be refused when Qchild is at unapproved D2');
            Assert(
                composedParentRefused.ErrorMessage.includes(CHAPTER_QUERY) && composedParentRefused.ErrorMessage.includes('not approved in its current form'),
                `composed refusal must name the unapproved child query — got: ${composedParentRefused.ErrorMessage}`
            );

            // 3. Restore Qchild to D1 -> both pass again
            await editChapterSQL(ctx, D1);
            const restoredParent = await new RunQuery().RunQuery({ QueryID: parent.ID, ServerParameters: { ChapterID: 2 }, RequireApproved: true }, ctx.User);
            Assert(restoredParent.Success, `composed parent must run again after restoring Qchild to D1: ${restoredParent.ErrorMessage}`);
            AssertEqual(JSON.stringify(rowNumbers(restoredParent)), JSON.stringify([2]), 'restored composed parent returns D1 rows');
        }
    }
];

for (const check of QueryApprovalsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('query-approvals', {
    Setup: setupFixtures,
    Teardown: teardownFixtures
});
