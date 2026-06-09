import { Metadata, UserInfo } from '@memberjunction/core';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { QueryEngine } from '@memberjunction/core-entities';

/**
 * Result of evaluating a user's permissions against a component's data requirements.
 */
export interface PermissionEvaluationResult {
    /** Whether the user can run all data operations the component requires */
    canRun: boolean;
    /** Entity names the user lacks read permission for */
    missingEntities: string[];
    /** Query names the user lacks permission to execute */
    missingQueries: string[];
}

/**
 * Evaluates whether a user has sufficient permissions to run a component
 * based on its declared dataRequirements. Checks both entity-level read
 * permissions and query-level execution permissions.
 *
 * Runs entirely on client-side metadata — no additional server call needed.
 */
function evaluateComponentPermissionsSingle(
    spec: ComponentSpec,
    currentUser: UserInfo
): PermissionEvaluationResult {
    const missingEntities: string[] = [];
    const missingQueries: string[] = [];
    const dataReqs = spec.dataRequirements;

    if (!dataReqs) {
        return { canRun: true, missingEntities: [], missingQueries: [] };
    }

    // Check entity permissions (all current components are read-only)
    const md = new Metadata();
    for (const entityReq of dataReqs.entities ?? []) {
        const entityInfo = md.EntityByName(entityReq.name);
        if (!entityInfo) continue; // Unknown entity — skip (may be stale reference)

        const perms = entityInfo.GetUserPermisions(currentUser);
        if (!perms?.CanRead) {
            missingEntities.push(entityReq.name);
        }
    }

    // Check query permissions using centralized UserCanRun logic
    const qe = QueryEngine.Instance;
    for (const queryReq of dataReqs.queries ?? []) {
        if (!queryReq.name) continue;

        const queryInfo = qe.FindQueryByName(queryReq.name);
        if (!queryInfo) continue; // Unknown query — skip

        const result = queryInfo.UserCanRun(currentUser);
        if (!result.canRun) {
            missingQueries.push(queryReq.name);
        }
    }

    return {
        canRun: missingEntities.length === 0 && missingQueries.length === 0,
        missingEntities,
        missingQueries,
    };
}

/**
 * Recursively evaluates permissions for a component and all its dependencies.
 * Walks the full dependency tree, deduplicating results.
 */
export function evaluateComponentPermissions(
    spec: ComponentSpec,
    currentUser: UserInfo
): PermissionEvaluationResult {
    const result = evaluateComponentPermissionsSingle(spec, currentUser);

    for (const dep of spec.dependencies ?? []) {
        const depResult = evaluateComponentPermissions(dep, currentUser);
        result.missingEntities.push(...depResult.missingEntities);
        result.missingQueries.push(...depResult.missingQueries);
    }

    // Deduplicate
    result.missingEntities = [...new Set(result.missingEntities)];
    result.missingQueries = [...new Set(result.missingQueries)];
    result.canRun = result.missingEntities.length === 0 && result.missingQueries.length === 0;

    return result;
}
