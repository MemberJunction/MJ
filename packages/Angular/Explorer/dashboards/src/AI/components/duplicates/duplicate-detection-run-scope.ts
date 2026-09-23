/**
 * Pure helpers that scope the Record Duplicates board to ONE duplicate run.
 *
 * The board joins `MJ: Duplicate Run Details` to `MJ: Duplicate Run Detail Matches` by
 * DuplicateRunDetailID. Loading those two entities unscoped pulls every review row ever produced,
 * for every entity and every run (hundreds of thousands of rows on a busy tenant), and the load
 * grows with each run anyone performs. Restricting both sides to the run being viewed bounds the
 * load to that run's rows, which is what the board actually renders.
 *
 * Why the scoped queries still carry `IgnoreMaxRows`: details truncate to the newest N by date while
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

/** Schema and base view of `MJ: Duplicate Run Details`; matches are scoped through their parent detail. */
export interface DuplicateRunDetailsViewInfo {
    SchemaName: string;
    BaseView: string;
}

const RUN_COMPLETE = 'Complete';
const DETAIL_COMPLETE = 'Complete';

/**
 * Pick the run the board should display for an entity: the most recent COMPLETE run for that entity,
 * or, when the entity has no complete run yet, its most recent run of any status (so a run that is
 * still in progress, or failed part-way, still surfaces what it produced). Runs for other entities
 * are never candidates. Returns null when there is no entity or no run for it.
 */
export function selectCurrentRunForEntity<T extends DuplicateRunCandidate>(
    runs: readonly T[],
    entityID: string | null | undefined
): T | null {
    if (!entityID) {
        return null;
    }
    const forEntity = runs
        .filter(r => UUIDsEqual(r.EntityID, entityID))
        .sort((a, b) => toTime(b.StartedAt) - toTime(a.StartedAt));
    if (forEntity.length === 0) {
        return null;
    }
    return forEntity.find(r => r.ProcessingStatus === RUN_COMPLETE) ?? forEntity[0];
}

/**
 * Build the two review-row queries for ONE run: its completed details, and the matches whose parent
 * detail belongs to that run. Both are bounded by the run, and both keep `IgnoreMaxRows` so the two
 * sides stay a consistent set (see the file comment).
 */
export function buildRunScopedReviewQueries(
    runID: string,
    detailsView: DuplicateRunDetailsViewInfo
): [RunViewParams, RunViewParams] {
    const runLiteral = EscapeSQLString(runID);
    const detailsQuery: RunViewParams = {
        EntityName: 'MJ: Duplicate Run Details',
        ExtraFilter: `DuplicateRunID='${runLiteral}' AND MatchStatus='${DETAIL_COMPLETE}'`,
        OrderBy: '__mj_CreatedAt DESC',
        IgnoreMaxRows: true,
        ResultType: 'entity_object'
    };
    const matchesQuery: RunViewParams = {
        EntityName: 'MJ: Duplicate Run Detail Matches',
        ExtraFilter:
            `DuplicateRunDetailID IN (SELECT ID FROM [${detailsView.SchemaName}].[${detailsView.BaseView}] ` +
            `WHERE DuplicateRunID='${runLiteral}')`,
        OrderBy: 'MatchProbability DESC',
        IgnoreMaxRows: true,
        ResultType: 'entity_object'
    };
    return [detailsQuery, matchesQuery];
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
