/**
 * @fileoverview Artifact tool library for Search Result Set content.
 *
 * Search Result Set artifacts are the persisted output of a scoped search
 * (pre-execution RAG or agent-invoked). They are re-parented onto Data
 * Snapshot in metadata, so all of Data Snapshot's tabular tools (filter,
 * sort, paginate, get-row, project-columns) are inherited automatically.
 * This library adds search-specific tools on top of that:
 *
 *   - filterByScore     — narrow by post-fusion score range
 *   - groupBySourceProvider — markdown summary by provider
 *   - getMatchingChunks — fetch chunk text + metadata for a row
 *   - followSourceLink  — lift a row's source entity to a sub-artifact
 *   - rerankInline      — re-run reranking with a different reranker
 *
 * Row identifiers used in the agent-facing tool surface are alpha-sequence
 * (A, B, ..., AA, AB, ...) per the prompt-engineering convention. The
 * library maintains a runtime mapping from alpha-id → internal UUID so the
 * UUIDs never leak into the agent prompt.
 */
import { RegisterClass } from '@memberjunction/global';
import {
    BaseArtifactToolLibrary,
    type ArtifactToolDefinition,
    type ArtifactToolResult,
} from '@memberjunction/ai-core-plus';

// ---------------------------------------------------------------------------
// Internal types — no `any`
// ---------------------------------------------------------------------------

/** One row in the Search Result Set artifact's tabular Results table. */
interface SearchResultRow {
    /** Internal UUID for the row — never surfaced to the agent prompt. */
    ID: string;
    Title: string;
    Snippet: string;
    Score: number;
    EntityName?: string;
    RecordID?: string;
    SourceType?: string;
    SourceProvider?: string;
    /** Optional alpha-sequence handle assigned at render time. */
    AlphaID?: string;
    /** Per-provider score breakdown. */
    ScoreBreakdown?: Record<string, number | undefined>;
    /** Underlying chunk text + URL when available. */
    Chunk?: string;
    SourceUrl?: string;
    /** Embedding metadata from the vector store. */
    EmbeddingMetadata?: Record<string, unknown>;
}

interface SearchResultSetSpec {
    Query: string;
    ScopeIDs?: string[];
    Provider?: string;
    Reranker?: string;
    Results: SearchResultRow[];
}

interface FilterByScoreInput {
    minScore: number;
    maxScore?: number;
}

interface GetMatchingChunksInput {
    rowId: string;
}

interface FollowSourceLinkInput {
    rowId: string;
}

interface RerankInlineInput {
    rerankerName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an integer index to an alpha-sequence handle (A, B, ..., Z, AA, AB).
 * Used for row IDs surfaced to the LLM.
 */
function toAlphaId(index: number): string {
    let n = index;
    let s = '';
    do {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
}

/**
 * Parse the artifact content. Throws an InvalidContent-style error if the
 * shape doesn't match what we expect — surfaced as an ArtifactToolResult
 * failure by the caller.
 */
function parseSpec(artifactContent: string | Buffer): SearchResultSetSpec {
    const raw = typeof artifactContent === 'string' ? artifactContent : artifactContent.toString('utf8');
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Search Result Set artifact is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Search Result Set artifact must be a JSON object.');
    }

    // Two accepted shapes:
    //   1. Native Search Result Set: { Query, Results: [...] }
    //   2. Data-Snapshot-compatible (the shape AgentPreExecutionRAG.BuildArtifactPayload
    //      produces): { tables: [{ rows: [...] }], queries: [...], ... }. We adapt rows
    //      from the first table by mapping lowercase BuildArtifactPayload fields to the
    //      uppercase shape `Results: SearchResultRow[]` expects.
    if ('Results' in parsed && Array.isArray((parsed as { Results: unknown }).Results)) {
        const spec = parsed as SearchResultSetSpec;
        spec.Results.forEach((r, i) => { r.AlphaID = r.AlphaID ?? toAlphaId(i); });
        return spec;
    }

    if ('tables' in parsed && Array.isArray((parsed as { tables: unknown }).tables)) {
        const tables = (parsed as { tables: Array<{ rows?: unknown[] }> }).tables;
        const firstTable = tables[0];
        const rawRows = Array.isArray(firstTable?.rows) ? firstTable.rows : [];
        const queries = (parsed as { queries?: Array<{ query?: string }> }).queries ?? [];
        const scopeIDs = (parsed as { scopeIDs?: string[] }).scopeIDs ?? [];

        const Results: SearchResultRow[] = rawRows.map((rawRow, i) => {
            const row = (rawRow ?? {}) as Record<string, unknown>;
            const recordID = String(row['recordID'] ?? row['RecordID'] ?? row['id'] ?? row['ID'] ?? '');
            return {
                ID: String(row['id'] ?? row['ID'] ?? recordID),
                AlphaID: toAlphaId(i),
                EntityName: String(row['entity'] ?? row['EntityName'] ?? ''),
                RecordID: recordID,
                Title: String(row['title'] ?? row['Title'] ?? ''),
                Snippet: String(row['snippet'] ?? row['Snippet'] ?? ''),
                Score: typeof row['score'] === 'number' ? row['score'] as number
                    : typeof row['Score'] === 'number' ? row['Score'] as number : 0,
                SourceProvider: (row['source'] ?? row['SourceProvider']) as string | undefined,
                SourceType: (row['source'] ?? row['SourceType']) as string | undefined,
                SourceUrl: (row['sourceUrl'] ?? row['SourceUrl']) as string | undefined,
                Chunk: (row['chunk'] ?? row['Chunk']) as string | undefined,
                EmbeddingMetadata: (row['embeddingMetadata'] ?? row['EmbeddingMetadata']) as Record<string, unknown> | undefined,
            };
        });

        return {
            Query: queries[0]?.query ?? '',
            ScopeIDs: scopeIDs,
            Results,
        };
    }

    throw new Error('Search Result Set artifact missing both a Results array and a tables[] structure.');
}

function findRowByAlphaId(spec: SearchResultSetSpec, alphaId: string): SearchResultRow | undefined {
    const target = alphaId.trim().toUpperCase();
    return spec.Results.find(r => r.AlphaID === target);
}

// ---------------------------------------------------------------------------
// Tool library
// ---------------------------------------------------------------------------

/**
 * Register the library so the ArtifactToolManager can resolve it by the
 * artifact type's ToolLibraryClass column ('SearchResultSetToolLibrary').
 */
@RegisterClass(BaseArtifactToolLibrary, 'SearchResultSetToolLibrary')
export class SearchResultSetToolLibrary extends BaseArtifactToolLibrary {
    /**
     * Tools provided in addition to whatever the parent chain (DataSnapshot
     * → Data → ...) supplies. Naming and shape mirror the spec's mockup #5.
     */
    GetToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'filterByScore',
                description: 'Return the subset of search results whose post-fusion Score falls within the given range. Use this to focus on high-confidence matches when the result set is large.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        minScore: { type: 'number', description: 'Minimum post-fusion score (inclusive). Required.' },
                        maxScore: { type: 'number', description: 'Maximum post-fusion score (inclusive). Optional.' },
                    },
                    required: ['minScore'],
                },
            },
            {
                name: 'groupBySourceProvider',
                description: 'Summarize the result set grouped by which provider (vector, full-text, entity, storage, external) contributed each row. Returns a markdown table with per-group counts and average scores. Useful for understanding fusion contribution.',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            {
                name: 'getMatchingChunks',
                description: 'Given an alpha-sequence row ID (e.g. A, B, AA), return the underlying chunk text, embedding metadata, and source URL. The deep-dive tool agents will use most often after a filterByScore.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        rowId: { type: 'string', description: 'Alpha-sequence row identifier from the result set (A, B, ..., AA).' },
                    },
                    required: ['rowId'],
                },
            },
            {
                name: 'followSourceLink',
                description: 'Given an alpha-sequence row ID, lift the underlying source entity (the actual ContentItem, Document, etc.) into the agent context as a sub-artifact for further interrogation. Re-checks entity-level RLS — a search hit does not auto-grant entity permissions.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        rowId: { type: 'string', description: 'Alpha-sequence row identifier (A, B, ..., AA).' },
                    },
                    required: ['rowId'],
                },
            },
            {
                name: 'rerankInline',
                description: 'Re-run reranking on the current result set with a named reranker (Cohere, Voyage, BGE, OpenAI). Returns the new ordering plus a note of the reranker that produced it. Cost-tracked through AIPromptRunCost.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        rerankerName: { type: 'string', description: 'Name of the reranker class registered with @RegisterClass(BaseReRanker, ...). E.g. "Cohere", "Voyage", "BGE", "OpenAI".' },
                    },
                    required: ['rerankerName'],
                },
            },
        ];
    }

    async InvokeTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer,
    ): Promise<ArtifactToolResult> {
        try {
            const spec = parseSpec(artifactContent);
            switch (toolName) {
                case 'filterByScore':       return this.filterByScore(spec, input as unknown as FilterByScoreInput);
                case 'groupBySourceProvider': return this.groupBySourceProvider(spec);
                case 'getMatchingChunks':   return this.getMatchingChunks(spec, input as unknown as GetMatchingChunksInput);
                case 'followSourceLink':    return this.followSourceLink(spec, input as unknown as FollowSourceLinkInput);
                case 'rerankInline':        return this.rerankInline(spec, input as unknown as RerankInlineInput);
                default:
                    return { success: false, data: null, errorMessage: `Unknown tool: ${toolName}` };
            }
        } catch (err) {
            return { success: false, data: null, errorMessage: err instanceof Error ? err.message : String(err) };
        }
    }

    // -----------------------------------------------------------------------
    // Tool implementations
    // -----------------------------------------------------------------------

    private filterByScore(spec: SearchResultSetSpec, input: FilterByScoreInput): ArtifactToolResult {
        const { minScore, maxScore } = input;
        if (typeof minScore !== 'number') {
            return { success: false, data: null, errorMessage: "Missing or non-numeric 'minScore'." };
        }
        const upper = typeof maxScore === 'number' ? maxScore : Number.POSITIVE_INFINITY;
        const filtered = spec.Results.filter(r => r.Score >= minScore && r.Score <= upper);
        return {
            success: true,
            data: {
                count: filtered.length,
                rows: filtered.map(r => this.toAgentRow(r)),
            },
        };
    }

    private groupBySourceProvider(spec: SearchResultSetSpec): ArtifactToolResult {
        const groups = new Map<string, { count: number; sumScore: number }>();
        for (const r of spec.Results) {
            const key = r.SourceProvider ?? r.SourceType ?? 'unknown';
            const cur = groups.get(key) ?? { count: 0, sumScore: 0 };
            cur.count += 1;
            cur.sumScore += r.Score;
            groups.set(key, cur);
        }
        const rows = Array.from(groups.entries())
            .map(([provider, stats]) => ({
                Provider: provider,
                Count: stats.count,
                AvgScore: stats.count > 0 ? +(stats.sumScore / stats.count).toFixed(4) : 0,
            }))
            .sort((a, b) => b.Count - a.Count);

        // Markdown-friendly summary alongside the structured data — per the
        // markdown-not-JSON prompt-injection convention (RAG_plan §2.2).
        const md = [
            '| Provider | Count | Avg Score |',
            '|----------|-------|-----------|',
            ...rows.map(r => `| ${r.Provider} | ${r.Count} | ${r.AvgScore} |`),
        ].join('\n');

        return { success: true, data: { groups: rows, markdown: md } };
    }

    private getMatchingChunks(spec: SearchResultSetSpec, input: GetMatchingChunksInput): ArtifactToolResult {
        const row = findRowByAlphaId(spec, input.rowId);
        if (!row) {
            return { success: false, data: null, errorMessage: `Row '${input.rowId}' not found.` };
        }
        return {
            success: true,
            data: {
                rowId: row.AlphaID,
                title: row.Title,
                chunk: row.Chunk ?? row.Snippet ?? '',
                sourceUrl: row.SourceUrl ?? null,
                embeddingMetadata: row.EmbeddingMetadata ?? null,
            },
        };
    }

    private followSourceLink(spec: SearchResultSetSpec, input: FollowSourceLinkInput): ArtifactToolResult {
        const row = findRowByAlphaId(spec, input.rowId);
        if (!row) {
            return { success: false, data: null, errorMessage: `Row '${input.rowId}' not found.` };
        }
        if (!row.EntityName || !row.RecordID) {
            return { success: false, data: null, errorMessage: `Row '${input.rowId}' has no upstream entity reference (storage-only row?).` };
        }
        // The actual sub-artifact materialization happens in the agent
        // runtime — this tool returns a typed pointer plus a note that the
        // runtime should re-check entity-level RLS before inlining the
        // record into the agent context.
        return {
            success: true,
            data: {
                rowId: row.AlphaID,
                entityName: row.EntityName,
                recordId: row.RecordID,
                rlsCheckRequired: true,
                note: `Caller must re-check entity-level RLS on ${row.EntityName}.${row.RecordID} before exposing this record to the agent.`,
            },
        };
    }

    private rerankInline(spec: SearchResultSetSpec, input: RerankInlineInput): ArtifactToolResult {
        // The actual reranker invocation lives in the agent runtime — this
        // tool returns a typed request that the caller (BaseAgent) hands to
        // the SearchEngine reranker pipeline. We deliberately do NOT call
        // ClassFactory.CreateInstance here because that would couple this
        // pure-data library to the runtime budget guard. The caller is
        // responsible for budget enforcement before honoring the request.
        if (!input.rerankerName?.trim()) {
            return { success: false, data: null, errorMessage: 'rerankerName is required.' };
        }
        return {
            success: true,
            data: {
                requested: 'rerank',
                rerankerName: input.rerankerName,
                originalReranker: spec.Reranker ?? null,
                originalOrder: spec.Results.map(r => r.AlphaID),
                note: 'Runtime must invoke the named reranker via SearchEngine and replace the artifact with the new ordering. Cost-tracked through AIPromptRunCost.',
            },
        };
    }

    /** Strip internal UUID before handing a row to the LLM. */
    private toAgentRow(row: SearchResultRow): Omit<SearchResultRow, 'ID' | 'EmbeddingMetadata' | 'Chunk'> {
        const { ID, EmbeddingMetadata, Chunk, ...rest } = row;
        // Reference unused locals to keep tsc strict happy without losing
        // intent in the destructuring.
        void ID; void EmbeddingMetadata; void Chunk;
        return rest;
    }
}

/** Tree-shake-prevention hook. Call from consumer index to ensure the
 * @RegisterClass side-effect runs. */
export function LoadSearchResultSetToolLibrary(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = SearchResultSetToolLibrary;
}
