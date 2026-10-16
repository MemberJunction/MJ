/**
 * @file ExclusionClasses.ts
 * Classification and detection of non-cloneable and transient entity classes.
 * @see plans/record-cloning/README.md §5.3
 */

export type ExclusionCategory =
    | 'RunLogAudit'
    | 'PublishArtifactOrVersion'
    | 'ComputedOutput'
    | 'LiveCredentialsOrExternalHandle'
    | 'PersonalOrRespondentData'
    | 'PerUserState'
    | 'CreateDisallowed'
    | 'SoftDeleted';

export interface ExclusionEvaluation {
    Excluded: boolean;
    Category?: ExclusionCategory;
    Reason?: string;
}

/**
 * Known heuristic patterns matching operational runs, audit logs, caches, etc.
 */
const RUN_LOG_AUDIT_PATTERNS = [
    /\bRuns?\b/i,
    /\bRun Details?\b/i,
    /\bRun Steps?\b/i,
    /\bLogs?\b/i,
    /\bChanges?\b/i,
    /\bCache\b/i,
    /\bWatermarks?\b/i,
    /\bHistories\b/i,
    /\bHistory\b/i,
    /\bAudit\b/i,
    /\bSnapshots?\b/i,
];

/**
 * Known heuristic patterns matching per-user runtime state.
 */
const PER_USER_STATE_PATTERNS = [
    /\bUser States?\b/i,
    /\bUser Preferences?\b/i,
    /\bFavorites?\b/i,
    /\bNotifications?\b/i,
];

/**
 * Checks whether an entity belongs to an exclusion class based on its configuration,
 * metadata flags, and naming patterns.
 */
export function EvaluateExclusionClass(params: {
    EntityName: string;
    NotCloneable?: boolean;
    NotCloneableReason?: string;
    AllowCreateAPI?: boolean;
    /**
     * true: evaluate only the name heuristics; false: only the explicit NotCloneable / AllowCreateAPI
     * rules; omitted: both. Callers skip the heuristics when a configuration names the edge.
     */
    HeuristicsOnly?: boolean;
}): ExclusionEvaluation {
    const { EntityName, NotCloneable, NotCloneableReason, AllowCreateAPI, HeuristicsOnly } = params;
    const explicit = HeuristicsOnly !== true;
    const heuristics = HeuristicsOnly !== false;

    // 1. Explicit NotCloneable configuration
    if (explicit && NotCloneable) {
        return {
            Excluded: true,
            Category: 'RunLogAudit',
            Reason:
                NotCloneableReason ||
                `Entity '${EntityName}' is explicitly configured as NotCloneable.`,
        };
    }

    // 2. AllowCreateAPI false: can never be created
    if (explicit && AllowCreateAPI === false) {
        return {
            Excluded: true,
            Category: 'CreateDisallowed',
            Reason: `Entity '${EntityName}' has AllowCreateAPI=false in metadata and cannot be created.`,
        };
    }

    if (!heuristics) return { Excluded: false };

    // 3. Heuristic: Run / Log / Audit / History patterns
    for (const pattern of RUN_LOG_AUDIT_PATTERNS) {
        if (pattern.test(EntityName)) {
            return {
                Excluded: true,
                Category: 'RunLogAudit',
                Reason: `Entity '${EntityName}' matches operational log, run, or history pattern.`,
            };
        }
    }

    // 4. Heuristic: per-user runtime state. A configuration that names the edge (checked by the
    //    caller) is the only way to copy it; there is no entity-specific exception.
    for (const pattern of PER_USER_STATE_PATTERNS) {
        if (pattern.test(EntityName)) {
            return {
                Excluded: true,
                Category: 'PerUserState',
                Reason: `Entity '${EntityName}' represents transient per-user state.`,
            };
        }
    }

    return { Excluded: false };
}
