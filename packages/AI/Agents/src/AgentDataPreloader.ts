/**
 * @fileoverview AgentDataPreloader handles BOTH eager and lazy loading of
 * AIAgentDataSource records for AI agents.
 *
 * Eager mode (default) preloads sources at agent setup time and dumps the
 * results into prompt-template data. This is the legacy behaviour and works
 * unchanged for any source whose `LoadingMode` is `'Eager'` (the default).
 *
 * Lazy mode (opt in via `LoadingMode='Lazy'` on the AIAgentDataSource record)
 * exposes the source as a callable tool descriptor that the agent can invoke
 * on demand. Empirically reclaims ~95% of input tokens for catalog-heavy
 * agents that don't use every source on every turn.
 *
 * Both modes share source loading, RunView/RunQuery dispatch, and per-run
 * caching. They differ only in *when* the call happens and *how* the data is
 * surfaced to the LLM.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { AIEngine } from '@memberjunction/aiengine';
import {
    LogError,
    LogStatusEx,
    IsVerboseLoggingEnabled,
    RunView,
    RunQuery,
    UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual, BaseSingleton } from '@memberjunction/global';
import { RunViewParams, RunQueryParams } from '@memberjunction/core';
import { MJAIAgentDataSourceEntity } from '@memberjunction/core-entities';
import _ from 'lodash';

/**
 * Forward declaration of the `LoadingMode` column added by migration
 * V202605030200. CodeGen will replace the need for this once the typed
 * accessor is regenerated; until then this gives strongly-typed access
 * without falling back to `.Get()`-style dynamic lookups.
 */
type DataSourceWithLoadingMode = MJAIAgentDataSourceEntity & {
    LoadingMode?: LazyDataLoadingMode;
};

// ─────────────────── Eager preload result types ───────────────────

/**
 * Details about a data source that failed to load
 */
export interface FailedDataSource {
    /** Name of the data source that failed */
    name: string;
    /** Entity name if applicable (for RunView sources) */
    entityName?: string;
    /** Error message describing the failure */
    errorMessage: string;
}

/**
 * Result structure for preloaded data organized by destination
 */
export interface PreloadedDataResult {
    data: Record<string, unknown>;
    context: Record<string, unknown>;
    payload: Record<string, unknown>;
    /** Names of sources that loaded successfully */
    loadedSources: string[];
    /** Sources that failed to load, with error details */
    failedSources: FailedDataSource[];
}

/**
 * Cache entry for preloaded data
 */
interface CacheEntry {
    data: unknown;
    timestamp: Date;
    timeoutSeconds: number;
}

// ─────────────────── Lazy mode types ───────────────────

/**
 * Loading mode for an `AIAgentDataSource` at agent execution time.
 *
 * - `Eager` (default, preserves legacy behaviour) — preloaded by
 *   `PreloadAgentData` at run setup and dumped into prompt context.
 * - `Lazy` — NOT preloaded; instead exposed as a tool the agent can call
 *   when it needs the data. Saves prompt tokens dramatically when the agent
 *   does not actually use every source on every turn.
 * - `Hybrid` — preload a small summary, expose the full source as a tool.
 *   Reserved for future use; not implemented in v1.
 */
export type LazyDataLoadingMode = 'Eager' | 'Lazy' | 'Hybrid';

/**
 * Description of a tool synthesised from an `AIAgentDataSource`.
 *
 * Designed to be JSON-Schema-compatible so it can be handed directly to an
 * LLM provider's tool/function-calling API (Gemini, OpenAI, Anthropic), or
 * inlined as markdown alongside MJ Actions in the prompt.
 */
export interface LazyDataSourceToolDescriptor {
    /** Stable tool name. Derived from `AIAgentDataSource.Name` (sanitised). */
    name: string;

    /** Human-readable description shown to the LLM. */
    description: string;

    /** JSON-Schema parameters block. Always an object schema. */
    parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };

    /** Stable URI for caching this tool's underlying object. */
    uri: string;

    /**
     * The underlying data source this tool wraps. Held as a reference so the
     * runtime can dispatch back to RunView/RunQuery when invoked.
     */
    sourceRef: {
        dataSourceId: string;
        sourceType: 'RunView' | 'RunQuery';
        entityName: string | null;
        queryName: string | null;
    };
}

/**
 * Result of synthesising tools for one agent's lazy data sources.
 */
export interface LazyDataSourceToolset {
    /** The agent these tools are bound to. */
    agentId: string;

    /** One descriptor per active lazy source on the agent. */
    tools: LazyDataSourceToolDescriptor[];

    /**
     * Sources that are still configured as `Eager` and were thus NOT exposed
     * as tools. Returned for telemetry/diagnostics, not for execution.
     */
    skippedEagerSources: string[];
}

/**
 * Outcome of executing a lazy data-source tool call from the agent.
 */
export interface LazyDataSourceInvocationResult {
    /** The descriptor that was invoked. */
    descriptor: LazyDataSourceToolDescriptor;

    /** Arguments the agent supplied to the tool. */
    args: Record<string, unknown>;

    /** True iff the underlying RunView/RunQuery succeeded. */
    success: boolean;

    /** Successful result payload (the data the tool returns). */
    data?: unknown;

    /** Error message if `success === false`. */
    errorMessage?: string;

    /** Whether this invocation was served from the per-run cache. */
    cacheHit: boolean;

    /** Wall-clock duration of the invocation in milliseconds. */
    durationMs: number;
}

/**
 * Per-run state for a lazily-evaluated data context.
 *
 * Bound to a single agent run; tracks tool invocations and caches their
 * results for the duration of the run so repeat calls are free.
 */
export interface LazyDataContextState {
    /** Unique identifier of the agent run this context is scoped to. */
    runId: string;

    /** Cache keyed by URI + serialised args; value is the previous result data. */
    cache: Map<string, unknown>;

    /** Ordered log of every invocation made during this run. */
    invocations: LazyDataSourceInvocationResult[];
}

/**
 * Adapter contract: turns `MJAIAgentDataSourceEntity` records into one or
 * more `LazyDataSourceToolDescriptor`s.
 *
 * The default adapter handles RunView + RunQuery sources. Custom adapters
 * can extend the protocol to expose other data sources (REST APIs, vector
 * stores, etc.) as lazy tools — register via `RegisterLazyAdapter`.
 */
export interface LazyDataSourceAdapter {
    /**
     * Returns true if this adapter can handle the given source.
     */
    canHandle(source: MJAIAgentDataSourceEntity): boolean;

    /**
     * Synthesise tool descriptor(s) for one source. May return multiple tools
     * (e.g. a list-tool and a detail-tool) for richer access patterns.
     */
    synthesizeTools(source: MJAIAgentDataSourceEntity): LazyDataSourceToolDescriptor[];
}

/**
 * Sanitises a data-source name to a valid LLM-tool identifier
 * (lowercase, alphanumeric + underscore, max 64 chars).
 */
function lazyToolNameFor(source: MJAIAgentDataSourceEntity): string {
    const safe = source.Name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `query_${safe}`.slice(0, 64);
}

function lazyDescriptionFor(source: MJAIAgentDataSourceEntity): string {
    const head = source.Description?.trim();
    if (head) return head;
    if (source.SourceType === 'RunView' && source.EntityName) {
        return `Lazily query the '${source.EntityName}' entity. Returns rows matching the optional filter; use this when you need data from this entity instead of relying on preloaded context.`;
    }
    if (source.SourceType === 'RunQuery' && source.QueryName) {
        return `Lazily run the stored query '${source.QueryName}'. Use this when you need its results instead of relying on preloaded context.`;
    }
    return `Lazily fetch data source '${source.Name}'.`;
}

/**
 * Default adapter — handles `RunView` and `RunQuery` source types. Always
 * registered; custom adapters take priority since they're inserted ahead.
 */
export class RunViewRunQueryLazyAdapter implements LazyDataSourceAdapter {
    public canHandle(source: MJAIAgentDataSourceEntity): boolean {
        return source.SourceType === 'RunView' || source.SourceType === 'RunQuery';
    }

    public synthesizeTools(source: MJAIAgentDataSourceEntity): LazyDataSourceToolDescriptor[] {
        const name = lazyToolNameFor(source);
        const description = lazyDescriptionFor(source);
        const uri = `lazyds://${source.AgentID}/${source.ID}`;

        const baseProperties: Record<string, unknown> = {
            extraFilter: {
                type: 'string',
                description: 'Optional additional WHERE-clause filter to narrow results. Combined with the source\'s configured filter via AND.',
            },
            maxRows: {
                type: 'integer',
                description: 'Optional override for max rows returned. If omitted, uses the source\'s configured MaxRows.',
                minimum: 1,
                maximum: 5000,
            },
        };

        if (source.SourceType === 'RunQuery') {
            baseProperties.parameters = {
                type: 'object',
                description: 'Parameter values to pass to the stored query.',
                additionalProperties: true,
            };
        }

        return [
            {
                name,
                description,
                parameters: {
                    type: 'object',
                    properties: baseProperties,
                },
                uri,
                sourceRef: {
                    dataSourceId: source.ID,
                    sourceType: source.SourceType as 'RunView' | 'RunQuery',
                    entityName: source.EntityName ?? null,
                    queryName: source.QueryName ?? null,
                },
            },
        ];
    }
}

// ─────────────────── Preloader singleton ───────────────────

/**
 * Singleton service for loading AI agent data sources — both eager preload
 * and lazy on-demand tool dispatch.
 *
 * **Eager mode** (legacy default): call `PreloadAgentData(agentId, contextUser, runId)`
 * once at run setup. All sources whose `LoadingMode='Eager'` are executed
 * and their results returned in a `PreloadedDataResult`. Three cache
 * policies (None / PerRun / PerAgent) control reuse.
 *
 * **Lazy mode** (opt-in via `LoadingMode='Lazy'`): call
 * `SynthesizeLazyToolset(agentId, contextUser)` to get tool descriptors
 * the agent can call. Dispatch each invocation through `InvokeLazyTool`,
 * and call `ClearLazyRunCache(runId)` when the run completes.
 *
 * @class AgentDataPreloader
 */
export class AgentDataPreloader extends BaseSingleton<AgentDataPreloader> {
    /**
     * Per-agent cache (global, TTL-based) for eager preload data.
     */
    private _perAgentCache: Map<string, CacheEntry> = new Map();

    /**
     * Per-run cache for eager preload data (scoped to a single run ID).
     */
    private _perRunCache: Map<string, Map<string, unknown>> = new Map();

    /**
     * Per-run state for lazy tool invocations (separate from eager cache so
     * the two modes can coexist without key collisions).
     */
    private _lazyPerRunStates: Map<string, LazyDataContextState> = new Map();

    /**
     * Adapters that turn data sources into lazy tool descriptors. The default
     * adapter (RunView / RunQuery) is always present; user adapters take
     * priority because they're inserted ahead of the default.
     */
    private _lazyAdapters: LazyDataSourceAdapter[] = [new RunViewRunQueryLazyAdapter()];

    public constructor() {
        super();
    }

    /**
     * Gets the singleton instance of AgentDataPreloader
     */
    public static get Instance(): AgentDataPreloader {
        return AgentDataPreloader.getInstance<AgentDataPreloader>();
    }

    // ─────────────────── Eager preload API ───────────────────

    /**
     * Preloads all active *eager* data sources for an agent.
     *
     * Sources opted into `LoadingMode='Lazy'` are skipped here and surfaced
     * via `SynthesizeLazyToolset` instead.
     *
     * @param {string} agentId - The ID of the agent to preload data for
     * @param {UserInfo} contextUser - The user context for data access permissions
     * @param {string} [runId] - Optional run ID for PerRun cache scoping
     *
     * @returns {Promise<PreloadedDataResult>} Object with preloaded data separated by destination
     */
    public async PreloadAgentData(
        agentId: string,
        contextUser: UserInfo,
        runId?: string
    ): Promise<PreloadedDataResult> {
        try {
            LogStatusEx({
                message: `AgentDataPreloader: Loading data sources for agent ${agentId}`,
                verboseOnly: true,
                isVerboseEnabled: IsVerboseLoggingEnabled
            });

            // Load data source definitions (eager only)
            const dataSources = await this.loadDataSourcesForAgent(agentId, contextUser);

            if (dataSources.length === 0) {
                LogStatusEx({
                    message: `AgentDataPreloader: No data sources found for agent ${agentId}`,
                    verboseOnly: true,
                    isVerboseEnabled: IsVerboseLoggingEnabled
                });
                return { data: {}, context: {}, payload: {}, loadedSources: [], failedSources: [] };
            }

            const result: PreloadedDataResult = {
                data: {},
                context: {},
                payload: {},
                loadedSources: [],
                failedSources: []
            };

            // Execute data sources in order
            for (const source of dataSources) {
                try {
                    const sourceData = await this.executeDataSource(source, contextUser, runId);

                    // Determine the path (use DestinationPath if provided, otherwise Name)
                    const path = source.DestinationPath || source.Name;

                    // Set data in the appropriate destination
                    switch (source.DestinationType) {
                        case 'Data':
                            _.set(result.data, path, sourceData);
                            break;
                        case 'Context':
                            _.set(result.context, path, sourceData);
                            break;
                        case 'Payload':
                            _.set(result.payload, path, sourceData);
                            break;
                        default:
                            result.failedSources.push({
                                name: source.Name,
                                entityName: source.EntityName || undefined,
                                errorMessage: `Unknown destination type '${source.DestinationType}'`
                            });
                            LogError(`Unknown destination type '${source.DestinationType}' for data source '${source.Name}'`);
                            continue;
                    }

                    result.loadedSources.push(source.Name);
                    LogStatusEx({
                        message: `AgentDataPreloader: Loaded '${source.Name}' → ${source.DestinationType}${path !== source.Name ? `.${path}` : ''} for agent ${agentId}`,
                        verboseOnly: true,
                        isVerboseEnabled: IsVerboseLoggingEnabled
                    });
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    result.failedSources.push({
                        name: source.Name,
                        entityName: source.EntityName || undefined,
                        errorMessage
                    });
                    LogError(`Failed to preload data source '${source.Name}' for agent ${agentId}: ${errorMessage}`, undefined, error);
                    // Continue loading other sources even if one fails
                }
            }

            return result;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            LogError(`Failed to preload agent data for ${agentId}: ${errorMessage}`, undefined, error);
            // Return empty objects instead of throwing - agent can still run without preloaded data
            return { data: {}, context: {}, payload: {}, loadedSources: [], failedSources: [{ name: '*', errorMessage }] };
        }
    }

    /**
     * Clears per-run cache for a specific run ID (eager preload cache).
     * Should be called when an agent run completes.
     */
    public clearRunCache(runId: string): void {
        this._perRunCache.delete(runId);
        LogStatusEx({
            message: `AgentDataPreloader: Cleared per-run cache for run ${runId}`,
            verboseOnly: true,
            isVerboseEnabled: IsVerboseLoggingEnabled
        });
    }

    /**
     * Clears all per-agent cached data (eager preload).
     * Can be called to force refresh of global cached data.
     */
    public clearAgentCache(): void {
        this._perAgentCache.clear();
        LogStatusEx({
            message: `AgentDataPreloader: Cleared all per-agent cache`,
            verboseOnly: true,
            isVerboseEnabled: IsVerboseLoggingEnabled
        });
    }

    // ─────────────────── Lazy mode API ───────────────────

    /**
     * Register an additional lazy adapter. Inserted ahead of the default
     * RunView/RunQuery adapter so user adapters take priority.
     */
    public RegisterLazyAdapter(adapter: LazyDataSourceAdapter): void {
        this._lazyAdapters.unshift(adapter);
    }

    /**
     * Synthesise tool descriptors for an agent's *lazy* data sources.
     *
     * Only sources whose `Status === 'Active'` AND whose `LoadingMode === 'Lazy'`
     * are exposed. Eager sources are listed in `skippedEagerSources` for
     * diagnostics; the agent runtime should still preload those via
     * `PreloadAgentData` as before.
     *
     * NOTE: `LoadingMode` is read defensively so this works before CodeGen
     * regenerates the typed accessor — anything other than 'Lazy' is treated
     * as eager (legacy behaviour preserved).
     */
    public async SynthesizeLazyToolset(
        agentId: string,
        contextUser: UserInfo,
    ): Promise<LazyDataSourceToolset> {
        await AIEngine.Instance.Config(false, contextUser);
        const all = AIEngine.Instance.AgentDataSources.filter(
            ads => UUIDsEqual(ads.AgentID, agentId) && ads.Status === 'Active',
        );
        const sorted = [...all].sort((a, b) => {
            const ord = (a.ExecutionOrder ?? 0) - (b.ExecutionOrder ?? 0);
            return ord !== 0 ? ord : a.Name.localeCompare(b.Name);
        });

        const tools: LazyDataSourceToolDescriptor[] = [];
        const skipped: string[] = [];

        for (const source of sorted) {
            if (this.readLoadingMode(source) !== 'Lazy') {
                skipped.push(source.Name);
                continue;
            }
            const adapter = this._lazyAdapters.find(a => a.canHandle(source));
            if (!adapter) {
                LogError(
                    `AgentDataPreloader: no lazy adapter registered for source '${source.Name}' (type ${source.SourceType})`,
                );
                continue;
            }
            tools.push(...adapter.synthesizeTools(source));
        }

        LogStatusEx({
            message: `AgentDataPreloader: synthesised ${tools.length} lazy tool(s) for agent ${agentId} (${skipped.length} eager source(s) skipped)`,
            verboseOnly: true,
            isVerboseEnabled: IsVerboseLoggingEnabled,
        });

        return { agentId, tools, skippedEagerSources: skipped };
    }

    /**
     * Invoke a lazy tool descriptor. Resolves the underlying source, runs
     * RunView/RunQuery (or future adapter dispatch), caches the result for
     * the rest of the run.
     */
    public async InvokeLazyTool(
        descriptor: LazyDataSourceToolDescriptor,
        args: Record<string, unknown>,
        contextUser: UserInfo,
        runId: string,
    ): Promise<LazyDataSourceInvocationResult> {
        const cacheKey = this.lazyCacheKeyFor(descriptor, args);
        const state = this.lazyStateFor(runId);
        const cached = state.cache.get(cacheKey);
        if (cached !== undefined) {
            const cachedResult: LazyDataSourceInvocationResult = {
                descriptor,
                args,
                success: true,
                data: cached,
                cacheHit: true,
                durationMs: 0,
            };
            state.invocations.push(cachedResult);
            return cachedResult;
        }

        const t0 = Date.now();
        try {
            await AIEngine.Instance.Config(false, contextUser);
            const source = AIEngine.Instance.AgentDataSources.find(
                ds => UUIDsEqual(ds.ID, descriptor.sourceRef.dataSourceId),
            );
            if (!source) {
                throw new Error(
                    `AgentDataPreloader.InvokeLazyTool: source '${descriptor.sourceRef.dataSourceId}' not found in AIEngine cache`,
                );
            }
            const data = await this.dispatchLazyToAdapter(source, args, contextUser);
            state.cache.set(cacheKey, data);
            const result: LazyDataSourceInvocationResult = {
                descriptor,
                args,
                success: true,
                data,
                cacheHit: false,
                durationMs: Date.now() - t0,
            };
            state.invocations.push(result);
            return result;
        } catch (err) {
            const result: LazyDataSourceInvocationResult = {
                descriptor,
                args,
                success: false,
                errorMessage: err instanceof Error ? err.message : String(err),
                cacheHit: false,
                durationMs: Date.now() - t0,
            };
            state.invocations.push(result);
            LogError(
                `AgentDataPreloader.InvokeLazyTool failed for '${descriptor.name}': ${result.errorMessage}`,
                undefined,
                err,
            );
            return result;
        }
    }

    /**
     * Inspect the current per-run lazy state. Useful for telemetry + tests.
     */
    public GetLazyRunState(runId: string): LazyDataContextState | undefined {
        return this._lazyPerRunStates.get(runId);
    }

    /**
     * Drop the lazy per-run cache + invocation log when an agent run completes.
     */
    public ClearLazyRunCache(runId: string): void {
        this._lazyPerRunStates.delete(runId);
    }

    /**
     * Drop all lazy per-run state (used by tests).
     */
    public ClearAllLazyState(): void {
        this._lazyPerRunStates.clear();
    }

    // ─────────────────── Internal helpers ───────────────────

    /**
     * Loads AIAgentDataSource entities for a specific agent — *eager mode only*.
     *
     * Sources opted into `LoadingMode='Lazy'` are excluded; they're handled
     * via `SynthesizeLazyToolset` / `InvokeLazyTool`.
     */
    private async loadDataSourcesForAgent(
        agentId: string,
        contextUser: UserInfo
    ): Promise<MJAIAgentDataSourceEntity[]> {
        await AIEngine.Instance.Config(false, contextUser);
        const data = AIEngine.Instance.AgentDataSources.filter(
            ads => UUIDsEqual(ads.AgentID, agentId)
                && ads.Status === 'Active'
                && this.readLoadingMode(ads) !== 'Lazy'
        );
        const sortedData = data.sort((a, b) => {
            if (a.ExecutionOrder === b.ExecutionOrder) {
                return a.Name.localeCompare(b.Name);
            }
            return (a.ExecutionOrder || 0) - (b.ExecutionOrder || 0);
        });

        return sortedData;
    }

    /**
     * Read the `LoadingMode` column off the source entity. The forward-declared
     * `DataSourceWithLoadingMode` shape lets us read this safely before CodeGen
     * regenerates the typed accessor for the new column. Anything other than
     * `'Lazy'` or `'Hybrid'` falls back to `'Eager'` (legacy behaviour).
     */
    private readLoadingMode(source: MJAIAgentDataSourceEntity): LazyDataLoadingMode {
        const mode = (source as DataSourceWithLoadingMode).LoadingMode;
        return mode === 'Lazy' || mode === 'Hybrid' ? mode : 'Eager';
    }

    /**
     * Executes a single data source and returns the data.
     * Handles caching based on the source's CachePolicy. (Eager path.)
     */
    private async executeDataSource(
        source: MJAIAgentDataSourceEntity,
        contextUser: UserInfo,
        runId?: string
    ): Promise<unknown> {
        const cachedData = this.getCachedData(source, runId);
        if (cachedData !== null) {
            LogStatusEx({
                message: `AgentDataPreloader: Using cached data for '${source.Name}'`,
                verboseOnly: true,
                isVerboseEnabled: IsVerboseLoggingEnabled
            });
            return cachedData;
        }

        let data: unknown;

        if (source.SourceType === 'RunView') {
            data = await this.executeRunView(source, contextUser);
        } else if (source.SourceType === 'RunQuery') {
            data = await this.executeRunQuery(source, contextUser);
        } else {
            throw new Error(`Unknown source type: ${source.SourceType}`);
        }

        this.cacheData(source, data, runId);

        return data;
    }

    /**
     * Executes a RunView data source (eager path — uses configured filter only).
     */
    private async executeRunView(
        source: MJAIAgentDataSourceEntity,
        contextUser: UserInfo
    ): Promise<unknown> {
        if (!source.EntityName) {
            throw new Error(`RunView data source '${source.Name}' missing EntityName`);
        }

        const params: RunViewParams = {
            EntityName: source.EntityName,
            ExtraFilter: source.ExtraFilter || undefined,
            OrderBy: source.OrderBy || undefined,
            MaxRows: source.MaxRows || undefined,
            ResultType: (source.ResultType as 'simple' | 'entity_object') || 'simple'
        };

        if (source.FieldsToRetrieve) {
            try {
                params.Fields = JSON.parse(source.FieldsToRetrieve);
            } catch (error) {
                LogError(`Failed to parse FieldsToRetrieve JSON for data source '${source.Name}': ${error.message}`);
            }
        }

        const rv = new RunView();
        const result = await rv.RunView(params, contextUser);

        if (!result.Success) {
            throw new Error(`RunView failed: ${result.ErrorMessage}`);
        }

        return result.Results || [];
    }

    /**
     * Executes a RunQuery data source (eager path — uses configured params only).
     */
    private async executeRunQuery(
        source: MJAIAgentDataSourceEntity,
        contextUser: UserInfo
    ): Promise<unknown> {
        if (!source.QueryName) {
            throw new Error(`RunQuery data source '${source.Name}' missing QueryName`);
        }

        const params: RunQueryParams = {
            QueryName: source.QueryName,
            CategoryPath: source.CategoryPath || undefined,
            MaxRows: source.MaxRows || undefined
        };

        if (source.Parameters) {
            try {
                params.Parameters = JSON.parse(source.Parameters);
            } catch (error) {
                LogError(`Failed to parse Parameters JSON for data source '${source.Name}': ${error.message}`);
            }
        }

        const rq = new RunQuery();
        const result = await rq.RunQuery(params, contextUser);

        if (!result.Success) {
            throw new Error(`RunQuery failed: ${result.ErrorMessage}`);
        }

        return result.Results || [];
    }

    /**
     * Lazy dispatch: combines caller-supplied args (extraFilter / maxRows /
     * parameters) with the source's configured defaults.
     */
    private async dispatchLazyToAdapter(
        source: MJAIAgentDataSourceEntity,
        args: Record<string, unknown>,
        contextUser: UserInfo,
    ): Promise<unknown> {
        if (source.SourceType === 'RunView') {
            return this.executeLazyRunView(source, args, contextUser);
        }
        if (source.SourceType === 'RunQuery') {
            return this.executeLazyRunQuery(source, args, contextUser);
        }
        throw new Error(`Unsupported source type for lazy invocation: ${source.SourceType}`);
    }

    private async executeLazyRunView(
        source: MJAIAgentDataSourceEntity,
        args: Record<string, unknown>,
        contextUser: UserInfo,
    ): Promise<unknown> {
        if (!source.EntityName) {
            throw new Error(`RunView source '${source.Name}' is missing EntityName`);
        }
        const callerExtraFilter = typeof args.extraFilter === 'string' ? args.extraFilter : undefined;
        const callerMaxRows = typeof args.maxRows === 'number' ? args.maxRows : undefined;

        const combinedExtraFilter = this.combineFilters(source.ExtraFilter, callerExtraFilter);

        const params: RunViewParams = {
            EntityName: source.EntityName,
            ExtraFilter: combinedExtraFilter,
            OrderBy: source.OrderBy ?? undefined,
            MaxRows: callerMaxRows ?? source.MaxRows ?? undefined,
            Fields: source.FieldsToRetrieve ? this.parseFieldList(source.FieldsToRetrieve) : undefined,
            ResultType: (source.ResultType as RunViewParams['ResultType']) ?? 'simple',
        };

        const rv = new RunView();
        const result = await rv.RunView(params, contextUser);
        if (!result.Success) {
            throw new Error(result.ErrorMessage || 'RunView returned Success=false');
        }
        return result.Results;
    }

    private async executeLazyRunQuery(
        source: MJAIAgentDataSourceEntity,
        args: Record<string, unknown>,
        contextUser: UserInfo,
    ): Promise<unknown> {
        if (!source.QueryName) {
            throw new Error(`RunQuery source '${source.Name}' is missing QueryName`);
        }
        const callerParams =
            args.parameters && typeof args.parameters === 'object'
                ? (args.parameters as Record<string, unknown>)
                : undefined;
        const baseParams = source.Parameters ? this.parseJsonParams(source.Parameters) : undefined;
        const merged: Record<string, unknown> | undefined =
            baseParams || callerParams ? { ...(baseParams ?? {}), ...(callerParams ?? {}) } : undefined;

        const params: RunQueryParams = {
            QueryName: source.QueryName,
            CategoryPath: source.CategoryPath ?? undefined,
            Parameters: merged,
            MaxRows: typeof args.maxRows === 'number' ? args.maxRows : (source.MaxRows ?? undefined),
        };

        const rq = new RunQuery();
        const result = await rq.RunQuery(params, contextUser);
        if (!result.Success) {
            throw new Error(result.ErrorMessage || 'RunQuery returned Success=false');
        }
        return result.Results;
    }

    private combineFilters(base: string | null | undefined, extra: string | undefined): string | undefined {
        const a = base?.trim();
        const b = extra?.trim();
        if (!a && !b) return undefined;
        if (!a) return b;
        if (!b) return a;
        return `(${a}) AND (${b})`;
    }

    private parseFieldList(raw: string): string[] {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[')) {
            try {
                const parsed: unknown = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map(v => String(v));
            } catch {
                // fall through to comma split
            }
        }
        return trimmed
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    private parseJsonParams(raw: string): Record<string, unknown> | undefined {
        try {
            const parsed: unknown = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    private lazyCacheKeyFor(descriptor: LazyDataSourceToolDescriptor, args: Record<string, unknown>): string {
        const sortedArgs = Object.keys(args)
            .sort()
            .reduce<Record<string, unknown>>((acc, k) => {
                acc[k] = args[k];
                return acc;
            }, {});
        return `${descriptor.uri}::${JSON.stringify(sortedArgs)}`;
    }

    private lazyStateFor(runId: string): LazyDataContextState {
        let state = this._lazyPerRunStates.get(runId);
        if (!state) {
            state = { runId, cache: new Map(), invocations: [] };
            this._lazyPerRunStates.set(runId, state);
        }
        return state;
    }

    /**
     * Gets cached data if available and not expired (eager path).
     */
    private getCachedData(
        source: MJAIAgentDataSourceEntity,
        runId?: string
    ): unknown | null {
        if (source.CachePolicy === 'None') {
            return null;
        }

        if (source.CachePolicy === 'PerRun' && runId) {
            const runCache = this._perRunCache.get(runId);
            if (runCache && runCache.has(source.Name)) {
                return runCache.get(source.Name);
            }
            return null;
        }

        if (source.CachePolicy === 'PerAgent') {
            const cacheKey = this.getPerAgentCacheKey(source);
            const entry = this._perAgentCache.get(cacheKey);

            if (entry) {
                const now = new Date();
                const ageSeconds = (now.getTime() - entry.timestamp.getTime()) / 1000;

                if (ageSeconds < entry.timeoutSeconds) {
                    return entry.data;
                } else {
                    this._perAgentCache.delete(cacheKey);
                }
            }
            return null;
        }

        return null;
    }

    /**
     * Caches data based on the source's cache policy (eager path).
     */
    private cacheData(
        source: MJAIAgentDataSourceEntity,
        data: unknown,
        runId?: string
    ): void {
        if (source.CachePolicy === 'None') {
            return;
        }

        if (source.CachePolicy === 'PerRun' && runId) {
            let runCache = this._perRunCache.get(runId);
            if (!runCache) {
                runCache = new Map();
                this._perRunCache.set(runId, runCache);
            }
            runCache.set(source.Name, data);
            return;
        }

        if (source.CachePolicy === 'PerAgent') {
            if (!source.CacheTimeoutSeconds || source.CacheTimeoutSeconds <= 0) {
                LogError(`PerAgent cache policy requires CacheTimeoutSeconds > 0 for data source '${source.Name}'`);
                return;
            }

            const cacheKey = this.getPerAgentCacheKey(source);
            const entry: CacheEntry = {
                data,
                timestamp: new Date(),
                timeoutSeconds: source.CacheTimeoutSeconds
            };
            this._perAgentCache.set(cacheKey, entry);
        }
    }

    private getPerAgentCacheKey(source: MJAIAgentDataSourceEntity): string {
        return `${source.AgentID}:${source.Name}`;
    }
}
