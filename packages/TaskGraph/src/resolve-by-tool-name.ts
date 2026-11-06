/**
 * @fileoverview Shared name-to-ID resolver for `MJ: Actions` and `MJ: AI Agents`, bridging both
 * canonical display names (`"Calculate Expression"`, `"Query Builder"`) and sanitized native tool
 * names (`"calculate_expression"`, `"delegate_to_query_builder"`).
 *
 * Centralizes SQL literal escaping (`EscapeSQLString`), `RunView.Success` error handling, and
 * unambiguous single-match `SanitizeToolName` fallback so `TaskGraphService` and
 * `TaskGraphDispatcher` cannot drift or silently mask database query failures as "unknown name".
 *
 * @module @memberjunction/task-graph
 */
import { LogError, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { SanitizeToolName, SUB_AGENT_TOOL_PREFIX } from '@memberjunction/ai-agents';

export interface NamedIdRecord {
    ID: string;
    Name: string;
    Status?: string;
}

export interface ResolveRecordsByNameOptions {
    /** Metadata entity name (`'MJ: Actions'` or `'MJ: AI Agents'`). */
    EntityName: string;
    /** Raw names referenced by the caller (canonical or sanitized native tool names). */
    Names: readonly string[];
    /** Metadata provider to query through. */
    Provider: IMetadataProvider;
    /** User context for `RunView` and permission checks. */
    ContextUser: UserInfo;
    /**
     * When true, restricts the initial `Name IN (...)` query to `Status = 'Active'` and requests
     * `Status` in `Fields`.
     */
    ActiveOnly?: boolean;
    /**
     * When true, strips `SUB_AGENT_TOOL_PREFIX` (`delegate_to_`) case-insensitively before
     * comparing sanitized tool names against active records.
     */
    StripSubAgentPrefix?: boolean;
    /**
     * Optional batch permission filter evaluated on non-empty exact-match results before
     * per-record `AllowCandidate`.
     */
    FilterCandidates?: (records: NamedIdRecord[]) => Promise<NamedIdRecord[]>;
    /**
     * Optional permission or eligibility filter evaluated before accepting either an exact match
     * or a sanitized-tool-name fallback match.
     */
    AllowCandidate?: (record: NamedIdRecord) => Promise<boolean> | boolean;
}

export interface ResolveRecordsByNameResult {
    Success: boolean;
    Map?: Map<string, string>;
    Missing?: string[];
    /** Active records that matched by name or tool name but were rejected by `FilterCandidates` or `AllowCandidate`. */
    Rejected?: Map<string, NamedIdRecord>;
    ErrorMessage?: string;
}

/** True when a name looks like a sanitized native tool name (`calculate_expression`, `delegate_to_sage`). */
function looksLikeSanitizedToolName(name: string): boolean {
    const trimmed = name.trim();
    return trimmed.length > 0 && (trimmed.includes('_') || trimmed === trimmed.toLowerCase());
}

/**
 * Resolves a set of canonical or sanitized native-tool names to record IDs via an exact
 * `Name IN (...)` query followed (when unresolved names look like sanitized tool names) by an
 * active-records `SanitizeToolName` scan accepting strictly unambiguous (`matches.length === 1`)
 * matches.
 */
export async function ResolveRecordsByNameOrToolName(
    options: ResolveRecordsByNameOptions,
): Promise<ResolveRecordsByNameResult> {
    const uniqueNames = [...new Set(options.Names.filter((n) => n.trim().length > 0))];
    const found = new Map<string, string>();
    const rejected = new Map<string, NamedIdRecord>();
    if (uniqueNames.length === 0) {
        return { Success: true, Map: found, Missing: [], Rejected: rejected };
    }

    const quoted = uniqueNames.map((n) => `'${EscapeSQLString(n)}'`).join(',');
    const rv = RunView.FromMetadataProvider(options.Provider);
    const exact = await rv.RunView<NamedIdRecord>(
        {
            EntityName: options.EntityName,
            ExtraFilter: options.ActiveOnly ? `Name IN (${quoted}) AND Status = 'Active'` : `Name IN (${quoted})`,
            Fields: options.ActiveOnly ? ['ID', 'Name', 'Status'] : ['ID', 'Name'],
            ResultType: 'simple',
        },
        options.ContextUser,
    );

    if (!exact.Success) {
        const reason = exact.ErrorMessage || `RunView on "${options.EntityName}" failed`;
        LogError(`[TaskGraph] Failed to resolve "${options.EntityName}" by name: ${reason}`);
        return { Success: false, ErrorMessage: reason };
    }

    const exactRows = exact.Results ?? [];
    const batchAllowedIds =
        options.FilterCandidates && exactRows.length > 0
            ? new Set((await options.FilterCandidates(exactRows)).map((r) => r.ID))
            : null;

    const exactByLower = new Map<string, NamedIdRecord>();
    const rejectedByLower = new Map<string, NamedIdRecord>();
    for (const r of exactRows) {
        const allowedByBatch = !batchAllowedIds || batchAllowedIds.has(r.ID);
        const allowedByCandidate = allowedByBatch && (!options.AllowCandidate || (await options.AllowCandidate(r)));
        if (!allowedByCandidate) {
            if (!rejectedByLower.has(r.Name.toLowerCase())) {
                rejectedByLower.set(r.Name.toLowerCase(), r);
            }
            continue;
        }
        found.set(r.Name, r.ID);
        if (!exactByLower.has(r.Name.toLowerCase())) {
            exactByLower.set(r.Name.toLowerCase(), r);
        }
    }
    for (const req of uniqueNames) {
        if (!found.has(req)) {
            const ciMatch = exactByLower.get(req.toLowerCase());
            if (ciMatch) {
                found.set(req, ciMatch.ID);
                continue;
            }
            const rejectedMatch = rejectedByLower.get(req.toLowerCase());
            if (rejectedMatch) {
                rejected.set(req, rejectedMatch);
            }
        }
    }

    const unresolvedForFallback = uniqueNames.filter((n) => !found.has(n) && !rejected.has(n));
    if (unresolvedForFallback.length > 0 && unresolvedForFallback.some(looksLikeSanitizedToolName)) {
        const fallback = await rv.RunView<NamedIdRecord>(
            {
                EntityName: options.EntityName,
                ExtraFilter: `Status='Active'`,
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
            },
            options.ContextUser,
        );

        if (!fallback.Success) {
            const reason = fallback.ErrorMessage || `Fallback RunView on "${options.EntityName}" failed`;
            LogError(`[TaskGraph] Failed to query active "${options.EntityName}" for tool-name resolution: ${reason}`);
            return { Success: false, ErrorMessage: reason };
        }

        const subAgentPrefix = (SUB_AGENT_TOOL_PREFIX ?? 'delegate_to_').toLowerCase();
        const activeRecords = fallback.Results ?? [];
        for (const rawName of unresolvedForFallback) {
            const trimmed = rawName.trim();
            const stripped =
                options.StripSubAgentPrefix && trimmed.toLowerCase().startsWith(subAgentPrefix)
                    ? trimmed.slice(subAgentPrefix.length)
                    : trimmed;
            const targetSanitized = SanitizeToolName(stripped);
            if (!targetSanitized) continue;

            const matches = activeRecords.filter((r) => SanitizeToolName(r.Name) === targetSanitized);
            if (matches.length === 1) {
                const candidate = matches[0];
                if (options.AllowCandidate && !(await options.AllowCandidate(candidate))) {
                    rejected.set(rawName, candidate);
                    continue;
                }
                found.set(rawName, candidate.ID);
            }
        }
    }

    const missing = uniqueNames.filter((n) => !found.has(n));
    return { Success: true, Map: found, Missing: missing, Rejected: rejected };
}
