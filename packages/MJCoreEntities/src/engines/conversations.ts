import { BaseEngine, BaseEnginePropertyConfig, BaseEntityEvent, IMetadataProvider, RunQuery, RunView, TransformSimpleObjectToEntityObject, UserInfo } from "@memberjunction/core";
import { NormalizeUUID, UUIDsEqual } from "@memberjunction/global";
import { BehaviorSubject, Observable } from "rxjs";
import {
    MJConversationEntity,
    MJConversationDetailEntity,
    MJConversationDetailEntityType,
    MJAIAgentRunEntity,
    MJAIAgentRunEntityType,
    MJConversationDetailRatingEntityType,
    MJConversationDetailArtifactEntityType,
    MJProjectEntity
} from "../generated/entity_subclasses";
import { ArtifactMetadataEngine } from "./artifacts";
import { ResourcePermissionEngine } from "../custom/ResourcePermissions/ResourcePermissionEngine";

/**
 * `MJ: Resource Types.ID` for Conversations. Conversations that the current
 * user doesn't own but has been granted access to (via `MJ: Resource Permissions`)
 * are folded into the list by `LoadConversations` using this ID.
 */
const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';

/**
 * Display info about the user who shared a conversation with the current user,
 * plus the `PermissionLevel` the grantee was granted. Exposed via
 * {@link ConversationEngine.GetSharedByInfo} for UI surfaces that render
 * "Shared by {email}" badges and gate actions (e.g., View-only recipients
 * can't send messages).
 */
/**
 * Optional scoping inputs to {@link ConversationEngine.CreateConversation}.
 * Forwards to the new ApplicationScope / ApplicationID / DefaultAgentID
 * columns on Conversation. All fields optional; omit for the default
 * 'Global' main-chat behavior. Embedded chat surfaces (e.g. the Form
 * Builder cockpit) should pass `applicationScope: 'Application'` plus an
 * `applicationId` so the conversation doesn't pollute the main chat list.
 */
export interface CreateConversationOptions {
    /**
     * Where this conversation surfaces in the UI:
     *  - 'Global'      → main Chat app (no app binding). Default.
     *  - 'Application' → embedded surface only; hidden from main chat.
     *  - 'Both'        → visible in both surfaces by default.
     * DB CHECK constraint requires applicationId to match (Application/Both
     * ⇒ applicationId NOT NULL; Global ⇒ applicationId NULL).
     */
    applicationScope?: 'Global' | 'Application' | 'Both';
    /** The owning Application's ID. Required when scope is Application or Both. */
    applicationId?: string | null;
    /** Optional per-conversation pinned default agent (e.g. Research Agent). */
    defaultAgentId?: string | null;
    /**
     * "What is this conversation about?" pointer — the Entity whose record
     * this conversation references. Paired with {@link linkedRecordId} via
     * the DB CHECK constraint `CK_Conversation_LinkBinding`: both NULL or
     * both populated. Form Builder cockpit passes the MJ: Components
     * entity ID + the active form's ComponentID so the cockpit can later
     * filter "prior conversations about THIS form."
     */
    linkedEntityId?: string | null;
    /**
     * Primary key of the linked record, serialized as a string. Used with
     * {@link linkedEntityId}. NVARCHAR(500) in the DB — handles any PK shape
     * (UUID, int, composite).
     */
    linkedRecordId?: string | null;
}

export interface SharedByInfo {
    /** Grantor user ID. Null when the share predates the `SharedByUserID` column. */
    UserID: string | null;
    Name: string | null;
    Email: string | null;
    /** Level the current user was granted on this conversation. */
    Level: 'View' | 'Edit' | 'Owner';
}

// ========================================================================
// QUERY RESULT TYPES (from GetConversationComplete stored query)
// ========================================================================

/**
 * Agent Run data returned as JSON from GetConversationComplete query.
 */
export type AgentRunJSON = MJAIAgentRunEntityType & {
    Agent: string | null;
};

/**
 * Artifact data returned as JSON from GetConversationComplete query.
 */
export type ArtifactJSON = MJConversationDetailArtifactEntityType & {
    ArtifactVersionID: string;
    VersionNumber: number;
    VersionName: string | null;
    VersionDescription: string | null;
    VersionCreatedAt: Date;
    ArtifactID: string;
    ArtifactName: string;
    ArtifactType: string;
    ArtifactDescription: string | null;
    Visibility: string;
};

/**
 * Rating data returned as JSON from GetConversationComplete query.
 */
export type RatingJSON = MJConversationDetailRatingEntityType & {
    UserName: string;
};

/**
 * Raw query result row from GetConversationComplete (before JSON parsing).
 */
export type ConversationDetailComplete = MJConversationDetailEntityType & {
    AgentRunsJSON: string | null;
    ArtifactsJSON: string | null;
    RatingsJSON: string | null;
    UserImageURL: string | null;
    UserImageIconClass: string | null;
};

/**
 * Parsed conversation detail with typed related data.
 */
export interface ConversationDetailParsed extends MJConversationDetailEntityType {
    agentRuns: AgentRunJSON[];
    artifacts: ArtifactJSON[];
    ratings: RatingJSON[];
}

/**
 * Helper: parse a raw ConversationDetailComplete row into typed arrays.
 */
export function parseConversationDetailComplete(
    queryResult: ConversationDetailComplete
): ConversationDetailParsed {
    return {
        ...queryResult,
        agentRuns: queryResult.AgentRunsJSON
            ? JSON.parse(queryResult.AgentRunsJSON) as AgentRunJSON[]
            : [],
        artifacts: queryResult.ArtifactsJSON
            ? JSON.parse(queryResult.ArtifactsJSON) as ArtifactJSON[]
            : [],
        ratings: queryResult.RatingsJSON
            ? JSON.parse(queryResult.RatingsJSON) as RatingJSON[]
            : []
    };
}

/** User avatar info extracted from the query */
export interface UserAvatarInfo {
    ImageURL: string | null;
    IconClass: string | null;
}

/**
 * Cached data for a single conversation's details (messages) and peripheral data.
 * Populated by the efficient GetConversationComplete query in one round-trip.
 */
export interface ConversationDetailCache {
    /** The conversation detail (message) entities */
    Details: MJConversationDetailEntity[];
    /** Raw query result rows (used for peripheral data parsing) */
    RawData: ConversationDetailComplete[];
    /** Agent runs keyed by conversation detail ID */
    AgentRunsByDetailId: Map<string, MJAIAgentRunEntity>;
    /** User avatars keyed by UserID */
    UserAvatars: Map<string, UserAvatarInfo>;
    /** Ratings keyed by conversation detail ID */
    RatingsByDetailId: Map<string, RatingJSON[]>;
    /** Parsed artifacts keyed by conversation detail ID */
    ArtifactsByDetailId: Map<string, ArtifactJSON[]>;
    /** Timestamp of when this cache entry was populated */
    LoadedAt: Date;
    /**
     * When true, peripheral data (artifacts/ratings) has changed externally and
     * needs to be re-fetched via a full query reload. Set by entity event handlers
     * for junction entities whose joined fields can't be reconstructed from events alone.
     */
    PeripheralDataStale: boolean;
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

    private _projects$ = new BehaviorSubject<MJProjectEntity[]>([]);

    /**
     * Observable stream of the projects (conversation folders) for the current
     * environment. Emits whenever projects are loaded or a project is created,
     * renamed, or deleted (kept in sync via the entity event handler).
     */
    public get Projects$(): Observable<MJProjectEntity[]> {
        return this._projects$.asObservable();
    }

    /**
     * Current snapshot of projects/folders (non-reactive).
     */
    public get Projects(): MJProjectEntity[] {
        return this._projects$.value;
    }

    // ========================================================================
    // INTERNAL STATE
    // ========================================================================

    /** Detail cache keyed by normalized conversation ID */
    private _detailCache = new Map<string, ConversationDetailCache>();

    /** Track the environment ID used for the last load */
    private _lastEnvironmentId: string | null = null;

    /** Track the environment ID used for the last projects (folders) load */
    private _lastProjectsEnvironmentId: string | null = null;

    /**
     * For conversations the current user *received* via sharing, this map goes
     * from `conversationId` to the grantor's display info. Populated by
     * {@link LoadConversations} using the `SharedByUserID` column on the
     * `MJ: Resource Permissions` row. Used by the chat UI to render
     * "Shared by {email}" next to the title and a share icon in the sidebar.
     */
    private _sharedByByConversationId = new Map<string, SharedByInfo>();

    /**
     * Look up grantor info for a conversation the current user was shared into.
     * Returns `null` for conversations the user owns (not shared with them).
     */
    public GetSharedByInfo(conversationId: string): SharedByInfo | null {
        return this._sharedByByConversationId.get(NormalizeUUID(conversationId)) ?? null;
    }

    /**
     * Guard flag: set true while the engine itself is performing a mutation.
     * Prevents the entity event handler from re-processing our own saves/deletes,
     * which would cause redundant cache updates or infinite loops.
     */
    private _selfMutating = false;

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
    public async LoadConversations(
        environmentId: string,
        contextUser: UserInfo,
        forceRefresh: boolean = false,
        options?: { includeApplicationScoped?: boolean }
    ): Promise<void> {
        // Skip if already loaded for this environment (unless forcing)
        if (!forceRefresh && this._lastEnvironmentId === environmentId && this._conversations$.value.length > 0) {
            return;
        }

        this._lastEnvironmentId = environmentId;

        // Include conversations the user has been granted access to via
        // `MJ: Resource Permissions`. ResourcePermissionEngine caches the full
        // permission table; GetUserAvailableResources filters it to approved
        // grants (direct + role-inherited) for this user + resource type.
        await ResourcePermissionEngine.Instance.Config(false, contextUser);
        const sharedPermissions = ResourcePermissionEngine.Instance
            .GetUserAvailableResources(contextUser, CONVERSATIONS_RESOURCE_TYPE_ID);
        const sharedConversationIds = sharedPermissions.map((p) => p.ResourceRecordID);

        const rv = new RunView();
        const ownershipClause = `UserID='${contextUser.ID}'`;
        const sharedClause =
            sharedConversationIds.length > 0
                ? ` OR ID IN (${sharedConversationIds.map((id) => `'${id}'`).join(',')})`
                : '';
        // Default main-chat view shows Global + Both. App-scoped
        // conversations live inside their owning Application's embedded
        // surface and are filtered out here. Callers that want to surface
        // them (e.g. an "Include app conversations" toggle) pass
        // includeApplicationScoped=true to drop the scope predicate.
        const scopeClause = options?.includeApplicationScoped
            ? ''
            : ` AND ApplicationScope IN ('Global', 'Both')`;
        const filter = `EnvironmentID='${environmentId}' AND (${ownershipClause}${sharedClause}) AND (IsArchived IS NULL OR IsArchived=0)${scopeClause}`;

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

        // Build the "shared by" map AFTER fetching conversations so we can
        // exclude permissions on conversations the user owns. A role-inherited
        // grant on the user's own conversation (e.g. they're in a role that
        // got View access via a feedback workflow) must NOT appear as
        // "shared with me at View level" — otherwise the chat UI would treat
        // their own conversation as read-only. See isReadOnlyView in
        // conversation-chat-area.component.
        const ownedConversationIds = new Set(
            (result.Results ?? [])
                .filter((c) => c.UserID && UUIDsEqual(c.UserID, contextUser.ID))
                .map((c) => NormalizeUUID(c.ID))
        );
        const trulySharedPermissions = sharedPermissions.filter(
            (p) => !ownedConversationIds.has(NormalizeUUID(p.ResourceRecordID))
        );
        await this.rebuildSharedByMap(rv, trulySharedPermissions, contextUser);

        // Load the folder (project) list so the sidebar can group conversations
        // under their folder. Done after the conversation query (so it isn't
        // delayed) and after the early-return guard above; LoadProjects has its
        // own per-environment guard to avoid redundant reloads.
        await this.LoadProjects(environmentId, contextUser, forceRefresh);
    }

    /**
     * Populates {@link _sharedByByConversationId}. Resolves grantor emails via
     * one `MJ: Users` query keyed on the unique set of `SharedByUserID`s.
     * Rows without a `SharedByUserID` (legacy shares predating the column)
     * are skipped — the UI degrades to no badge for those.
     */
    private async rebuildSharedByMap(
        rv: RunView,
        sharedPermissions: Array<{
            ResourceRecordID: string;
            SharedByUserID: string | null;
            SharedByUser: string | null;
            PermissionLevel: 'View' | 'Edit' | 'Owner' | null;
        }>,
        contextUser: UserInfo
    ): Promise<void> {
        this._sharedByByConversationId.clear();
        if (sharedPermissions.length === 0) return;

        const grantorIds = Array.from(
            new Set(
                sharedPermissions
                    .map((p) => p.SharedByUserID)
                    .filter((id): id is string => !!id)
            )
        );

        const emailByUserId = new Map<string, string | null>();
        if (grantorIds.length > 0) {
            const inClause = grantorIds.map((id) => `'${id}'`).join(',');
            const result = await rv.RunView<{ ID: string; Email: string | null }>(
                {
                    EntityName: 'MJ: Users',
                    ExtraFilter: `ID IN (${inClause})`,
                    Fields: ['ID', 'Email'],
                    ResultType: 'simple'
                },
                contextUser
            );
            if (result.Success) {
                for (const u of result.Results ?? []) {
                    emailByUserId.set(NormalizeUUID(u.ID), u.Email ?? null);
                }
            }
        }

        for (const perm of sharedPermissions) {
            this._sharedByByConversationId.set(NormalizeUUID(perm.ResourceRecordID), {
                UserID: perm.SharedByUserID ?? null,
                Name: perm.SharedByUser ?? null,
                Email: perm.SharedByUserID
                    ? emailByUserId.get(NormalizeUUID(perm.SharedByUserID)) ?? null
                    : null,
                Level: perm.PermissionLevel ?? 'View'
            });
        }
    }

    /**
     * Loads the projects (conversation folders) for an environment and emits via Projects$.
     * Projects are environment-scoped (not user-scoped) and small, so the full active set
     * is cached. Skips reloading when already loaded for the same environment unless forced.
     *
     * @param environmentId - The environment to filter projects by
     * @param contextUser - The current user context
     * @param forceRefresh - If true, reloads even if already cached for this environment
     */
    public async LoadProjects(
        environmentId: string,
        contextUser: UserInfo,
        forceRefresh: boolean = false
    ): Promise<void> {
        if (!forceRefresh && this._lastProjectsEnvironmentId === environmentId) {
            return;
        }

        const rv = new RunView();
        const result = await rv.RunView<MJProjectEntity>(
            {
                EntityName: 'MJ: Projects',
                ExtraFilter: `EnvironmentID='${environmentId}' AND (IsArchived IS NULL OR IsArchived=0)`,
                OrderBy: 'Name ASC',
                MaxRows: 1000,
                ResultType: 'entity_object'
            },
            contextUser
        );

        if (result.Success) {
            this._lastProjectsEnvironmentId = environmentId;
            this._projects$.next(result.Results || []);
        } else {
            console.error('[ConversationEngine] Failed to load projects:', result.ErrorMessage);
            this._projects$.next([]);
        }
    }

    /**
     * Assigns a conversation to a folder (project), or removes it from its folder when
     * projectId is null. Thin wrapper over {@link SaveConversation} that keeps the
     * intent explicit at call sites.
     *
     * @param conversationId - The conversation to move
     * @param projectId - The target project ID, or null to ungroup
     * @param contextUser - The current user context
     * @returns true if saved successfully
     */
    public async MoveConversationToProject(
        conversationId: string,
        projectId: string | null,
        contextUser: UserInfo
    ): Promise<boolean> {
        return this.SaveConversation(conversationId, { ProjectID: projectId }, contextUser);
    }

    /**
     * Reparents a folder (project) under another folder, or to the top level when
     * parentId is null. Callers are responsible for preventing cycles (don't pass a
     * descendant of the folder as its new parent). Updates the cached entity in place
     * and re-emits Projects$.
     *
     * @param projectId - The folder to move
     * @param parentId - The new parent folder ID, or null for top level
     * @param contextUser - The current user context
     * @returns true if saved successfully
     */
    public async MoveProjectToParent(
        projectId: string,
        parentId: string | null,
        contextUser: UserInfo
    ): Promise<boolean> {
        let project = this._projects$.value.find(p => UUIDsEqual(p.ID, projectId));
        if (!project) {
            const md = this.ProviderToUse;
            project = await md.GetEntityObject<MJProjectEntity>('MJ: Projects', contextUser);
            const loaded = await project.Load(projectId);
            if (!loaded) {
                throw new Error('Folder not found');
            }
        }

        project.ParentID = parentId;

        this._selfMutating = true;
        try {
            const saved = await project.Save();
            if (!saved) {
                throw new Error(project.LatestResult?.CompleteMessage || 'Failed to move folder');
            }
        } finally {
            this._selfMutating = false;
        }

        this._projects$.next([...this._projects$.value]);
        return true;
    }

    /**
     * Deletes a folder (project) in an FK-safe way. The Conversation→Project and
     * Project→Project (ParentID) foreign keys are RESTRICT, so the row can't be
     * deleted while anything references it. Before deleting, this:
     *   1. Unassigns every conversation directly in the folder (ProjectID → null).
     *   2. Reparents direct child folders to this folder's parent (one level up).
     *   3. Deletes the now-unreferenced folder.
     * Conversations and subfolders are preserved — only the folder itself is removed.
     *
     * Note: this does NOT reassign Tasks that reference the project; if a Task still
     * references it, the final delete will fail and this throws with the DB message.
     *
     * @param id - The project (folder) ID to delete
     * @param contextUser - The current user context
     * @returns true if deleted successfully
     */
    public async DeleteProject(id: string, contextUser: UserInfo): Promise<boolean> {
        const md = this.ProviderToUse;

        // 1. Unassign conversations directly in this folder
        const directConversations = this._conversations$.value.filter(
            c => c.ProjectID && UUIDsEqual(c.ProjectID, id)
        );
        for (const conv of directConversations) {
            await this.SaveConversation(conv.ID, { ProjectID: null }, contextUser);
        }

        // 2. Reparent direct child folders to this folder's parent
        const target = this._projects$.value.find(p => UUIDsEqual(p.ID, id));
        const newParentId = target?.ParentID ?? null;
        const childFolders = this._projects$.value.filter(
            p => p.ParentID && UUIDsEqual(p.ParentID, id)
        );
        if (childFolders.length > 0) {
            this._selfMutating = true;
            try {
                for (const child of childFolders) {
                    child.ParentID = newParentId;
                    const saved = await child.Save();
                    if (!saved) {
                        throw new Error(child.LatestResult?.CompleteMessage || 'Failed to reparent subfolder');
                    }
                }
            } finally {
                this._selfMutating = false;
            }
            // Children were mutated in place — re-emit so subscribers re-read the tree
            this._projects$.next([...this._projects$.value]);
        }

        // 3. Delete the now-unreferenced folder
        let project = target;
        if (!project) {
            project = await md.GetEntityObject<MJProjectEntity>('MJ: Projects', contextUser);
            const loaded = await project.Load(id);
            if (!loaded) {
                throw new Error('Folder not found');
            }
        }

        // Remove from the cached list BEFORE calling Delete(). BaseEntity.Delete() calls
        // NewRecord() which wipes the entity's fields — including ID — so filtering the list
        // by ID *after* the delete wouldn't match the (now-blank) cached entity and the folder
        // would linger until a manual refresh. Capture the pre-delete array so we can restore
        // it if the delete fails.
        const projectsBeforeDelete = this._projects$.value;
        this._projects$.next(projectsBeforeDelete.filter(p => !UUIDsEqual(p.ID, id)));

        this._selfMutating = true;
        let deleted = false;
        try {
            deleted = await project.Delete();
        } finally {
            this._selfMutating = false;
        }

        if (!deleted) {
            // Restore the list on failure (the entity wasn't deleted, so its fields are intact)
            this._projects$.next(projectsBeforeDelete);
            throw new Error(project.LatestResult?.CompleteMessage || 'Failed to delete folder');
        }

        return true;
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
        projectId?: string,
        options?: CreateConversationOptions
    ): Promise<MJConversationEntity> {
        const md = this.ProviderToUse;
        const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', contextUser);

        conversation.Name = name;
        conversation.EnvironmentID = environmentId;
        conversation.UserID = contextUser.ID;
        if (description) conversation.Description = description;
        if (projectId) conversation.ProjectID = projectId;

        // Application scoping — when set by an embedded chat surface (e.g.
        // the Form Builder cockpit), keeps this conversation OUT of the main
        // chat list by default. The DB CHECK constraint enforces that
        // ApplicationID is set iff ApplicationScope is 'Application' or 'Both';
        // we just forward the caller's choices and let the DB validate.
        if (options?.applicationScope) {
            conversation.ApplicationScope = options.applicationScope;
        }
        if (options?.applicationId !== undefined) {
            conversation.ApplicationID = options.applicationId;
        }
        if (options?.defaultAgentId !== undefined) {
            conversation.DefaultAgentID = options.defaultAgentId;
        }
        // Linked-record binding — the DB CK_Conversation_LinkBinding CHECK
        // requires both Linked* columns to be populated together or both
        // null. We forward each caller-supplied value when explicitly
        // provided (undefined = leave the field alone, null = explicit
        // clear). If the caller supplies only one of the two, the DB
        // rejects on save — surfacing the misconfiguration loudly rather
        // than letting half a link silently land.
        if (options?.linkedEntityId !== undefined) {
            conversation.LinkedEntityID = options.linkedEntityId;
        }
        if (options?.linkedRecordId !== undefined) {
            conversation.LinkedRecordID = options.linkedRecordId;
        }

        // Guard our own save event: the engine's BaseEntity event handler
        // (handleConversationEntityEvent) ALSO prepends a conversation it doesn't yet
        // hold. When the save event is dispatched synchronously during Save(), that
        // handler runs BEFORE the explicit prepend below, finds nothing in the list, and
        // adds the conversation — then the prepend adds it a SECOND time, producing a
        // duplicate row in the sidebar (cleared on refresh, since LoadConversations
        // re-fetches clean). Wrapping in _selfMutating makes the handler skip our own
        // mutation, mirroring every other mutating method here (SaveConversation, etc.).
        this._selfMutating = true;
        try {
            const saved = await conversation.Save();
            if (!saved) {
                throw new Error(conversation.LatestResult?.Message || 'Failed to create conversation');
            }
        } finally {
            this._selfMutating = false;
        }

        // The engine's cached list represents the main Chat app's view —
        // 'Global' + 'Both' conversations. App-scoped conversations live
        // outside that list (they surface in the embedded chat for their
        // owning app), so don't prepend them. Without this guard, a
        // cockpit-originated conversation would pop into main chat the
        // moment it's created even though LoadConversations() filters it
        // out on next refresh.
        // The GetConversation() check is belt-and-suspenders against a save event that
        // slips past _selfMutating (e.g. async dispatch) — never add the same ID twice.
        if (conversation.ApplicationScope !== 'Application' && !this.GetConversation(conversation.ID)) {
            const updated = [conversation, ...this._conversations$.value];
            this._conversations$.next(updated);
        }
        return conversation;
    }

    /**
     * Folds a conversation that was created OUTSIDE this engine (e.g. server-side by a
     * realtime-session mint, which never fires a client BaseEntity event) into the cached
     * list so {@link Conversations$} emits reactively — the sidebar list updates without a
     * manual refresh. Costs at most ONE single-row query, and only when the conversation
     * isn't already cached:
     *
     *  - Already in the list → no-op (returns the cached entity).
     *  - Not cached → loads the single row, and (unless it's app-scoped, which lives
     *    outside the main-chat list — see {@link CreateConversation}) prepends it and
     *    re-emits. Returns the loaded entity, or null when the row can't be read.
     *
     * Idempotent and safe to call from a session-start hook on every start.
     *
     * @param id - The conversation ID to ensure is present in the cache
     * @param contextUser - The current user context
     * @returns The cached/loaded conversation entity, or null when it can't be loaded
     */
    public async EnsureConversationLoaded(
        id: string,
        contextUser: UserInfo
    ): Promise<MJConversationEntity | null> {
        const existing = this.GetConversation(id);
        if (existing) {
            return existing;
        }

        const md = this.ProviderToUse;
        const conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', contextUser);
        const loaded = await conversation.Load(id);
        if (!loaded) {
            return null;
        }

        // App-scoped conversations live inside their owning Application's embedded surface,
        // not the main-chat list this engine caches — mirror CreateConversation and skip them.
        if (conversation.ApplicationScope === 'Application') {
            return conversation;
        }

        // Re-check under the loaded row in case a concurrent emit added it meanwhile.
        if (this.GetConversation(id)) {
            return this.GetConversation(id)!;
        }

        this._conversations$.next([conversation, ...this._conversations$.value]);
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
        // Try to use the cached entity object first to avoid a DB round-trip
        let conversation = this.GetConversation(id);
        if (!conversation) {
            // Not in cache — load from DB as fallback
            const md = this.ProviderToUse;
            conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', contextUser);
            const loaded = await conversation.Load(id);
            if (!loaded) {
                throw new Error('Conversation not found');
            }
        }

        // Remove from the list and cache BEFORE calling Delete(), because
        // BaseEntity.Delete() calls NewRecord() which wipes the entity's fields.
        // Since the cached entity is the same object reference in the list,
        // wiping it causes a blank render frame before removal.
        this.removeFromList(id);
        this.removeDetailCache(id);

        this._selfMutating = true;
        try {
            const deleted = await conversation.Delete();
            if (!deleted) {
                // Delete failed — restore to list
                const current = this._conversations$.value;
                this._conversations$.next([conversation, ...current]);
                throw new Error(conversation.LatestResult?.Message || 'Failed to delete conversation');
            }
        } finally {
            this._selfMutating = false;
        }

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
        // Try to use the cached entity to avoid a DB round-trip
        let conversation = this.GetConversation(id);
        if (!conversation) {
            // Not in cache — load from DB as fallback
            const md = this.ProviderToUse;
            conversation = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', contextUser);
            const loaded = await conversation.Load(id);
            if (!loaded) {
                throw new Error('Conversation not found');
            }
        }

        this.mergeDataOntoRecord(conversation, updates);

        this._selfMutating = true;
        try {
            const saved = await conversation.Save();
            if (!saved) {
                throw new Error(conversation.LatestResult?.Message || 'Failed to update conversation');
            }
        } finally {
            this._selfMutating = false;
        }

        // Re-emit the list so subscribers see the update
        this._conversations$.next([...this._conversations$.value]);
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
        if (ids.length === 0) {
            return { Successful: [], Failed: [] };
        }

        const md = this.ProviderToUse;
        const successful: string[] = [];
        const failed: Array<{ ID: string; Name: string; Error: string }> = [];
        const entitiesToDelete: MJConversationEntity[] = [];

        // Phase 1: Gather entities — use cached objects when available to avoid DB round-trips
        for (const id of ids) {
            const cached = this.GetConversation(id);
            if (cached) {
                entitiesToDelete.push(cached);
            } else {
                // Not in cache — try loading from DB
                try {
                    const entity = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', contextUser);
                    const loaded = await entity.Load(id);
                    if (!loaded) {
                        failed.push({ ID: id, Name: 'Unknown', Error: 'Conversation not found' });
                    } else {
                        entitiesToDelete.push(entity);
                    }
                } catch (error) {
                    failed.push({ ID: id, Name: 'Unknown', Error: error instanceof Error ? error.message : 'Unknown error' });
                }
            }
        }

        if (entitiesToDelete.length === 0) {
            return { Successful: successful, Failed: failed };
        }

        // Phase 2: Delete each conversation individually.
        // We use individual deletes rather than TransactionGroup because cached entities
        // from RunView may have stale state on the server (e.g., already deleted records
        // cause InnerLoad failures inside TransactionGroup, failing the entire batch).
        // Individual deletes let us handle partial success gracefully.
        this._selfMutating = true;
        try {
            for (const entity of entitiesToDelete) {
                const name = entity.Name || 'Unknown';
                try {
                    // Use DeleteConversation which handles Load + Delete properly
                    // and removes from list/cache on success
                    await this.DeleteConversation(entity.ID, contextUser);
                    successful.push(entity.ID);
                } catch (deleteError) {
                    const errMsg = deleteError instanceof Error ? deleteError.message : 'Delete failed';
                    // If the record wasn't found (already deleted), treat as success for UI purposes
                    if (errMsg.includes('not found') || errMsg.includes('hasn\'t yet been saved')) {
                        successful.push(entity.ID);
                        this.removeDetailCache(entity.ID);
                    } else {
                        failed.push({ ID: entity.ID, Name: name, Error: errMsg });
                    }
                }
            }
        } finally {
            this._selfMutating = false;
        }

        // Phase 3: Ensure all successful IDs are removed from the list.
        // DeleteConversation handles its own removal, but "already deleted" items
        // (counted as successful above) may still be in the stale cache.
        this.removeMultipleFromList(successful);

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
    /**
     * Loads conversation details using the efficient GetConversationComplete query
     * which returns messages, agent runs, artifacts, ratings, and user avatars in one round-trip.
     * Results are cached for instant retrieval on subsequent calls.
     *
     * @param conversationId - The conversation to load details for
     * @param contextUser - The current user context
     * @param forceRefresh - If true, reloads even if cached
     * @returns The full cache entry with all peripheral data
     */
    public async LoadConversationDetails(
        conversationId: string,
        contextUser: UserInfo,
        forceRefresh: boolean = false
    ): Promise<ConversationDetailCache> {
        const key = NormalizeUUID(conversationId);

        // Return cached if available and not forcing
        if (!forceRefresh) {
            const cached = this._detailCache.get(key);
            if (cached) {
                return cached;
            }
        }

        // Use GetConversationComplete for one-round-trip loading of all data
        const rq = new RunQuery();
        const result = await rq.RunQuery({
            QueryName: 'GetConversationComplete',
            CategoryPath: 'MJ/Conversations',
            Parameters: { ConversationID: conversationId }
        }, contextUser);

        if (!result.Success || !result.Results) {
            console.error('[ConversationEngine] Failed to load conversation details:', result.ErrorMessage);
            // Return empty cache entry
            const empty: ConversationDetailCache = {
                Details: [],
                RawData: [],
                AgentRunsByDetailId: new Map(),
                UserAvatars: new Map(),
                RatingsByDetailId: new Map(),
                ArtifactsByDetailId: new Map(),
                LoadedAt: new Date(),
                PeripheralDataStale: false
            };
            return empty;
        }

        const rawData = result.Results as ConversationDetailComplete[];

        // Build the cache entry from the rich query result
        const cacheEntry = await this.buildDetailCacheFromRawData(rawData, contextUser);
        this._detailCache.set(key, cacheEntry);

        return cacheEntry;
    }

    /**
     * Builds a full ConversationDetailCache from raw GetConversationComplete query results.
     * Hydrates entity objects and parses peripheral JSON data in one pass.
     */
    private async buildDetailCacheFromRawData(
        rawData: ConversationDetailComplete[],
        contextUser: UserInfo
    ): Promise<ConversationDetailCache> {
        const md = this.ProviderToUse;

        // Hydrate raw rows into MJConversationDetailEntity objects
        const validRows = rawData.filter(row => !!row.ID);
        const details = await TransformSimpleObjectToEntityObject<MJConversationDetailEntity>(
            this.ProviderToUse, 'MJ: Conversation Details', validRows, contextUser
        );

        // Build peripheral data maps from parsed JSON in one pass
        const agentRuns = new Map<string, MJAIAgentRunEntity>();
        const userAvatars = new Map<string, UserAvatarInfo>();
        const ratingsByDetailId = new Map<string, RatingJSON[]>();
        const artifactsByDetailId = new Map<string, ArtifactJSON[]>();

        for (const row of rawData) {
            if (!row.ID) continue;

            const parsed = parseConversationDetailComplete(row);

            // Agent runs
            if (parsed.agentRuns.length > 0) {
                const agentRunData = parsed.agentRuns[0];
                const agentRun = await md.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', contextUser);
                agentRun.LoadFromData({
                    ID: agentRunData.ID,
                    AgentID: agentRunData.AgentID,
                    Agent: agentRunData.Agent,
                    Status: agentRunData.Status,
                    __mj_CreatedAt: agentRunData.__mj_CreatedAt,
                    __mj_UpdatedAt: agentRunData.__mj_UpdatedAt,
                    TotalPromptTokensUsed: agentRunData.TotalPromptTokensUsed,
                    TotalCompletionTokensUsed: agentRunData.TotalCompletionTokensUsed,
                    TotalCost: agentRunData.TotalCost,
                    ConversationDetailID: agentRunData.ConversationDetailID
                });
                agentRuns.set(row.ID, agentRun);
            }

            // Artifacts
            if (parsed.artifacts.length > 0) {
                artifactsByDetailId.set(row.ID, parsed.artifacts);
            }

            // Ratings
            if (parsed.ratings.length > 0) {
                ratingsByDetailId.set(row.ID, parsed.ratings);
            }

            // User avatars (deduplicate by UserID)
            if (row.Role?.toLowerCase() === 'user' && row.UserID && !userAvatars.has(row.UserID)) {
                userAvatars.set(row.UserID, {
                    ImageURL: row.UserImageURL || null,
                    IconClass: row.UserImageIconClass || null
                });
            }
        }

        return {
            Details: details,
            RawData: rawData,
            AgentRunsByDetailId: agentRuns,
            UserAvatars: userAvatars,
            RatingsByDetailId: ratingsByDetailId,
            ArtifactsByDetailId: artifactsByDetailId,
            LoadedAt: new Date(),
            PeripheralDataStale: false
        };
    }

    /**
     * Refreshes conversation details by re-running the GetConversationComplete query
     * and surgically merging results into the existing cache. Existing objects that
     * haven't changed keep their references (minimizing Angular re-renders).
     *
     * - New messages: appended to Details array
     * - Existing messages: fields updated in-place on the same object
     * - Agent runs: updated in-place or added
     * - Artifacts/ratings: replaced per-detail (cheap — plain data, not entity objects)
     * - User avatars: merged (new users added)
     *
     * If no cache exists yet, falls back to a full load.
     *
     * @param conversationId - The conversation to refresh
     * @param contextUser - The current user context
     * @returns The updated cache entry
     */
    public async RefreshConversationDetails(
        conversationId: string,
        contextUser: UserInfo
    ): Promise<ConversationDetailCache> {
        const key = NormalizeUUID(conversationId);
        const existing = this._detailCache.get(key);

        // No cache yet — do a full load
        if (!existing) {
            return this.LoadConversationDetails(conversationId, contextUser);
        }

        // Run the query
        const rq = new RunQuery();
        const result = await rq.RunQuery({
            QueryName: 'GetConversationComplete',
            CategoryPath: 'MJ/Conversations',
            Parameters: { ConversationID: conversationId }
        }, contextUser);

        if (!result.Success || !result.Results) {
            console.error('[ConversationEngine] Failed to refresh conversation details:', result.ErrorMessage);
            return existing;
        }

        const freshRows = result.Results as ConversationDetailComplete[];
        const md = this.ProviderToUse;

        // Build a lookup of existing details by ID for fast comparison
        const existingDetailsMap = new Map<string, MJConversationDetailEntity>();
        for (const detail of existing.Details) {
            existingDetailsMap.set(detail.ID, detail);
        }

        // Process each row in parallel — sync mutations happen immediately,
        // async hydrations (new entities) run concurrently
        await Promise.all(freshRows.map(async (row) => {
            if (!row.ID) return;

            const existingDetail = existingDetailsMap.get(row.ID);
            if (existingDetail) {
                // Update fields in-place on the existing entity object (preserves reference)
                existingDetail.LoadFromData(row);
                existingDetailsMap.delete(row.ID);
            } else {
                // New message — hydrate and append
                const newDetail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', contextUser);
                newDetail.LoadFromData(row);
                existing.Details.push(newDetail);
            }

            const parsed = parseConversationDetailComplete(row);

            // Merge agent runs: update in-place or add.
            //
            // Important: `existingRun` may be a plain JSON object rather than a BaseEntity.
            // Progress-update events from the agent runner stream deserialized JSON via
            // `SetAgentRunForDetail()`; those objects have no prototype methods. Duck-type
            // check for `LoadFromData` before calling it, and hydrate a real entity when
            // we only have plain data. Mirrors the pattern in
            // `conversation-chat-area.component.ts#onMessageComplete` (line ~909).
            if (parsed.agentRuns.length > 0) {
                const agentRunData = parsed.agentRuns[0];
                const mergeFields = {
                    ID: agentRunData.ID,
                    AgentID: agentRunData.AgentID,
                    Agent: agentRunData.Agent,
                    Status: agentRunData.Status,
                    __mj_CreatedAt: agentRunData.__mj_CreatedAt,
                    __mj_UpdatedAt: agentRunData.__mj_UpdatedAt,
                    TotalPromptTokensUsed: agentRunData.TotalPromptTokensUsed,
                    TotalCompletionTokensUsed: agentRunData.TotalCompletionTokensUsed,
                    TotalCost: agentRunData.TotalCost,
                    ConversationDetailID: agentRunData.ConversationDetailID
                };

                const existingRun = existing.AgentRunsByDetailId.get(row.ID);
                const existingRunIsEntity = !!existingRun && typeof (existingRun as { LoadFromData?: unknown }).LoadFromData === 'function';

                if (existingRunIsEntity) {
                    existingRun!.LoadFromData(mergeFields);
                } else {
                    // Either no existing run, or existing value is plain JSON — hydrate fresh.
                    const newRun = await md.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', contextUser);
                    newRun.LoadFromData(existingRun ? { ...existingRun, ...mergeFields } : agentRunData);
                    existing.AgentRunsByDetailId.set(row.ID!, newRun);
                }
            }

            // Replace artifacts per-detail (plain data, cheap to replace)
            if (parsed.artifacts.length > 0) {
                existing.ArtifactsByDetailId.set(row.ID, parsed.artifacts);
            }

            // Replace ratings per-detail
            if (parsed.ratings.length > 0) {
                existing.RatingsByDetailId.set(row.ID, parsed.ratings);
            }

            // Merge user avatars
            if (row.Role?.toLowerCase() === 'user' && row.UserID && !existing.UserAvatars.has(row.UserID)) {
                existing.UserAvatars.set(row.UserID, {
                    ImageURL: row.UserImageURL || null,
                    IconClass: row.UserImageIconClass || null
                });
            }
        }));

        // Update raw data and timestamp
        existing.RawData = freshRows;
        existing.LoadedAt = new Date();
        existing.PeripheralDataStale = false;

        return existing;
    }

    /**
     * Returns cached conversation details (messages only) without hitting the database.
     * Returns undefined if no cache entry exists for this conversation.
     *
     * @param conversationId - The conversation ID
     * @returns Cached message entities, or undefined if not cached
     */
    public GetCachedDetails(conversationId: string): MJConversationDetailEntity[] | undefined {
        const key = NormalizeUUID(conversationId);
        return this._detailCache.get(key)?.Details;
    }

    /**
     * Returns the full cache entry for a conversation, including all peripheral data
     * (agent runs, artifacts, ratings, user avatars). Returns undefined if not cached.
     *
     * This is the primary read method for UI components — returns instant cached data
     * without any database round-trip.
     *
     * @param conversationId - The conversation ID
     * @returns The full cache entry, or undefined
     */
    public GetCachedDetailEntry(conversationId: string): ConversationDetailCache | undefined {
        const key = NormalizeUUID(conversationId);
        return this._detailCache.get(key);
    }

    /**
     * Returns true if conversation details are cached for the given conversation.
     */
    public HasCachedDetails(conversationId: string): boolean {
        const key = NormalizeUUID(conversationId);
        return this._detailCache.has(key);
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
        this._projects$.next([]);
        this._detailCache.clear();
        this._lastEnvironmentId = null;
        this._lastProjectsEnvironmentId = null;
    }

    // ========================================================================
    // CONVERSATION DETAIL CRUD
    // ========================================================================

    /**
     * Creates a new conversation detail (message), saves it, and adds it to the cache.
     *
     * @param conversationId - The conversation this detail belongs to
     * @param role - The message role ('User', 'AI', 'System')
     * @param message - The message content
     * @param contextUser - The current user context
     * @param additionalFields - Optional extra fields to set on the entity
     * @returns The saved conversation detail entity
     */
    public async CreateConversationDetail(
        conversationId: string,
        role: MJConversationDetailEntity['Role'],
        message: string,
        contextUser: UserInfo,
        additionalFields?: Partial<MJConversationDetailEntity>
    ): Promise<MJConversationDetailEntity> {
        const md = this.ProviderToUse;
        const detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', contextUser);

        detail.ConversationID = conversationId;
        detail.Role = role;
        detail.Message = message;
        if (additionalFields) {
            this.mergeDataOntoRecord(detail, additionalFields);
        }

        this._selfMutating = true;
        try {
            const saved = await detail.Save();
            if (!saved) {
                throw new Error(detail.LatestResult?.Message || 'Failed to create conversation detail');
            }
        } finally {
            this._selfMutating = false;
        }

        // Add to cache if this conversation's details are cached
        this.AddDetailToCache(conversationId, detail);
        return detail;
    }

    /**
     * Saves an existing conversation detail entity and updates the cache.
     * Use this instead of calling detail.Save() directly to keep the engine cache in sync.
     *
     * @param detail - The conversation detail entity to save (must already be loaded)
     * @returns true if saved successfully
     */
    public async SaveConversationDetail(detail: MJConversationDetailEntity): Promise<boolean> {
        this._selfMutating = true;
        try {
            const saved = await detail.Save();
            if (!saved) {
                throw new Error(detail.LatestResult?.Message || 'Failed to save conversation detail');
            }
        } finally {
            this._selfMutating = false;
        }

        // Update in cache
        this.UpdateDetailInCache(detail.ConversationID, detail);
        return true;
    }

    /**
     * Deletes a conversation detail and removes it from the cache.
     *
     * @param conversationId - The conversation this detail belongs to
     * @param detailId - The detail ID to delete
     * @param contextUser - The current user context
     * @returns true if deleted successfully
     */
    public async DeleteConversationDetail(
        conversationId: string,
        detailId: string,
        contextUser: UserInfo
    ): Promise<boolean> {
        // Try to use the cached detail entity to avoid a DB round-trip
        const key = NormalizeUUID(conversationId);
        const cachedEntry = this._detailCache.get(key);
        let detail: MJConversationDetailEntity | undefined = cachedEntry?.Details.find(d => UUIDsEqual(d.ID, detailId));

        if (!detail) {
            // Not in cache — load from DB as fallback
            const md = this.ProviderToUse;
            detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', contextUser);
            const loaded = await detail.Load(detailId);
            if (!loaded) {
                throw new Error('Conversation detail not found');
            }
        }

        this._selfMutating = true;
        try {
            const deleted = await detail.Delete();
            if (!deleted) {
                throw new Error(detail.LatestResult?.Message || 'Failed to delete conversation detail');
            }
        } finally {
            this._selfMutating = false;
        }

        // Remove from cache
        if (cachedEntry) {
            cachedEntry.Details = cachedEntry.Details.filter(d => !UUIDsEqual(d.ID, detailId));
            cachedEntry.AgentRunsByDetailId.delete(detailId);
        }

        return true;
    }

    // ========================================================================
    // ENTITY EVENT HANDLING (External Mutation Sync)
    // ========================================================================

    /**
     * Overrides BaseEngine's entity event handler to watch for external mutations
     * to Conversations and Conversation Details. When another piece of code (outside
     * this engine) saves or deletes these entities, we sync our cache.
     *
     * The _selfMutating guard prevents processing events from our own mutations.
     */
    protected override async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        // Skip events from our own mutations to avoid redundant cache updates
        if (this._selfMutating) {
            return true;
        }

        // Entity name comes from baseEntity for local events, or event.entityName for remote-invalidate
        const entityName = event.baseEntity?.EntityInfo?.Name || event.entityName;
        if (!entityName) {
            return await super.HandleIndividualBaseEntityEvent(event);
        }

        const normalizedName = entityName.toLowerCase().trim();

        // For remote-invalidate events, resolve the action to save/delete for our handlers
        const effectiveType = event.type === 'remote-invalidate'
            ? (event.payload as { action?: string })?.action || 'save'
            : event.type;

        if (normalizedName === 'mj: conversations') {
            return this.handleConversationEntityEvent(event, effectiveType);
        }

        if (normalizedName === 'mj: conversation details') {
            return this.handleConversationDetailEntityEvent(event, effectiveType);
        }

        if (normalizedName === 'mj: projects') {
            return this.handleProjectEntityEvent(event, effectiveType);
        }

        if (normalizedName === 'mj: ai agent runs') {
            return this.handleAgentRunEntityEvent(event, effectiveType);
        }

        if (normalizedName === 'mj: conversation detail artifacts' || normalizedName === 'mj: conversation detail ratings') {
            return this.handlePeripheralJunctionEntityEvent(event);
        }

        // Not a conversation entity — let BaseEngine handle it
        return await super.HandleIndividualBaseEntityEvent(event);
    }

    /**
     * Extracts record data from a BaseEntityEvent.
     * For local events: uses baseEntity directly.
     * For remote-invalidate events: parses recordData JSON from the payload.
     * Returns null if no data is available.
     */
    private extractRecordData(event: BaseEntityEvent): Record<string, unknown> | null {
        // Local event — entity is available directly
        if (event.baseEntity) {
            return event.baseEntity.GetAll();
        }

        // Remote event — parse from payload
        const payload = event.payload as { recordData?: string } | undefined;
        if (payload?.recordData) {
            try {
                return JSON.parse(payload.recordData);
            } catch {
                return null;
            }
        }

        return null;
    }

    /**
     * Safely merges data onto a target object that may or may not be a BaseEntity.
     * If the target has SetMany (i.e., it's a BaseEntity), uses that to properly handle
     * read-only fields like __mj_CreatedAt. Otherwise falls back to Object.assign.
     */
    private mergeDataOntoRecord(target: unknown, data: Record<string, unknown>): void {
        const t = target as { SetMany?: (obj: unknown, ignore: boolean) => void };
        if (typeof t.SetMany === 'function') {
            t.SetMany(data, true);
        } else {
            Object.assign(target as Record<string, unknown>, data);
        }
    }

    /**
     * Handles save/delete events on Conversation entities from local or remote code.
     */
    private handleConversationEntityEvent(event: BaseEntityEvent, action: string): boolean {
        const data = this.extractRecordData(event);
        const id = data?.['ID'] as string;
        if (!id) return true;

        if (action === 'save') {
            const existing = this.GetConversation(id);
            if (existing) {
                this.mergeDataOntoRecord(existing, data);
                this._conversations$.next([...this._conversations$.value]);
            } else if (event.baseEntity) {
                // A conversation created OUTSIDE this engine (local save event) that we don't
                // yet hold — append it so the list updates reactively. Only fold in the
                // main-chat scope this engine caches, and only for the loaded environment;
                // app-scoped rows live in their owning surface (see CreateConversation), and
                // archived rows don't belong in the active list.
                const scope = data['ApplicationScope'] as string | undefined;
                const environmentId = data['EnvironmentID'] as string | undefined;
                const isArchived = data['IsArchived'] === true;
                const inLoadedEnvironment =
                    !this._lastEnvironmentId ||
                    (environmentId != null && UUIDsEqual(environmentId, this._lastEnvironmentId));
                if (scope !== 'Application' && !isArchived && inLoadedEnvironment) {
                    this._conversations$.next([event.baseEntity as MJConversationEntity, ...this._conversations$.value]);
                }
            }
        } else if (action === 'delete') {
            const existing = this.GetConversation(id);
            if (existing) {
                this.removeFromList(id);
                this.removeDetailCache(id);
            }
        }

        return true;
    }

    /**
     * Handles save/delete events on ConversationDetail entities from local or remote code.
     */
    private handleConversationDetailEntityEvent(event: BaseEntityEvent, action: string): boolean {
        const entity = event.baseEntity as MJConversationDetailEntity | null;
        const data = this.extractRecordData(event);
        const id = data?.['ID'] as string;
        const conversationId = data?.['ConversationID'] as string;
        if (!id || !conversationId) return true;

        const key = NormalizeUUID(conversationId);
        const cached = this._detailCache.get(key);
        if (!cached) return true;

        if (action === 'save') {
            const existingIdx = cached.Details.findIndex(d => UUIDsEqual(d.ID, id));
            if (existingIdx >= 0) {
                // For local events, use the entity directly; for remote, update fields in place
                if (entity) {
                    cached.Details[existingIdx] = entity;
                } else {
                    this.mergeDataOntoRecord(cached.Details[existingIdx], data);
                }
            } else if (entity) {
                // New detail from local event — append the entity
                cached.Details.push(entity);
            }
            // For new details from remote events, we can't construct a full entity here
            // — the next loadMessages will pick it up from the engine cache
        } else if (action === 'delete') {
            cached.Details = cached.Details.filter(d => !UUIDsEqual(d.ID, id));
            cached.AgentRunsByDetailId.delete(id);
        }

        return true;
    }

    /**
     * Handles save/delete events on Project entities from local or remote code.
     * Keeps the folder list in sync when a folder is created, renamed, archived, or
     * deleted via the project form modal. Only tracks projects in the currently-loaded
     * environment; archived projects are dropped from the active list.
     */
    private handleProjectEntityEvent(event: BaseEntityEvent, action: string): boolean {
        const data = this.extractRecordData(event);
        const id = data?.['ID'] as string;
        if (!id) return true;

        const current = this._projects$.value;
        const existingIdx = current.findIndex(p => UUIDsEqual(p.ID, id));

        if (action === 'delete') {
            if (existingIdx >= 0) {
                this._projects$.next(current.filter(p => !UUIDsEqual(p.ID, id)));
            }
            return true;
        }

        // save — only track projects in the loaded environment; drop archived ones
        const environmentId = data?.['EnvironmentID'] as string | undefined;
        const isArchived = data?.['IsArchived'] === true;
        const inLoadedEnvironment =
            !this._lastProjectsEnvironmentId ||
            (environmentId != null && UUIDsEqual(environmentId, this._lastProjectsEnvironmentId));

        if (existingIdx >= 0) {
            if (isArchived || !inLoadedEnvironment) {
                this._projects$.next(current.filter(p => !UUIDsEqual(p.ID, id)));
            } else {
                this.mergeDataOntoRecord(current[existingIdx], data);
                this._projects$.next([...current]);
            }
        } else if (event.baseEntity && !isArchived && inLoadedEnvironment) {
            // New folder from a local event — append the entity object
            this._projects$.next([...current, event.baseEntity as MJProjectEntity]);
        }

        return true;
    }

    /**
     * Handles save/delete events on AI Agent Run entities from local or remote code.
     * Updates the AgentRunsByDetailId map so timers and status reflect reality.
     */
    private handleAgentRunEntityEvent(event: BaseEntityEvent, action: string): boolean {
        const data = this.extractRecordData(event);
        const id = data?.['ID'] as string;
        const detailId = data?.['ConversationDetailID'] as string;
        if (!id || !detailId) return true;

        // Find which conversation cache entry contains this detail ID
        for (const [_key, cached] of this._detailCache) {
            const detail = cached.Details.find(d => UUIDsEqual(d.ID, detailId));
            if (detail) {
                if (action === 'save') {
                    // For local events, use the entity directly
                    if (event.baseEntity) {
                        cached.AgentRunsByDetailId.set(detailId, event.baseEntity as MJAIAgentRunEntity);
                    } else {
                        // Remote event — update existing agent run in place, or skip if not cached
                        const existing = cached.AgentRunsByDetailId.get(detailId);
                        if (existing) {
                            this.mergeDataOntoRecord(existing, data);
                        }
                    }
                } else if (action === 'delete') {
                    cached.AgentRunsByDetailId.delete(detailId);
                }
                break;
            }
        }

        return true;
    }

    /**
     * Handles save/delete events on junction entities (Conversation Detail Artifacts,
     * Conversation Detail Ratings) from local or remote code.
     *
     * These entities have joined fields (ArtifactName, UserName, etc.) that can't be
     * reconstructed from the entity event alone, so we flag the cache as stale.
     * The UI component checks PeripheralDataStale and force-refreshes when needed.
     */
    private handlePeripheralJunctionEntityEvent(event: BaseEntityEvent): boolean {
        const data = this.extractRecordData(event);
        const detailId = data?.['ConversationDetailID'] as string;
        if (!detailId) return true;

        for (const [_key, cached] of this._detailCache) {
            const detail = cached.Details.find(d => UUIDsEqual(d.ID, detailId));
            if (detail) {
                cached.PeripheralDataStale = true;
                break;
            }
        }

        return true;
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
        const md = this.ProviderToUse;
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
     * Removes multiple IDs from the cached list in a single emission.
     * Used by DeleteMultipleConversations for a smooth batch UI update.
     */
    private removeMultipleFromList(ids: string[]): void {
        const idSet = new Set(ids.map(id => NormalizeUUID(id)));
        const filtered = this._conversations$.value.filter(c => !idSet.has(NormalizeUUID(c.ID)));
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

}
