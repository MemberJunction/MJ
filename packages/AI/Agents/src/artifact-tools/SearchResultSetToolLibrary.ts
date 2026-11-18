/**
 * @fileoverview Artifact tool library for Search Result Set content.
 *
 * Search Result Set artifacts are the persisted output of a scoped search
 * (pre-execution RAG or agent-invoked). They are re-parented onto Data
 * Snapshot in metadata, so all of Data Snapshot's tabular tools (filter,
 * sort, paginate, get-row, project-columns) are inherited automatically.
 * This library adds search-specific tools on top of that:
 *
 *   - filterByScore     — narrow by post-fusion (rank-based) score range
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
    ArtifactJsonValue,
    ArtifactToolArgs,
    BaseArtifactToolLibrary,
    type ArtifactToolDefinition,
    type ArtifactToolResult,
} from '@memberjunction/ai-core-plus';

// ---------------------------------------------------------------------------
// Internal types — no `any` or `unknown`
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
    EmbeddingMetadata?: ArtifactToolArgs;
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

function isJsonRecord(value: ArtifactJsonValue | undefined): value is ArtifactToolArgs {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse the artifact content. Throws an InvalidContent-style error if the
 * shape doesn't match what we expect — surfaced as an ArtifactToolResult
 * failure by the caller.
 */
function parseSpec(artifactContent: string | Buffer): SearchResultSetSpec {
    const raw = typeof artifactContent === 'string' ? artifactContent : artifactContent.toString('utf8');
    let parsed: ArtifactJsonValue;
    try {
        parsed = JSON.parse(raw) as ArtifactJsonValue;
    } catch (err) {
        throw new Error(`Search Result Set artifact is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!isJsonRecord(parsed)) {
        throw new Error('Search Result Set artifact must be a JSON object.');
    }

    // Two accepted shapes:
    //   1. Native Search Result Set: { Query, Results: [...] }
    //   2. Data-Snapshot-compatible (the shape AgentPreExecutionRAG.BuildArtifactPayload
    //      produces): { tables: [{ rows: [...] }], queries: [...], ... }. We adapt rows
    //      from the first table by mapping lowercase BuildArtifactPayload fields to the
    //      uppercase shape `Results: SearchResultRow[]` expects.
    if (Array.isArray(parsed.Results)) {
        const rawResults = parsed.Results;
        const mappedResults: SearchResultRow[] = rawResults.filter(isJsonRecord).map((row, i) => ({
            ID: typeof row.ID === 'string' ? row.ID : '',
            Title: typeof row.Title === 'string' ? row.Title : '',
            Snippet: typeof row.Snippet === 'string' ? row.Snippet : '',
            Score: typeof row.Score === 'number' ? row.Score : 0,
            EntityName: typeof row.EntityName === 'string' ? row.EntityName : undefined,
            RecordID: typeof row.RecordID === 'string' ? row.RecordID : undefined,
            SourceType: typeof row.SourceType === 'string' ? row.SourceType : undefined,
            SourceProvider: typeof row.SourceProvider === 'string' ? row.SourceProvider : undefined,
            AlphaID: typeof row.AlphaID === 'string' ? row.AlphaID : toAlphaId(i),
            ScoreBreakdown: isJsonRecord(row.ScoreBreakdown)
                ? (row.ScoreBreakdown as Record<string, number | undefined>)
                : undefined,
            Chunk: typeof row.Chunk === 'string' ? row.Chunk : undefined,
            SourceUrl: typeof row.SourceUrl === 'string' ? row.SourceUrl : undefined,
            EmbeddingMetadata: isJsonRecord(row.EmbeddingMetadata) ? row.EmbeddingMetadata : undefined,
        }));
        return {
            Query: typeof parsed.Query === 'string' ? parsed.Query : '',
            ScopeIDs: Array.isArray(parsed.ScopeIDs)
                ? parsed.ScopeIDs.filter((s): s is string => typeof s === 'string')
                : undefined,
            Provider: typeof parsed.Provider === 'string' ? parsed.Provider : undefined,
            Reranker: typeof parsed.Reranker === 'string' ? parsed.Reranker : undefined,
            Results: mappedResults,
        };
    }

    if (Array.isArray(parsed.tables)) {
        const firstTable = isJsonRecord(parsed.tables[0]) ? parsed.tables[0] : null;
        const rawRows = firstTable && Array.isArray(firstTable.rows) ? firstTable.rows : [];
        const queries = Array.isArray(parsed.queries) ? parsed.queries : [];
        const firstQuery = isJsonRecord(queries[0]) && typeof queries[0].query === 'string' ? queries[0].query : '';
        const scopeIDs = Array.isArray(parsed.scopeIDs)
            ? parsed.scopeIDs.filter((s): s is string => typeof s === 'string')
            : [];

        const Results: SearchResultRow[] = rawRows.map((rawRow, i) => {
            const row: ArtifactToolArgs = isJsonRecord(rawRow) ? rawRow : {};
            const recordID = String(row['recordID'] ?? row['RecordID'] ?? row['id'] ?? row['ID'] ?? '');
            const rawMeta = row['embeddingMetadata'] ?? row['EmbeddingMetadata'];
            const sourceStr = typeof row['source'] === 'string' ? row['source'] : undefined;
            return {
                ID: String(row['id'] ?? row['ID'] ?? recordID),
                AlphaID: toAlphaId(i),
                EntityName: String(row['entity'] ?? row['EntityName'] ?? ''),
                RecordID: recordID,
                Title: String(row['title'] ?? row['Title'] ?? ''),
                Snippet: String(row['snippet'] ?? row['Snippet'] ?? ''),
                Score: typeof row['score'] === 'number' ? row['score']
                    : typeof row['Score'] === 'number' ? row['Score'] : 0,
                SourceProvider: typeof row['SourceProvider'] === 'string' ? row['SourceProvider'] : sourceStr,
                SourceType: typeof row['SourceType'] === 'string' ? row['SourceType'] : sourceStr,
                SourceUrl: typeof row['sourceUrl'] === 'string'
                    ? row['sourceUrl']
                    : typeof row['SourceUrl'] === 'string'
                      ? row['SourceUrl']
                      : undefined,
                Chunk: typeof row['chunk'] === 'string'
                    ? row['chunk']
                    : typeof row['Chunk'] === 'string'
                      ? row['Chunk']
                      : undefined,
                EmbeddingMetadata: isJsonRecord(rawMeta) ? rawMeta : undefined,
            };
        });

        return {
            Query: firstQuery,
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
    protected getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'filterByScore',
                description: 'Return the subset of search results whose post-fusion Score falls within the given range. Score is RANK-based (RRF divided by its maximum, 0-1; 1.0 = every search lane ranked it first). It is not a confidence or relevance probability: the top result of a search that only one lane answered is always 1.0, even for a poor match. Use this to keep the top-ranked part of a large result set, not to judge whether results are relevant.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        minScore: { type: 'number', description: 'Minimum rank-based post-fusion Score (0-1, inclusive). Required.' },
                        maxScore: { type: 'number', description: 'Maximum rank-based post-fusion Score (0-1, inclusive). Optional.' },
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

    protected async invokeSubclassTool(
        toolName: string,
        input: ArtifactToolArgs,
        artifactContent: string | Buffer,
    ): Promise<ArtifactToolResult> {
        try {
            const spec = parseSpec(artifactContent);
            switch (toolName) {
                case 'filterByScore':
                    return this.filterByScore(spec, {
                        minScore: typeof input.minScore === 'number' ? input.minScore : Number.NaN,
                        maxScore: typeof input.maxScore === 'number' ? input.maxScore : undefined,
                    });
                case 'groupBySourceProvider':
                    return this.groupBySourceProvider(spec);
                case 'getMatchingChunks':
                    return this.getMatchingChunks(spec, {
                        rowId: typeof input.rowId === 'string' ? input.rowId : '',
                    });
                case 'followSourceLink':
                case 'follow_source_link':
                    return this.followSourceLink(spec, {
                        rowId: typeof input.rowId === 'string' ? input.rowId : '',
                    });
                case 'rerankInline':
                case 'rerank_results':
                    return this.rerankInline(spec, {
                        rerankerName:
                            typeof input.rerankerName === 'string'
                                ? input.rerankerName
                                : typeof input.reranker === 'string'
                                  ? input.reranker
                                  : '',
                    });
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
        if (typeof minScore !== 'number' || !Number.isFinite(minScore)) {
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
