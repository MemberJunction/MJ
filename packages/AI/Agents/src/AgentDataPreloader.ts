/**
 * @fileoverview AgentDataPreloader handles preloading of data sources for AI agents.
 *
 * This module provides a singleton service that loads data from RunView or RunQuery
 * sources as configured in AIAgentDataSource metadata. The preloaded data is injected
 * into the agent's data parameter for use in Nunjucks templates without requiring
 * custom application code or action calls.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.109.0
 */

import { AIEngine } from '@memberjunction/aiengine';
import { LogError, LogStatusEx, IsVerboseLoggingEnabled, RunView, RunQuery, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { RunViewParams, RunQueryParams } from '@memberjunction/core';
import { MJAIAgentDataSourceEntity } from '@memberjunction/core-entities'; 
import _ from 'lodash';

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

/**
 * Singleton service for preloading agent data sources.
 *
 * This class handles loading data from RunView or RunQuery sources as configured
 * in AIAgentDataSource metadata. Supports three cache policies:
 * - None: No caching, data is loaded fresh every time
 * - PerRun: Data is cached for the duration of a single agent run
 * - PerAgent: Data is cached globally with a TTL, shared across all runs
 *
 * @class AgentDataPreloader
 * @example
 * ```typescript
 * const preloader = AgentDataPreloader.Instance;
 * const data = await preloader.PreloadAgentData(agentId, contextUser);
 * // data = { ALL_ENTITIES: [...], MODEL_LIST: [...] }
 * ```
 */
export class AgentDataPreloader {
    private static _instance: AgentDataPreloader | null = null;

    /**
     * Per-agent cache (global, TTL-based)
     */
    private _perAgentCache: Map<string, CacheEntry> = new Map();

    /**
     * Per-run cache (scoped to a single run ID)
     */
    private _perRunCache: Map<string, Map<string, unknown>> = new Map();

    /**
     * Private constructor for singleton pattern
     */
    private constructor() {
        // Private to enforce singleton
    }

    /**
     * Gets the singleton instance of AgentDataPreloader
     */
    public static get Instance(): AgentDataPreloader {
        if (!AgentDataPreloader._instance) {
            AgentDataPreloader._instance = new AgentDataPreloader();
        }
        return AgentDataPreloader._instance;
    }

    /**
     * Preloads all active data sources for an agent.
     *
     * This method loads all active AIAgentDataSource records for the specified agent,
     * executes them in order, and returns preloaded data organized by destination type.
     *
     * @param {string} agentId - The ID of the agent to preload data for
     * @param {UserInfo} contextUser - The user context for data access permissions
     * @param {string} [runId] - Optional run ID for PerRun cache scoping
     *
     * @returns {Promise<PreloadedDataResult>} Object with preloaded data separated by destination
     *
     * @example
     * ```typescript
     * const result = await AgentDataPreloader.Instance.PreloadAgentData(
     *   'agent-id-123',
     *   contextUser,
     *   'run-id-456'
     * );
     * // Returns: {
     * //   data: { ALL_ENTITIES: [...] },
     * //   context: { API_CONFIG: {...} },
     * //   payload: { customer: {...} }
     * // }
     * ```
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

            // Load data source definitions
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
     * Clears per-run cache for a specific run ID.
     * Should be called when an agent run completes.
     *
     * @param {string} runId - The run ID to clear cache for
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
     * Clears all per-agent cached data.
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

    /**
     * Loads AIAgentDataSource entities for a specific agent.
     *
     * @private
     */
    private async loadDataSourcesForAgent(
        agentId: string,
        contextUser: UserInfo
    ): Promise<MJAIAgentDataSourceEntity[]> {
        // Ensure AIEngine is configured
        await AIEngine.Instance.Config(false, contextUser);
        const data = AIEngine.Instance.AgentDataSources.filter(ads => UUIDsEqual(ads.AgentID, agentId));
        const sortedData = data.sort((a, b) => {
            if (a.ExecutionOrder === b.ExecutionOrder) {
                return a.Name.localeCompare(b.Name);
            }
            return (a.ExecutionOrder || 0) - (b.ExecutionOrder || 0);
        });

        return sortedData;
    }

    /**
     * Executes a single data source and returns the data.
     * Handles caching based on the source's CachePolicy.
     *
     * @private
     */
    private async executeDataSource(
        source: MJAIAgentDataSourceEntity,
        contextUser: UserInfo,
        runId?: string
    ): Promise<unknown> {
        // Check cache first
        const cachedData = this.getCachedData(source, runId);
        if (cachedData !== null) {
            LogStatusEx({
                message: `AgentDataPreloader: Using cached data for '${source.Name}'`,
                verboseOnly: true,
                isVerboseEnabled: IsVerboseLoggingEnabled
            });
            return cachedData;
        }

        // Load data based on source type
        let data: unknown;

        if (source.SourceType === 'RunView') {
            data = await this.executeRunView(source, contextUser);
        } else if (source.SourceType === 'RunQuery') {
            data = await this.executeRunQuery(source, contextUser);
        } else {
            throw new Error(`Unknown source type: ${source.SourceType}`);
        }

        // Cache the data if policy dictates
        this.cacheData(source, data, runId);

        return data;
    }

    /**
     * Executes a RunView data source.
     *
     * @private
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

        // Parse FieldsToRetrieve if provided
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
     * Executes a RunQuery data source.
     *
     * @private
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

        // Parse Parameters if provided
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
     * Gets cached data if available and not expired.
     *
     * @private
     * @returns Cached data or null if not cached/expired
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
                // Check if expired
                const now = new Date();
                const ageSeconds = (now.getTime() - entry.timestamp.getTime()) / 1000;

                if (ageSeconds < entry.timeoutSeconds) {
                    return entry.data;
                } else {
                    // Expired, remove from cache
                    this._perAgentCache.delete(cacheKey);
                }
            }
            return null;
        }

        return null;
    }

    /**
     * Caches data based on the source's cache policy.
     *
     * @private
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

    /**
     * Generates a cache key for per-agent caching.
     *
     * @private
     */
    private getPerAgentCacheKey(source: MJAIAgentDataSourceEntity): string {
        return `${source.AgentID}:${source.Name}`;
    }
}

