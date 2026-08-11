/**
 * @fileoverview Loads a run tree in one call, on either tier.
 *
 * Kept separate from `agent-run-tree.ts` on purpose: that module is **pure** — shapes, assembly,
 * traversal, formatting — and is imported by tests and by pure logic that must not drag a data
 * provider in behind it. This module is the half that talks to the database. Splitting them is what
 * lets the tree be asserted on in a unit test without a connection.
 *
 * @module @memberjunction/ai-core-plus
 */
import { RunQuery, type IRunQueryProvider, type UserInfo } from '@memberjunction/core';
import {
    MAX_AGENT_RUN_TREE_DEPTH,
    type AgentRunTreeNode,
    type AgentRunTreeNodeType,
    type AgentRunTreeRow,
    type AgentRunTreeStatus,
    BuildAgentRunTree,
    IsAgentRunTreeTruncated,
} from './agent-run-tree';

/** The stored query that returns one row per node. */
const AGENT_RUN_TREE_QUERY = 'GetAgentRunTree';

/** What loading a run tree produced. */
export type AgentRunTreeResult = {
    /** The assembled tree, or null when the run does not exist or is not visible to this user. */
    Root: AgentRunTreeNode | null;
    /** The flat rows, in the order the query returned them. Useful for assertions and for tables. */
    Rows: AgentRunTreeRow[];
    /**
     * True when at least one node sits at the depth cap, so there may be more below.
     *
     * Surfaced rather than silently swallowed: a truncated tree that looks complete is how a cost
     * total ends up quietly wrong, and how someone concludes a workflow did less than it did.
     */
    Truncated: boolean;
    /** Why the load failed, or null. */
    ErrorMessage: string | null;
};

/**
 * Loads everything an agent run caused, as one tree.
 *
 * 🔒 **RLS caveat — flagged for review, deliberately not decided here.** Stored queries do not
 * inherit entity row-level security, and agent runs are user-scoped. This loader therefore returns
 * whatever the query returns for the run id it is given. Callers on a user-facing surface must
 * establish that the caller may see the ROOT run before calling — which they already do, because
 * every current caller reached the run through a record the user opened. That is a real constraint,
 * not an oversight, and it is written here so the next caller does not assume otherwise.
 *
 * @param agentRunID the run at the top of the tree
 * @param provider   the run-query provider to use — never the global default, so this works
 *                   unchanged under a non-default provider in a multi-provider client
 * @param contextUser required server-side; omit in the browser where the session supplies it
 * @param maxDepth   depth cap; defaults to {@link MAX_AGENT_RUN_TREE_DEPTH}
 */
export async function LoadAgentRunTree(
    agentRunID: string,
    provider?: IRunQueryProvider,
    contextUser?: UserInfo,
    maxDepth: number = MAX_AGENT_RUN_TREE_DEPTH,
): Promise<AgentRunTreeResult> {
    const empty = (message: string | null): AgentRunTreeResult => ({
        Root: null,
        Rows: [],
        Truncated: false,
        ErrorMessage: message,
    });

    if (!agentRunID) return empty('An agent run ID is required.');

    try {
        const runner = new RunQuery(provider ?? null);
        const result = await runner.RunQuery(
            {
                QueryName: AGENT_RUN_TREE_QUERY,
                Parameters: { agentRunID, maxDepth },
            },
            contextUser,
        );

        if (!result?.Success) {
            return empty(result?.ErrorMessage ?? 'The run tree could not be loaded.');
        }

        const rows = (result.Results ?? []).map(projectRow);
        return {
            Root: BuildAgentRunTree(rows),
            Rows: rows,
            Truncated: IsAgentRunTreeTruncated(rows),
            ErrorMessage: null,
        };
    } catch (e) {
        return empty(e instanceof Error ? e.message : String(e));
    }
}

/**
 * Turns one query row into a typed node row.
 *
 * The query returns plain values over the wire, where a `DATETIME` may arrive as a string and a
 * `DECIMAL` as a string or a number depending on the transport. Normalising here — once — is what
 * keeps every consumer from doing its own defensive parsing and getting it subtly different.
 */
function projectRow(raw: unknown): AgentRunTreeRow {
    const r = raw as Record<string, unknown>;
    return {
        NodeID: String(r['NodeID'] ?? ''),
        ParentNodeID: r['ParentNodeID'] == null ? null : String(r['ParentNodeID']),
        Depth: toNumber(r['Depth']) ?? 0,
        Sequence: toNumber(r['Sequence']) ?? 0,
        NodeType: String(r['NodeType'] ?? 'Step') as AgentRunTreeNodeType,
        Name: String(r['Name'] ?? ''),
        Status: String(r['Status'] ?? '') as AgentRunTreeStatus,
        StartedAt: toDate(r['StartedAt']),
        CompletedAt: toDate(r['CompletedAt']),
        DurationMs: toNumber(r['DurationMs']),
        Cost: toNumber(r['Cost']),
        Tokens: toNumber(r['Tokens']),
        PromptTokens: toNumber(r['PromptTokens']),
        CompletionTokens: toNumber(r['CompletionTokens']),
        InputPayload: r['InputPayload'] == null ? null : String(r['InputPayload']),
        OutputPayload: r['OutputPayload'] == null ? null : String(r['OutputPayload']),
        SourceEntity: String(r['SourceEntity'] ?? ''),
        SourceKind: r['SourceKind'] == null ? null : String(r['SourceKind']),
        SourceID: String(r['SourceID'] ?? r['NodeID'] ?? ''),
    };
}

/** A number, or null. `null` and `''` mean absent — never zero, which is a real measurement. */
function toNumber(value: unknown): number | null {
    if (value == null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

/** A Date, or null. An unparseable timestamp is treated as absent rather than as the epoch. */
function toDate(value: unknown): Date | null {
    if (value == null || value === '') return null;
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
}
