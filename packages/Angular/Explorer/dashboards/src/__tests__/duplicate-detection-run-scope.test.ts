/**
 * Run-scoped loading for the Record Duplicates board.
 *
 * The regression these helpers guard: with more than UserViewMaxRows (1000) review rows spread over
 * more than one run, an unscoped load truncates details (newest first) and matches (highest
 * probability first) to DIFFERENT subsets, so the details that load have no matches and every group
 * is dropped. The board must load ONE run's rows, and all of them, so the join is complete.
 *
 * Matches are scoped by the detail IDs already loaded, not by a subquery: the client cannot quote a
 * schema/view for the database behind the API, so the tests pin WHICH detail IDs the match queries
 * cover, never the SQL text of the filter. The fake RunViews below reproduces the real truncation
 * semantics (OrderBy, then cut at 1000 unless IgnoreMaxRows) so the queries are exercised the way
 * the server would run them.
 */
import { describe, it, expect } from 'vitest';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import {
    MATCH_QUERY_DETAIL_CHUNK_SIZE,
    buildMatchQueriesForDetailIDs,
    buildRunScopedDetailsQuery,
    detailIDsCoveredByMatchQuery,
    groupMatchesByDetail,
    pickDefaultEntityDocument,
    selectCurrentRunForEntity,
} from '../AI/components/duplicates/duplicate-detection-run-scope';

const ENTITY_ORGS = 'E0000001-0000-0000-0000-000000000001';
const ENTITY_PEOPLE = 'E0000002-0000-0000-0000-000000000002';
const RUN_ORGS_OLD = 'A0000000-0000-0000-0000-00000000000A';
const RUN_ORGS_NEW = 'B0000000-0000-0000-0000-00000000000B';
const RUN_PEOPLE = 'C0000000-0000-0000-0000-00000000000C';
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
    // Three matches per detail: a 500-detail chunk then holds 1500 matches, above the cap, so the
    // match side of the join depends on IgnoreMaxRows too.
    const old = makeRun(RUN_ORGS_OLD, new Date('2026-09-01T00:00:00Z'), 0.95, 1200, 3);
    const recent = makeRun(RUN_ORGS_NEW, new Date('2026-09-15T00:00:00Z'), 0.75, 1200, 3);
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
    const runQuery = (q: RunViewParams): RunViewResult => {
        let rows: Array<DetailRow | MatchRow>;
        if (q.EntityName === 'MJ: Duplicate Run Details') {
            const filter = sqlText(q.ExtraFilter);
            const scopedRun = /DuplicateRunID='([^']*)'/.exec(filter)?.[1];
            const completeOnly = /MatchStatus='Complete'/.test(filter);
            rows = store.details.filter(d =>
                (!scopedRun || d.DuplicateRunID === scopedRun) && (!completeOnly || d.MatchStatus === 'Complete'));
        } else if (q.EntityName === 'MJ: Duplicate Run Detail Matches') {
            const covered = new Set(detailIDsCoveredByMatchQuery(q));
            rows = store.matches.filter(m => covered.size === 0 || covered.has(m.DuplicateRunDetailID));
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

/** The two-step load the board performs: the run's details, then the matches for exactly those details. */
function loadReviewRows(runViews: ReturnType<typeof fakeRunViews>, runID: string) {
    const [detailsResult] = runViews([buildRunScopedDetailsQuery(runID)]);
    const details = detailsResult.Results as DetailRow[];
    const matchQueries = buildMatchQueriesForDetailIDs(details.map(d => d.ID));
    const matches = runViews(matchQueries).flatMap(r => r.Results as MatchRow[]);
    return { details, matchQueries, matches };
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

    it("picks the latest run of the requested entity, ignoring other entities' newer runs", () => {
        expect(selectCurrentRunForEntity(runs, ENTITY_ORGS)?.ID).toBe(RUN_ORGS_NEW);
        expect(selectCurrentRunForEntity(runs, ENTITY_PEOPLE)?.ID).toBe(RUN_PEOPLE);
    });

    it('shows a newer run even while it is still In Progress (a cancelled run stays In Progress)', () => {
        // Preferring the older Complete run here would hide the rows the user just watched being produced.
        const withActive = [...runs, run('D0000000-0000-0000-0000-00000000000D', ENTITY_ORGS, 'In Progress', '2026-09-22T00:00:00Z')];
        expect(selectCurrentRunForEntity(withActive, ENTITY_ORGS)?.ID).toBe('D0000000-0000-0000-0000-00000000000D');
    });

    it('orders by StartedAt, not by the order the rows arrived in', () => {
        const shuffled = [
            run('F0000000-0000-0000-0000-00000000000F', ENTITY_ORGS, 'Failed', '2026-09-10T00:00:00Z'),
            run(RUN_ORGS_NEW, ENTITY_ORGS, 'Complete', '2026-09-15T00:00:00Z'),
            run(RUN_ORGS_OLD, ENTITY_ORGS, 'Complete', '2026-09-01T00:00:00Z'),
        ];
        expect(selectCurrentRunForEntity(shuffled, ENTITY_ORGS)?.ID).toBe(RUN_ORGS_NEW);
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

describe('pickDefaultEntityDocument', () => {
    const docs = [
        { ID: 'DOC-UNRELATED', EntityID: 'E0000009-0000-0000-0000-000000000009' },
        { ID: 'DOC-ORGS', EntityID: ENTITY_ORGS },
        { ID: 'DOC-PEOPLE', EntityID: ENTITY_PEOPLE },
    ];

    it('lands on the document for the entity of the most recent run, not on the first document', () => {
        const runs = [
            run(RUN_ORGS_NEW, ENTITY_ORGS, 'Complete', '2026-09-15T00:00:00Z'),
            run(RUN_PEOPLE, ENTITY_PEOPLE, 'Complete', '2026-09-20T00:00:00Z'),
        ];
        expect(pickDefaultEntityDocument(docs, runs)?.ID).toBe('DOC-PEOPLE');
    });

    it('skips runs whose entity has no document and takes the next newest', () => {
        const runs = [
            run('Z0000000-0000-0000-0000-00000000000Z', 'E0000007-0000-0000-0000-000000000007', 'Complete', '2026-09-21T00:00:00Z'),
            run(RUN_ORGS_NEW, ENTITY_ORGS, 'Complete', '2026-09-15T00:00:00Z'),
        ];
        expect(pickDefaultEntityDocument(docs, runs)?.ID).toBe('DOC-ORGS');
    });

    it('falls back to the first document when no run matches, and to null with no documents', () => {
        expect(pickDefaultEntityDocument(docs, [])?.ID).toBe('DOC-UNRELATED');
        expect(pickDefaultEntityDocument([], [run(RUN_ORGS_NEW, ENTITY_ORGS, 'Complete', '2026-09-15T00:00:00Z')])).toBeNull();
    });
});

describe('buildRunScopedDetailsQuery', () => {
    it('scopes details to the run and its completed rows, with the row cap off', () => {
        const q = buildRunScopedDetailsQuery(RUN_ORGS_NEW);
        expect(q.EntityName).toBe('MJ: Duplicate Run Details');
        expect(q.ExtraFilter).toContain(`DuplicateRunID='${RUN_ORGS_NEW}'`);
        expect(q.ExtraFilter).toContain(`MatchStatus='Complete'`);
        expect(q.IgnoreMaxRows).toBe(true);
    });

    it('doubles a stray quote in the run ID instead of letting it close the literal', () => {
        expect(buildRunScopedDetailsQuery("abc'def").ExtraFilter).toContain("DuplicateRunID='abc''def'");
    });
});

describe('buildMatchQueriesForDetailIDs', () => {
    it('covers exactly the detail IDs it was given, chunked, and nothing for an empty list', () => {
        const ids = Array.from({ length: 1200 }, (_, i) => `D${i}`);
        const queries = buildMatchQueriesForDetailIDs(ids);
        expect(queries).toHaveLength(Math.ceil(1200 / MATCH_QUERY_DETAIL_CHUNK_SIZE));
        expect(queries.every(q => q.EntityName === 'MJ: Duplicate Run Detail Matches')).toBe(true);
        expect(queries.every(q => q.IgnoreMaxRows === true)).toBe(true);
        const covered = queries.flatMap(detailIDsCoveredByMatchQuery);
        expect(covered).toEqual(ids);
        expect(queries.map(q => detailIDsCoveredByMatchQuery(q).length)).toEqual([500, 500, 200]);
        expect(buildMatchQueriesForDetailIDs([])).toEqual([]);
    });

    it('keeps an ID with a quote intact through escaping and back', () => {
        const [q] = buildMatchQueriesForDetailIDs(["x'y", 'z']);
        expect(detailIDsCoveredByMatchQuery(q)).toEqual(["x'y", 'z']);
    });
});

describe('review rows for one run among several, each above the 1000-row cap', () => {
    const store = buildStore();
    const runViews = fakeRunViews(store);
    const { details, matchQueries, matches } = loadReviewRows(runViews, RUN_ORGS_NEW);

    it("returns only the selected run's details, all of them", () => {
        expect(details).toHaveLength(1200);
        expect(details.every(d => d.DuplicateRunID === RUN_ORGS_NEW)).toBe(true);
    });

    it("asks for matches of exactly the selected run's details, no more and no fewer", () => {
        const covered = matchQueries.flatMap(detailIDsCoveredByMatchQuery).sort();
        expect(covered).toEqual(details.map(d => d.ID).sort());
    });

    it('joins every detail of the selected run to all of its matches, so every group builds', () => {
        expect(matches).toHaveLength(3600);
        const byDetail = groupMatchesByDetail(matches);
        expect(details.every(d => byDetail.get(d.ID)?.length === 3)).toBe(true);
    });

    it('the same store loaded unscoped shows the trap: newest details, but none of their matches', () => {
        // Documents WHY scoping + IgnoreMaxRows are both needed: the legacy unscoped, capped queries
        // load the 1000 newest details (mostly from the new run) and the 1000 top matches (from the
        // old run), and nothing from the new run joins.
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
