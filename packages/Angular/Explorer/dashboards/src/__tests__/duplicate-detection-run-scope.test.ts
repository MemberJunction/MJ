/**
 * Run-scoped loading for the Record Duplicates board.
 *
 * The regression these helpers guard: with more than UserViewMaxRows (1000) review rows spread over
 * more than one run, an unscoped load truncates details (newest first) and matches (highest
 * probability first) to DIFFERENT subsets, so the details that load have no matches and every group
 * is dropped. The board must load ONE run's rows, and all of them, so the join is complete.
 *
 * The fake RunViews below reproduces the real truncation semantics (OrderBy, then cut at 1000 unless
 * IgnoreMaxRows) so the queries are exercised the way the server would run them.
 */
import { describe, it, expect } from 'vitest';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import {
    buildRunScopedReviewQueries,
    groupMatchesByDetail,
    selectCurrentRunForEntity,
} from '../AI/components/duplicates/duplicate-detection-run-scope';

const ENTITY_ORGS = 'E0000001-0000-0000-0000-000000000001';
const ENTITY_PEOPLE = 'E0000002-0000-0000-0000-000000000002';
const RUN_ORGS_OLD = 'A0000000-0000-0000-0000-00000000000A';
const RUN_ORGS_NEW = 'B0000000-0000-0000-0000-00000000000B';
const RUN_PEOPLE = 'C0000000-0000-0000-0000-00000000000C';
const DETAILS_VIEW = { SchemaName: '__mj', BaseView: 'vwDuplicateRunDetails' };
const MAX_ROWS = 1000;

interface DetailRow { ID: string; DuplicateRunID: string; MatchStatus: string; __mj_CreatedAt: Date }
interface MatchRow { ID: string; DuplicateRunDetailID: string; MatchProbability: number }

function makeRun(runID: string, createdAt: Date, probability: number, detailCount: number, matchesPerDetail: number) {
    const details: DetailRow[] = [];
    const matches: MatchRow[] = [];
    for (let d = 0; d < detailCount; d++) {
        const detailID = `${runID}-D${d}`;
        details.push({ ID: detailID, DuplicateRunID: runID, MatchStatus: 'Complete', __mj_CreatedAt: new Date(createdAt.getTime() + d) });
        for (let m = 0; m < matchesPerDetail; m++) {
            matches.push({ ID: `${detailID}-M${m}`, DuplicateRunDetailID: detailID, MatchProbability: probability - m * 0.001 });
        }
    }
    return { details, matches };
}

/**
 * Two runs for Organizations, each above the 1000-row cap, arranged so an unscoped truncated load
 * would keep the NEWEST details (from the new run) but the HIGHEST-probability matches (from the old
 * run): the divergence the board must never see. A third run for another entity is noise.
 */
function buildStore() {
    const old = makeRun(RUN_ORGS_OLD, new Date('2026-09-01T00:00:00Z'), 0.95, 1200, 2);
    const recent = makeRun(RUN_ORGS_NEW, new Date('2026-09-15T00:00:00Z'), 0.75, 1200, 2);
    const people = makeRun(RUN_PEOPLE, new Date('2026-09-20T00:00:00Z'), 0.99, 50, 1);
    return {
        details: [...old.details, ...recent.details, ...people.details],
        matches: [...old.matches, ...recent.matches, ...people.matches],
    };
}

/** These helpers only ever build plain-string SQL fragments; a per-platform object would be a bug here. */
function sqlText(value: RunViewParams['ExtraFilter']): string {
    return typeof value === 'string' ? value : '';
}

/** A RunViews double with a real entity's truncation semantics: filter, order, cut at 1000 unless IgnoreMaxRows. */
function fakeRunViews(store: { details: DetailRow[]; matches: MatchRow[] }) {
    const runOfDetail = new Map(store.details.map(d => [d.ID, d.DuplicateRunID]));
    const runQuery = (q: RunViewParams): RunViewResult => {
        const filter = sqlText(q.ExtraFilter);
        const scopedRun = /DuplicateRunID='([^']*)'/.exec(filter)?.[1];
        let rows: Array<DetailRow | MatchRow>;
        if (q.EntityName === 'MJ: Duplicate Run Details') {
            const completeOnly = /MatchStatus='Complete'/.test(filter);
            rows = store.details.filter(d =>
                (!scopedRun || d.DuplicateRunID === scopedRun) && (!completeOnly || d.MatchStatus === 'Complete'));
        } else if (q.EntityName === 'MJ: Duplicate Run Detail Matches') {
            rows = store.matches.filter(m => !scopedRun || runOfDetail.get(m.DuplicateRunDetailID) === scopedRun);
        } else {
            throw new Error(`unexpected entity ${q.EntityName}`);
        }
        const [field, direction] = (sqlText(q.OrderBy) || 'ID ASC').split(/\s+/);
        const sign = direction?.toUpperCase() === 'DESC' ? -1 : 1;
        const valueOf = (r: DetailRow | MatchRow): number => {
            const v = (r as unknown as Record<string, unknown>)[field];
            return v instanceof Date ? v.getTime() : Number(v);
        };
        rows.sort((a, b) => sign * (valueOf(a) - valueOf(b)));
        const results = q.IgnoreMaxRows ? rows : rows.slice(0, MAX_ROWS);
        return { Success: true, Results: results, RowCount: results.length, TotalRowCount: rows.length } as RunViewResult;
    };
    return (queries: RunViewParams[]): RunViewResult[] => queries.map(runQuery);
}

function run(ID: string, EntityID: string, ProcessingStatus: string, StartedAt: string) {
    return { ID, EntityID, ProcessingStatus, StartedAt: new Date(StartedAt) };
}

describe('selectCurrentRunForEntity', () => {
    const runs = [
        run(RUN_PEOPLE, ENTITY_PEOPLE, 'Complete', '2026-09-20T00:00:00Z'),
        run(RUN_ORGS_NEW, ENTITY_ORGS, 'Complete', '2026-09-15T00:00:00Z'),
        run(RUN_ORGS_OLD, ENTITY_ORGS, 'Complete', '2026-09-01T00:00:00Z'),
    ];

    it("picks the latest Complete run of the requested entity, ignoring other entities' newer runs", () => {
        expect(selectCurrentRunForEntity(runs, ENTITY_ORGS)?.ID).toBe(RUN_ORGS_NEW);
        expect(selectCurrentRunForEntity(runs, ENTITY_PEOPLE)?.ID).toBe(RUN_PEOPLE);
    });

    it('prefers a Complete run over a newer one that is still in progress', () => {
        const withActive = [run('D0000000-0000-0000-0000-00000000000D', ENTITY_ORGS, 'In Progress', '2026-09-22T00:00:00Z'), ...runs];
        expect(selectCurrentRunForEntity(withActive, ENTITY_ORGS)?.ID).toBe(RUN_ORGS_NEW);
    });

    it('falls back to the latest run of any status when the entity has no Complete run', () => {
        const noneComplete = [
            run('F0000000-0000-0000-0000-00000000000F', ENTITY_ORGS, 'Failed', '2026-09-10T00:00:00Z'),
            run('D0000000-0000-0000-0000-00000000000D', ENTITY_ORGS, 'In Progress', '2026-09-22T00:00:00Z'),
        ];
        expect(selectCurrentRunForEntity(noneComplete, ENTITY_ORGS)?.ID).toBe('D0000000-0000-0000-0000-00000000000D');
    });

    it('returns null when there is no entity, or no run for it', () => {
        expect(selectCurrentRunForEntity(runs, null)).toBeNull();
        expect(selectCurrentRunForEntity(runs, '')).toBeNull();
        expect(selectCurrentRunForEntity(runs, 'E0000009-0000-0000-0000-000000000009')).toBeNull();
        expect(selectCurrentRunForEntity([], ENTITY_ORGS)).toBeNull();
    });

    it('matches the entity ID regardless of casing', () => {
        expect(selectCurrentRunForEntity(runs, ENTITY_ORGS.toLowerCase())?.ID).toBe(RUN_ORGS_NEW);
    });
});

describe('buildRunScopedReviewQueries', () => {
    it('scopes details to the run and its completed rows, and matches through their parent detail', () => {
        const [details, matches] = buildRunScopedReviewQueries(RUN_ORGS_NEW, DETAILS_VIEW);
        expect(details.EntityName).toBe('MJ: Duplicate Run Details');
        expect(details.ExtraFilter).toContain(`DuplicateRunID='${RUN_ORGS_NEW}'`);
        expect(details.ExtraFilter).toContain(`MatchStatus='Complete'`);
        expect(matches.EntityName).toBe('MJ: Duplicate Run Detail Matches');
        expect(matches.ExtraFilter).toContain('DuplicateRunDetailID IN (SELECT ID FROM [__mj].[vwDuplicateRunDetails]');
        expect(matches.ExtraFilter).toContain(`DuplicateRunID='${RUN_ORGS_NEW}'`);
    });

    it('keeps IgnoreMaxRows on BOTH sides so a run above the row cap still joins completely', () => {
        // Details truncate by date, matches by probability; inside one large run those subsets still
        // diverge, so the cap must stay off on both queries. See the module comment.
        const [details, matches] = buildRunScopedReviewQueries(RUN_ORGS_NEW, DETAILS_VIEW);
        expect(details.IgnoreMaxRows).toBe(true);
        expect(matches.IgnoreMaxRows).toBe(true);
    });

    it('doubles a stray quote in the run ID instead of letting it close the literal', () => {
        const [details, matches] = buildRunScopedReviewQueries("abc'def", DETAILS_VIEW);
        expect(details.ExtraFilter).toContain("DuplicateRunID='abc''def'");
        expect(matches.ExtraFilter).toContain("DuplicateRunID='abc''def'");
    });
});

describe('review rows for one run among several, each above the 1000-row cap', () => {
    const store = buildStore();
    const runViews = fakeRunViews(store);
    const [detailsResult, matchesResult] = runViews(buildRunScopedReviewQueries(RUN_ORGS_NEW, DETAILS_VIEW));
    const details = detailsResult.Results as DetailRow[];
    const matches = matchesResult.Results as MatchRow[];

    it("returns only the selected run's rows, not the whole table", () => {
        expect(details).toHaveLength(1200);
        expect(details.every(d => d.DuplicateRunID === RUN_ORGS_NEW)).toBe(true);
        expect(matches).toHaveLength(2400);
        expect(matches.every(m => m.DuplicateRunDetailID.startsWith(RUN_ORGS_NEW))).toBe(true);
    });

    it('joins every detail of the selected run to all of its matches, so every group builds', () => {
        const byDetail = groupMatchesByDetail(matches);
        const joined = details.filter(d => (byDetail.get(d.ID)?.length ?? 0) > 0);
        expect(joined).toHaveLength(1200);
        expect(details.every(d => byDetail.get(d.ID)?.length === 2)).toBe(true);
    });

    it('the same store loaded unscoped shows the trap: newest details, but none of their matches', () => {
        // Documents WHY scoping + IgnoreMaxRows are both needed: the legacy unscoped, capped queries
        // load the 1000 newest details (all from the new run) and the 1000 top matches (all from the
        // old run), and nothing joins.
        const [legacyDetails, legacyMatches] = runViews([
            { EntityName: 'MJ: Duplicate Run Details', ExtraFilter: "MatchStatus='Complete'", OrderBy: '__mj_CreatedAt DESC' },
            { EntityName: 'MJ: Duplicate Run Detail Matches', OrderBy: 'MatchProbability DESC' },
        ]);
        const byDetail = groupMatchesByDetail(legacyMatches.Results as MatchRow[]);
        const loadedNewRunDetails = (legacyDetails.Results as DetailRow[]).filter(d => d.DuplicateRunID === RUN_ORGS_NEW);
        expect(loadedNewRunDetails.length).toBeGreaterThan(900);
        expect(loadedNewRunDetails.filter(d => byDetail.has(d.ID))).toHaveLength(0);
    });
});
