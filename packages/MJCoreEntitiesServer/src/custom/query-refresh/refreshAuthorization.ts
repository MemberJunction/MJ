import type { EntityInfo, UserInfo } from "@memberjunction/core";
import { NormalizeUUID } from "@memberjunction/global";
import type { QueryExtractionResult } from "../query-extraction";

/** The child entities a refresh creates, updates and deletes rows of. */
export const QUERY_REFRESH_CHILD_ENTITIES: readonly string[] = [
    'MJ: Query Fields',
    'MJ: Query Parameters',
    'MJ: Query Entities',
    'MJ: Query Dependencies',
];

/**
 * Whether `user` may refresh queries at all: Update on `MJ: Queries`, and Create, Update and
 * Delete on each of its derived child entities. A dry run needs the same, since its report
 * discloses the same metadata. Run permissions (`MJ: Query Permissions`) play no part: refreshing
 * is an authoring act.
 */
export function UserCanRefreshQueries(user: UserInfo, entities: readonly EntityInfo[]): boolean {
    const byName = new Map(entities.map(e => [e.Name.toLowerCase(), e]));
    const query = byName.get('mj: queries');
    if (!query || !query.GetUserPermisions(user)?.CanUpdate) return false;
    return QUERY_REFRESH_CHILD_ENTITIES.every(name => {
        const entity = byName.get(name.toLowerCase());
        if (!entity) return false;
        const permissions = entity.GetUserPermisions(user);
        return !!permissions && permissions.CanCreate && permissions.CanUpdate && permissions.CanDelete;
    });
}

/**
 * Whether `user` may see what a refresh of one query reveals: the column names, types and
 * sources of every entity the query reads. True only when the user can read every one of those
 * entities and is denied no field on any of them.
 *
 * @param entityIDs - The entities the query reads: its stored links and field sources, and the ones
 *   the refresh found ({@link EntityIDsOfExtraction}).
 */
export function UserCanSeeQuerySources(user: UserInfo, entityIDs: Iterable<string>, entities: readonly EntityInfo[]): boolean {
    const byID = new Map(entities.map(e => [NormalizeUUID(e.ID), e]));
    for (const id of entityIDs) {
        const entity = byID.get(NormalizeUUID(id));
        if (!entity) return false;
        if (!entity.GetUserPermisions(user)?.CanRead) return false;
        if (entity.FieldLevelSecurityApplies && entity.GetDeniedReadFields(user).size > 0) return false;
    }
    return true;
}

/** The entities a refresh's facts link the query to: the entities it reads and its fields' sources. */
export function EntityIDsOfExtraction(extraction: QueryExtractionResult): string[] {
    const ids = (extraction.Entities ?? []).map(e => e.EntityID);
    for (const field of extraction.Fields ?? []) {
        if (field.SourceEntityID) ids.push(field.SourceEntityID);
    }
    return ids;
}

/**
 * The message for a refresh of a query that does not exist or that the caller may not refresh.
 * The two are worded identically, so a refusal does not confirm that the query, or anything it
 * reads, exists. It echoes only the identifier the caller supplied.
 */
export function QueryRefreshUnavailableMessage(label: string): string {
    return `Query '${label}' does not exist or you do not have permission to refresh it.`;
}
