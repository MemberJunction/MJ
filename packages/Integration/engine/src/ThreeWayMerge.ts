import type { ConflictResolution } from './types.js';
import type { RecencyWinner } from './ConflictRecency.js';

/**
 * Field mapping descriptor used by {@link ComputeThreeWayFieldMerge}.
 */
export interface ThreeWayFieldMapping {
    SourceFieldName: string;
    DestinationFieldName: string;
}

/**
 * Input options for {@link ComputeThreeWayFieldMerge}.
 */
export interface ThreeWayMergeOptions {
    /** Common ancestor snapshot keyed by `DestinationFieldName`. */
    Base: Record<string, unknown>;
    /** Local ("ours") record fields keyed by `DestinationFieldName`. */
    Ours: Record<string, unknown>;
    /** Remote ("theirs") record fields keyed by `SourceFieldName`. */
    Theirs: Record<string, unknown>;
    /** Active field mappings connecting `SourceFieldName` and `DestinationFieldName`. */
    FieldMappings: ThreeWayFieldMapping[];
    /** Conflict resolution policy ('SourceWins', 'DestWins', 'MostRecent', 'Manual'). */
    ConflictResolution: ConflictResolution | string;
    /** Winner when `ConflictResolution === 'MostRecent'` ('mj' = ours, 'external' = theirs, null = fallback to DestWins). */
    MostRecentWinner?: RecencyWinner | null;
    /**
     * Whether `MergedFields` should be keyed by `SourceFieldName` (for outbound push)
     * or `DestinationFieldName` (for inbound pull/peer-sync apply). Defaults to `'source'`.
     */
    OutputKeyMode?: 'source' | 'destination';
}

/**
 * Output of {@link ComputeThreeWayFieldMerge}.
 */
export interface ThreeWayMergeResult {
    /** `'skip'` when `Manual` policy quarantined the record; `'proceed'` otherwise. */
    Action: 'proceed' | 'skip';
    /** Fields selected by the three-way merge. */
    MergedFields: Record<string, unknown>;
    /** Destination field names where both sides changed from `Base` to different values. */
    ConflictFields: string[];
    /** True when at least one conflict occurred under `Manual` conflict resolution. */
    ManualConflict: boolean;
    /** Human-readable resolution label when `ConflictFields.length > 0`. */
    ResolutionSummary?: string;
}

/**
 * Loose value equality for conflict comparison across JSON/string/number/bool/null shapes.
 */
export function ValuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return String(a) === String(b);
}

/**
 * Performs a pull-first / peer-sync 3-way field merge between a common ancestor (`Base`),
 * local state (`Ours`), and remote state (`Theirs`).
 *
 * - Field only `Ours` changed (`OutputKeyMode === 'source'`): emit our value.
 * - Field only `Theirs` changed (`OutputKeyMode === 'destination'`): emit their value;
 *   when `OutputKeyMode === 'source'`, omit so we don't clobber their change during push.
 * - Both changed to the same value: converged (no conflict).
 * - Both changed to different values: true conflict, resolved via `ConflictResolution`.
 */
export function ComputeThreeWayFieldMerge(options: ThreeWayMergeOptions): ThreeWayMergeResult {
    const policy = options.ConflictResolution || 'DestWins';
    const mostRecentWinner = policy === 'MostRecent' ? (options.MostRecentWinner ?? null) : null;
    const oursWinsConflict =
        policy === 'DestWins' || (policy === 'MostRecent' && mostRecentWinner !== 'external');
    const outputKeyMode = options.OutputKeyMode ?? 'source';

    const mergedFields: Record<string, unknown> = {};
    const conflictFields: string[] = [];
    let manualConflict = false;

    for (const fm of options.FieldMappings) {
        const baseVal = options.Base[fm.DestinationFieldName];
        const ourVal = options.Ours[fm.DestinationFieldName];
        const theirVal = options.Theirs[fm.SourceFieldName];
        const weChanged = !ValuesEqual(ourVal, baseVal);
        const theyChanged = !ValuesEqual(theirVal, baseVal);
        const outKey = outputKeyMode === 'destination' ? fm.DestinationFieldName : fm.SourceFieldName;

        if (outputKeyMode === 'source') {
            if (weChanged && !theyChanged) {
                mergedFields[outKey] = ourVal;
            } else if (weChanged && theyChanged && !ValuesEqual(ourVal, theirVal)) {
                conflictFields.push(fm.DestinationFieldName);
                if (policy === 'Manual') {
                    manualConflict = true;
                } else if (oursWinsConflict) {
                    mergedFields[outKey] = ourVal;
                }
            }
        } else {
            // Inbound ('destination') mode: applying remote ('theirs') changes onto local ('ours')
            if (theyChanged && !weChanged) {
                mergedFields[outKey] = theirVal;
            } else if (!theyChanged && weChanged) {
                mergedFields[outKey] = ourVal;
            } else if (weChanged && theyChanged) {
                if (ValuesEqual(ourVal, theirVal)) {
                    mergedFields[outKey] = theirVal;
                } else {
                    conflictFields.push(fm.DestinationFieldName);
                    if (policy === 'Manual') {
                        manualConflict = true;
                    } else if (oursWinsConflict) {
                        mergedFields[outKey] = ourVal;
                    } else {
                        mergedFields[outKey] = theirVal;
                    }
                }
            } else {
                mergedFields[outKey] = ourVal;
            }
        }
    }

    let resolutionSummary: string | undefined;
    if (conflictFields.length > 0) {
        resolutionSummary =
            policy === 'Manual'
                ? 'quarantined'
                : policy === 'SourceWins'
                  ? 'external-wins'
                  : policy === 'MostRecent'
                    ? mostRecentWinner === 'external'
                        ? 'external-wins (most-recent)'
                        : 'mj-wins (most-recent)'
                    : 'mj-wins';
    }

    return {
        Action: manualConflict ? 'skip' : 'proceed',
        MergedFields: manualConflict ? {} : mergedFields,
        ConflictFields: conflictFields,
        ManualConflict: manualConflict,
        ResolutionSummary: resolutionSummary,
    };
}
