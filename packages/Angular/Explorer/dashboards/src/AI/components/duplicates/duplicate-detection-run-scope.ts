/**
 * Pure helpers that scope the Record Duplicates board to ONE duplicate run.
 *
 * The board joins `MJ: Duplicate Run Details` to `MJ: Duplicate Run Detail Matches` by
 * DuplicateRunDetailID. Loading those two entities unscoped pulls every review row ever produced,
 * for every entity and every run (hundreds of thousands of rows on a busy tenant), and the load
 * grows with each run anyone performs. Restricting both sides to the run being viewed bounds the
 * load to that run's rows, which is what the board actually renders.
 *
 * The scoping is done in two steps, details first and then matches by the detail IDs just loaded,
 * on purpose. Matches carry no DuplicateRunID of their own, and the only single-query alternative is
 * a subquery against the details view, which needs the schema and view name quoted for the database
 * behind the API. The Angular client has no dialect knowledge (`QuoteSchemaAndView` lives on the
 * server-side database providers, not on the GraphQL provider), so a quoted reference built here is a
 * guess: bracketed T-SQL identifiers are a syntax error on PostgreSQL, where this bug was reported.
 * An `IN (...)` list of IDs is plain SQL everywhere and the join it produces is exact rather than
 * re-derived. Cost: one extra round trip.
 *
 * Why both queries still carry `IgnoreMaxRows`: details truncate to the newest N by date while
 * matches truncate to the top N by probability. Those two subsets diverge as soon as a run exceeds
 * UserViewMaxRows (1000), leaving details with no loaded matches; buildGroups() then drops every
 * such detail and the board is empty with a full run behind it. Scoping bounds the volume, and the
 * flag keeps the join complete inside that bound. Dropping the flag would bring the empty board back
 * for any single run larger than 1000 rows.
 */
import { RunViewParams } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';

/** The slice of an `MJ: Duplicate Runs` row the board needs to choose which run it shows. */
export interface DuplicateRunCandidate {
    ID: string;
    EntityID: string;
    ProcessingStatus: string;
    StartedAt: Date | string | null;
}

/** How many detail IDs go into one matches query; keeps each `IN (...)` list a sane size. */
export const MATCH_QUERY_DETAIL_CHUNK_SIZE = 500;

const DETAIL_COMPLETE = 'Complete';

/** The slice of an entity-document picker option needed to choose a default. */
export interface EntityDocumentCandidate {
    ID: string;
    EntityID: string;
}

/**
 * Pick the run the board should display for an entity: its most recent run, whatever its status.
 *
 * Not "most recent Complete run" on purpose. A run the user cancels keeps `ProcessingStatus =
 * 'In Progress'` (the detector marks it for resumption), and the board's own idle timer can finish a
 * detection before the server does; both end with a reload while a newer run exists. Preferring an
 * older Complete run there would hide the rows the user just watched being produced behind the
 * previous run's. The newest run is what the user is looking at; when it completes, the board
 * reloads and shows its full set. Runs for other entities are never candidates. Returns null when
 * there is no entity or no run for it.
 */
export function selectCurrentRunForEntity<T extends DuplicateRunCandidate>(
    runs: readonly T[],
    entityID: string | null | undefined
): T | null {
    if (!entityID) {
        return null;
    }
    return newestFirst(runs.filter(r => UUIDsEqual(r.EntityID, entityID)))[0] ?? null;
}

/**
 * The entity document the board should show before the user picks one: the document for the entity
 * of the most recent run, so a first visit lands on results that exist. Falls back to the first
 * document when no run matches any document, and to null when there are no documents at all.
 */
export function pickDefaultEntityDocument<D extends EntityDocumentCandidate>(
    documents: readonly D[],
    runs: readonly DuplicateRunCandidate[]
): D | null {
    if (documents.length === 0) {
        return null;
    }
    for (const run of newestFirst(runs)) {
        const match = documents.find(d => UUIDsEqual(d.EntityID, run.EntityID));
        if (match) {
            return match;
        }
    }
    return documents[0];
}

function newestFirst<T extends DuplicateRunCandidate>(runs: readonly T[]): T[] {
    return [...runs].sort((a, b) => toTime(b.StartedAt) - toTime(a.StartedAt));
}

/** The completed details of ONE run, newest first. Bounded by the run; `IgnoreMaxRows` per the file comment. */
export function buildRunScopedDetailsQuery(runID: string): RunViewParams {
    return {
        EntityName: 'MJ: Duplicate Run Details',
        ExtraFilter: `DuplicateRunID='${EscapeSQLString(runID)}' AND MatchStatus='${DETAIL_COMPLETE}'`,
        OrderBy: '__mj_CreatedAt DESC',
        IgnoreMaxRows: true,
        ResultType: 'entity_object'
    };
}

/**
 * The matches whose parent detail is one of `detailIDs`, as one query per chunk of
 * {@link MATCH_QUERY_DETAIL_CHUNK_SIZE} IDs. No IDs, no queries. Plain `IN (...)` so it runs on any
 * database behind the API; `IgnoreMaxRows` per the file comment.
 */
export function buildMatchQueriesForDetailIDs(
    detailIDs: readonly string[],
    chunkSize: number = MATCH_QUERY_DETAIL_CHUNK_SIZE
): RunViewParams[] {
    const queries: RunViewParams[] = [];
    for (let start = 0; start < detailIDs.length; start += chunkSize) {
        const literals = detailIDs.slice(start, start + chunkSize).map(id => `'${EscapeSQLString(id)}'`);
        queries.push({
            EntityName: 'MJ: Duplicate Run Detail Matches',
            ExtraFilter: `DuplicateRunDetailID IN (${literals.join(',')})`,
            OrderBy: 'MatchProbability DESC',
            IgnoreMaxRows: true,
            ResultType: 'entity_object'
        });
    }
    return queries;
}

/** The detail IDs a matches query built by {@link buildMatchQueriesForDetailIDs} covers. */
export function detailIDsCoveredByMatchQuery(query: RunViewParams): string[] {
    const filter = typeof query.ExtraFilter === 'string' ? query.ExtraFilter : '';
    const list = /DuplicateRunDetailID IN \((.*)\)/s.exec(filter)?.[1] ?? '';
    return list
        .split(/','/)
        .map(part => part.replace(/^'|'$/g, '').replace(/''/g, "'"))
        .filter(part => part.length > 0);
}

/** Index matches by their parent detail; the join buildGroups() performs. */
export function groupMatchesByDetail<M extends { DuplicateRunDetailID: string }>(
    matches: readonly M[]
): Map<string, M[]> {
    const byDetail = new Map<string, M[]>();
    for (const match of matches) {
        const existing = byDetail.get(match.DuplicateRunDetailID);
        if (existing) {
            existing.push(match);
        } else {
            byDetail.set(match.DuplicateRunDetailID, [match]);
        }
    }
    return byDetail;
}

function toTime(value: Date | string | null): number {
    if (!value) {
        return 0;
    }
    const time = new Date(value).getTime();
    return isNaN(time) ? 0 : time;
}
