import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, Metadata, RunView, UserInfo } from "@memberjunction/core";
import { NormalizeUUID, UUIDsEqual } from "@memberjunction/global";
import { BehaviorSubject, Observable } from "rxjs";
import {
    MJConversationEntity,
    MJConversationDetailEntity,
    MJAIAgentRunEntity
} from "../generated/entity_subclasses";
import { ArtifactMetadataEngine } from "./artifacts";

/**
 * Cached data for a single conversation's details (messages) and peripheral data.
 * Stored by conversation ID in the engine's detail cache.
 */
export interface ConversationDetailCache {
    /** The conversation detail (message) entities */
    Details: MJConversationDetailEntity[];
    /** Agent runs keyed by conversation detail ID */
    AgentRunsByDetailId: Map<string, MJAIAgentRunEntity>;
    /** Timestamp of when this cache entry was populated */
    LoadedAt: Date;
}

/**
 * ConversationEngine provides centralized, reactive caching for conversations,
 * conversation details (messages), and peripheral data (agent runs, artifacts).
 *
 * This engine is the single source of truth for conversation data across all UI
 * consumers (chat area, sidebar, overlay, etc.). It replaces per-component caching
 * that previously lived in conversation-chat-area component,
 * and other scattered locations.
 *
 * Usage:
 * ```typescript
 * // Initialize (call once at app startup after metadata is loaded)
 * await ConversationEngine.Instance.Config(false, contextUser);
 *
 * // Load conversations for the current user
 * await ConversationEngine.Instance.LoadConversations('env-id', contextUser);
 *
 * // Subscribe to conversation list changes
 * ConversationEngine.Instance.Conversations$.subscribe(conversations => {
 *     // React to changes
 * });
 *
 * // Load details for a specific conversation
 * const details = await ConversationEngine.Instance.LoadConversationDetails('conv-id', contextUser);
 *
 * // Get cached details (instant, no DB round-trip)
 * const cached = ConversationEngine.Instance.GetCachedDetails('conv-id');
 * ```
 */
export class ConversationEngine extends BaseEngine<ConversationEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only
     * one instance of it in the application. Do not directly create new instances of it,
     * always use this method to get the instance.
     */
    public static get Instance(): ConversationEngine {
        return super.getInstance<ConversationEngine>();
    }

    // ========================================================================
    // REACTIVE STATE
    // ========================================================================

    private _conversations$ = new BehaviorSubject<MJConversationEntity[]>([]);

    /**
     * Observable stream of the current user's conversation list.
     * Emits whenever conversations are loaded, created, deleted, archived, or pinned.
     */
    public get Conversations$(): Observable<MJConversationEntity[]> {
        return this._conversations$.asObservable();
    }

    /**
     * Current snapshot of conversations (non-reactive).
     */
    public get Conversations(): MJConversationEntity[] {
        return this._conversations$.value;
    }

    // ========================================================================
    // INTERNAL STATE
    // ========================================================================

    /** Detail cache keyed by normalized conversation ID */
    private _detailCache = new Map<string, ConversationDetailCache>();

    /** Track the environment ID used for the last load */
    private _lastEnvironmentId: string | null = null;

    // ========================================================================
    // ENGINE CONFIG (BaseEngine pattern)
    // ========================================================================

    /**
     * Configures the engine. Unlike other engines that bulk-load entity tables via BaseEngine.Load(),
     * ConversationEngine manages its own caching because conversations are user-scoped and filtered
     * by environment, which doesn't fit the standard "load all rows" pattern.
     *
     * Call this once at startup to initialize the engine. Conversation data is loaded
     * separately via LoadConversations().
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        // Ensure ArtifactMetadataEngine is loaded — conversation details reference artifacts
        // and we need artifact types available before processing. Passing false means
        // this is a no-op if it's already loaded.
        await ArtifactMetadataEngine.Instance.Config(forceRefresh, contextUser, provider);

        // We don't use BaseEngine.Load() because conversations are user-scoped.
        // Mark the engine as "configured" so consumers can check .Loaded.
        // We call Load with an empty config array just to set the Loaded flag and wire up
        // the BaseEngine infrastructure (entity event listeners, etc.)
        const configs: Partial<BaseEnginePropertyConfig>[] = [];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    // ========================================================================
    // CONVERSATION LIST OPERATIONS
    // ========================================================================

    /**
     * Loads conversations from the database for the given user and environment.
     * Results are cached and emitted via Conversations$.
     *
     * @param environmentId - The environment to filter conversations by
     * @param contextUser - The current user context
     * @param forceRefresh - If true, reloads even if data is already cached
     */
    public async LoadConversations(environmentId: string, contextUser: UserInfo, forceRefresh: boolean = false): Promise<void> {
        // Skip if already loaded for this environment (unless forcing)
        if (!forceRefresh && this._lastEnvironmentId === environmentId && this._conversations$.value.length > 0) {
            return;
        }

        this._lastEnvironmentId = environmentId;

        const rv = new RunView();
        const filter = `EnvironmentID='${environmentId}' AND UserID='${contextUser.ID}' AND (IsArchived IS NULL OR IsArchived=0)`;

        const result = await rv.RunView<MJConversationEntity>(
            {
                EntityName: 'MJ: Conversations',
                ExtraFilter: filter,
                OrderBy: 'IsPinned DESC, __mj_UpdatedAt DESC',
                MaxRows: 1000,
                ResultType: 'entity_object'
            },
            contextUser
        );

        if (result.Success) {
            this._conversations$.next(result.Results || []);
        } else {
            console.error('[ConversationEngine] Failed to load conversations:', result.ErrorMessage);
            this._conversations$.next([]);
        }
    }

    /**
     * Creates a new conversation, saves it to the database, and adds it to the cached list.
     *
     * @param name - Display name for the conversation
     * @param environmentId - The environment ID
     * @param contextUser - The current user context
     * @param description - Optional description
     * @param projectId - Optional project ID
     * @returns The newly created conversation entity
     * @throws Error if save fails
     */
    public async CreateConversation(
        name: string,
        environmentId: string,
        contextUser: UserInfo,
        description?: string,
        projectId?: string
    ): Promise<MJConversationEntity> {
        const md = new Metadata();
        const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', contextUser);

        conversation.Name = name;
        conversation.EnvironmentID = environmentId;
        conversation.UserID = contextUser.ID;
        if (description) conversation.Description = description;
        if (projectId) conversation.ProjectID = projectId;

        const saved = await conversation.Save();
        if (!saved) {
            throw new Error(conversation.LatestResult?.Message || 'Failed to create conversation');
        }

        // Prepend to the list and emit
        const updated = [conversation, ...this._conversations$.value];
        this._conversations$.next(updated);
        return conversation;
    }

    /**
     * Deletes a conversation from the database and removes it from the cached list.
     *
     * @param id - The conversation ID to delete
     * @param contextUser - The current user context
     * @returns true if successful
     * @throws Error if conversation not found or delete fails
     */
    public async DeleteConversation(id: string, contextUser: UserInfo): Promise<boolean> {
        const md = new Metadata();
        const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', contextUser);

        const loaded = await conversation.Load(id);
        if (!loaded) {
            throw new Error('Conversation not found');
        }

        const deleted = await conversation.Delete();
        if (!deleted) {
            throw new Error(conversation.LatestResult?.Message || 'Failed to delete conversation');
        }

        // Remove from cached list and clear detail cache
        this.removeFromList(id);
        this.removeDetailCache(id);
        return true;
    }

    /**
     * Archives a conversation (sets IsArchived = true) and removes it from the active list.
     *
     * @param id - The conversation ID to archive
     * @param contextUser - The current user context
     * @returns true if successful
     */
    public async ArchiveConversation(id: string, contextUser: UserInfo): Promise<boolean> {
        const result = await this.saveConversationField(id, { IsArchived: true }, contextUser);
        if (result) {
            // Archived conversations disappear from the active list
            this.removeFromList(id);
            this.removeDetailCache(id);
        }
        return result;
    }

    /**
     * Toggles or sets the pinned status of a conversation.
     *
     * @param id - The conversation ID
     * @param isPinned - Whether the conversation should be pinned
     * @param contextUser - The current user context
     * @returns true if successful
     */
    public async PinConversation(id: string, isPinned: boolean, contextUser: UserInfo): Promise<boolean> {
        const result = await this.saveConversationField(id, { IsPinned: isPinned }, contextUser);
        if (result) {
            // Update the in-memory entity and re-emit
            const conversation = this.GetConversation(id);
            if (conversation) {
                conversation.IsPinned = isPinned;
                // Re-sort: pinned first, then by updated date
                const sorted = this.sortConversations(this._conversations$.value);
                this._conversations$.next(sorted);
            }
        }
        return result;
    }

    /**
     * Finds a conversation by ID in the cached list.
     *
     * @param id - The conversation ID to find
     * @returns The conversation entity, or undefined if not in cache
     */
    public GetConversation(id: string): MJConversationEntity | undefined {
        return this._conversations$.value.find(c => UUIDsEqual(c.ID, id));
    }

    /**
     * Saves partial updates to a conversation (Name, Description, or any writable field).
     * Loads the entity from DB, applies updates, saves, and updates the in-memory list.
     *
     * @param id - The conversation ID to update
     * @param updates - Partial fields to update
     * @param contextUser - The current user context
     * @returns true if saved successfully
     * @throws Error if conversation not found or save fails
     */
    public async SaveConversation(
        id: string,
        updates: Partial<MJConversationEntity>,
        contextUser: UserInfo
    ): Promise<boolean> {
        const md = new Metadata();
        const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', contextUser);

        const loaded = await conversation.Load(id);
        if (!loaded) {
            throw new Error('Conversation not found');
        }

        Object.assign(conversation, updates);
        const saved = await conversation.Save();
        if (!saved) {
            throw new Error(conversation.LatestResult?.Message || 'Failed to update conversation');
        }

        // Update the in-memory entity in the cached list
        const cached = this.GetConversation(id);
        if (cached) {
            Object.assign(cached, updates);
            this._conversations$.next([...this._conversations$.value]);
        }
        return true;
    }

    /**
     * Deletes multiple conversations in a batch operation with per-item error tracking.
     *
     * @param ids - Array of conversation IDs to delete
     * @param contextUser - The current user context
     * @returns Object with successful and failed deletions
     */
    public async DeleteMultipleConversations(
        ids: string[],
        contextUser: UserInfo
    ): Promise<{ Successful: string[]; Failed: Array<{ ID: string; Name: string; Error: string }> }> {
        const successful: string[] = [];
        const failed: Array<{ ID: string; Name: string; Error: string }> = [];

        for (const id of ids) {
            try {
                const conversation = this.GetConversation(id);
                const name = conversation?.Name || 'Unknown';

                const deleted = await this.DeleteConversation(id, contextUser);
                if (deleted) {
                    successful.push(id);
                } else {
                    failed.push({ ID: id, Name: name, Error: 'Delete returned false' });
                }
            } catch (error) {
                const conversation = this.GetConversation(id);
                failed.push({
                    ID: id,
                    Name: conversation?.Name || 'Unknown',
                    Error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        return { Successful: successful, Failed: failed };
    }

    // ========================================================================
    // CONVERSATION DETAILS (Messages)
    // ========================================================================

    /**
     * Loads conversation details (messages) for a specific conversation.
     * Results are cached for instant retrieval on subsequent calls.
     *
     * @param conversationId - The conversation to load details for
     * @param contextUser - The current user context
     * @param forceRefresh - If true, reloads even if cached
     * @returns Array of conversation detail entities
     */
    public async LoadConversationDetails(
        conversationId: string,
        contextUser: UserInfo,
        forceRefresh: boolean = false
    ): Promise<MJConversationDetailEntity[]> {
        const key = NormalizeUUID(conversationId);

        // Return cached if available and not forcing
        if (!forceRefresh) {
            const cached = this._detailCache.get(key);
            if (cached) {
                return cached.Details;
            }
        }

        const rv = new RunView();
        const result = await rv.RunView<MJConversationDetailEntity>(
            {
                EntityName: 'MJ: Conversation Details',
                ExtraFilter: `ConversationID='${conversationId}'`,
                OrderBy: '__mj_CreatedAt ASC',
                ResultType: 'entity_object'
            },
            contextUser
        );

        if (!result.Success) {
            console.error('[ConversationEngine] Failed to load conversation details:', result.ErrorMessage);
            return [];
        }

        const details = result.Results || [];

        // Load agent runs in parallel
        const agentRuns = await this.loadAgentRunsForConversation(conversationId, contextUser);

        // Build and store the cache entry
        const cacheEntry: ConversationDetailCache = {
            Details: details,
            AgentRunsByDetailId: agentRuns,
            LoadedAt: new Date()
        };
        this._detailCache.set(key, cacheEntry);

        return details;
    }

    /**
     * Returns cached conversation details without hitting the database.
     * Returns undefined if no cache entry exists for this conversation.
     *
     * @param conversationId - The conversation ID
     * @returns Cached details, or undefined if not cached
     */
    public GetCachedDetails(conversationId: string): MJConversationDetailEntity[] | undefined {
        const key = NormalizeUUID(conversationId);
        return this._detailCache.get(key)?.Details;
    }

    /**
     * Returns the full cache entry for a conversation, including peripheral data.
     * Returns undefined if not cached.
     *
     * @param conversationId - The conversation ID
     * @returns The full cache entry, or undefined
     */
    public GetCachedDetailEntry(conversationId: string): ConversationDetailCache | undefined {
        const key = NormalizeUUID(conversationId);
        return this._detailCache.get(key);
    }

    /**
     * Adds a detail (message) to the cached list for a conversation.
     * If no cache entry exists, this is a no-op (caller should LoadConversationDetails first).
     *
     * @param conversationId - The conversation this detail belongs to
     * @param detail - The detail entity to add
     */
    public AddDetailToCache(conversationId: string, detail: MJConversationDetailEntity): void {
        const key = NormalizeUUID(conversationId);
        const cached = this._detailCache.get(key);
        if (cached) {
            cached.Details.push(detail);
        }
    }

    /**
     * Updates a detail entity in the cache. Finds by ID and replaces.
     * If the detail is not in cache, this is a no-op.
     *
     * @param conversationId - The conversation this detail belongs to
     * @param detail - The updated detail entity
     */
    public UpdateDetailInCache(conversationId: string, detail: MJConversationDetailEntity): void {
        const key = NormalizeUUID(conversationId);
        const cached = this._detailCache.get(key);
        if (cached) {
            const idx = cached.Details.findIndex(d => UUIDsEqual(d.ID, detail.ID));
            if (idx >= 0) {
                cached.Details[idx] = detail;
            }
        }
    }

    // ========================================================================
    // PERIPHERAL DATA (Agent Runs)
    // ========================================================================

    /**
     * Gets the cached agent run for a specific conversation detail.
     *
     * @param conversationId - The conversation ID
     * @param detailId - The conversation detail ID
     * @returns The agent run entity, or undefined if not cached
     */
    public GetAgentRunForDetail(conversationId: string, detailId: string): MJAIAgentRunEntity | undefined {
        const key = NormalizeUUID(conversationId);
        const cached = this._detailCache.get(key);
        if (!cached) return undefined;

        // Search by detail ID (agent runs are keyed by the detail they belong to)
        for (const [cachedDetailId, agentRun] of cached.AgentRunsByDetailId) {
            if (UUIDsEqual(cachedDetailId, detailId)) {
                return agentRun;
            }
        }
        return undefined;
    }

    /**
     * Gets all cached agent runs for a conversation, keyed by detail ID.
     *
     * @param conversationId - The conversation ID
     * @returns Map of detail ID to agent run, or empty map if not cached
     */
    public GetAgentRunsMap(conversationId: string): Map<string, MJAIAgentRunEntity> {
        const key = NormalizeUUID(conversationId);
        return this._detailCache.get(key)?.AgentRunsByDetailId ?? new Map();
    }

    /**
     * Adds or updates an agent run in the cache for a specific detail.
     *
     * @param conversationId - The conversation ID
     * @param detailId - The detail ID the agent run is associated with
     * @param agentRun - The agent run entity
     */
    public SetAgentRunForDetail(conversationId: string, detailId: string, agentRun: MJAIAgentRunEntity): void {
        const key = NormalizeUUID(conversationId);
        const cached = this._detailCache.get(key);
        if (cached) {
            cached.AgentRunsByDetailId.set(detailId, agentRun);
        }
    }

    // ========================================================================
    // CACHE MANAGEMENT
    // ========================================================================

    /**
     * Invalidates (removes) the cached details for a specific conversation.
     * The next call to LoadConversationDetails will fetch fresh data.
     *
     * @param conversationId - The conversation ID to invalidate
     */
    public InvalidateConversation(conversationId: string): void {
        this.removeDetailCache(conversationId);
    }

    /**
     * Clears all cached data: conversations, details, and peripheral data.
     * Typically called on logout or environment switch.
     */
    public ClearCache(): void {
        this._conversations$.next([]);
        this._detailCache.clear();
        this._lastEnvironmentId = null;
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * Saves a partial update to a conversation entity.
     */
    private async saveConversationField(
        id: string,
        updates: Partial<Pick<MJConversationEntity, 'IsArchived' | 'IsPinned' | 'Name' | 'Description'>>,
        contextUser: UserInfo
    ): Promise<boolean> {
        const md = new Metadata();
        const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', contextUser);

        const loaded = await conversation.Load(id);
        if (!loaded) {
            throw new Error('Conversation not found');
        }

        if (updates.IsArchived !== undefined) conversation.IsArchived = updates.IsArchived;
        if (updates.IsPinned !== undefined) conversation.IsPinned = updates.IsPinned;
        if (updates.Name !== undefined) conversation.Name = updates.Name;
        if (updates.Description !== undefined) conversation.Description = updates.Description;

        const saved = await conversation.Save();
        if (!saved) {
            throw new Error(conversation.LatestResult?.Message || 'Failed to update conversation');
        }
        return true;
    }

    /**
     * Removes a conversation from the in-memory list and emits the updated list.
     */
    private removeFromList(id: string): void {
        const filtered = this._conversations$.value.filter(c => !UUIDsEqual(c.ID, id));
        this._conversations$.next(filtered);
    }

    /**
     * Removes the detail cache entry for a conversation.
     */
    private removeDetailCache(conversationId: string): void {
        const key = NormalizeUUID(conversationId);
        this._detailCache.delete(key);
    }

    /**
     * Sorts conversations: pinned first, then by updated date descending.
     */
    private sortConversations(conversations: MJConversationEntity[]): MJConversationEntity[] {
        return [...conversations].sort((a, b) => {
            // Pinned conversations first
            if (a.IsPinned && !b.IsPinned) return -1;
            if (!a.IsPinned && b.IsPinned) return 1;
            // Then by updated date descending
            const aTime = a.__mj_UpdatedAt?.getTime() ?? 0;
            const bTime = b.__mj_UpdatedAt?.getTime() ?? 0;
            return bTime - aTime;
        });
    }

    /**
     * Loads agent runs for all details in a conversation.
     * Returns a Map keyed by ConversationDetailID.
     */
    private async loadAgentRunsForConversation(
        conversationId: string,
        contextUser: UserInfo
    ): Promise<Map<string, MJAIAgentRunEntity>> {
        const rv = new RunView();
        const result = await rv.RunView<MJAIAgentRunEntity>(
            {
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ConversationDetailID IN (SELECT ID FROM [${this.getSchemaPrefix()}vwConversationDetails] WHERE ConversationID='${conversationId}')`,
                OrderBy: '__mj_CreatedAt ASC',
                ResultType: 'entity_object'
            },
            contextUser
        );

        const map = new Map<string, MJAIAgentRunEntity>();
        if (result.Success && result.Results) {
            for (const run of result.Results) {
                // ConversationDetailID is available on the agent run entity
                const detailId = run.ConversationDetailID;
                if (detailId) {
                    map.set(detailId, run);
                }
            }
        }
        return map;
    }

    /**
     * Gets the schema prefix for SQL subqueries.
     * Returns '__mj.' for standard MJ deployments.
     */
    private getSchemaPrefix(): string {
        return '__mj.';
    }
}
