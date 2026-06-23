import { BaseEntity } from "./baseEntity";
import { EntityDependency, EntityInfo,  RecordChange, RecordDependency, RecordMergeRequest, RecordMergeResult, EntityDocumentTypeInfo } from "./entityInfo";
import { ApplicationInfo } from "./applicationInfo";
import { RunViewParams } from "../views/runView";
import { AuditLogTypeInfo, AuthorizationInfo, AuthorizationRoleInfo, RoleInfo, RowLevelSecurityFilterInfo, UserInfo } from "./securityInfo";
import { TransactionGroupBase } from "./transactionGroup";
import { RunReportParams } from "./runReport";
import { QueryCategoryInfo, QueryFieldInfo, QueryInfo, QueryPermissionInfo, QueryEntityInfo, QueryParameterInfo, QueryDependencyInfo, SQLDialectInfo, QuerySQLInfo } from "./queryInfo";
import { RunQueryParams } from "./runQuery";
import { QueryExecutionSpec } from "./queryExecutionSpec";
import { LibraryInfo } from "./libraryInfo";
import { CompositeKey } from "./compositeKey";
import { ExplorerNavigationItem } from "./explorerNavigationItem";

/**
 * Base configuration class for data providers.
 * Contains schema inclusion/exclusion rules and configuration data.
 * Used to configure which database schemas should be included or excluded from metadata scanning.
 */
export class ProviderConfigDataBase<D = any> {
    private _includeSchemas: string[] = [];
    private _excludeSchemas: string[] = [];
    private _MJCoreSchemaName: string = '__mj';
    private _data: D;
    private _ignoreExistingMetadata: boolean = false;

    public get Data(): D {
        return this._data;
    }
    public get IncludeSchemas(): string[] {
        return this._includeSchemas;
    }
    public get MJCoreSchemaName(): string {
        return this._MJCoreSchemaName;
    }
    public get ExcludeSchemas(): string[] {
        return this._excludeSchemas;
    }
    public get IgnoreExistingMetadata(): boolean {
        return this._ignoreExistingMetadata;
    }

    /**
     * Constructor for ProviderConfigDataBase
     * @param data 
     * @param MJCoreSchemaName 
     * @param includeSchemas 
     * @param excludeSchemas 
     * @param ignoreExistingMetadata if set to true, even if a global provider is already registered for the Metadata static Provider member, this class will still load up fresh metadata for itself. By default this is off and a class will use existing loaded metadata if it exists
     */
    constructor(data: D, MJCoreSchemaName: string = '__mj', includeSchemas?: string[], excludeSchemas?: string[], ignoreExistingMetadata: boolean = true) {
        this._data = data;
        this._MJCoreSchemaName = MJCoreSchemaName;
        if (includeSchemas)
            this._includeSchemas = includeSchemas;
        if (excludeSchemas)
            this._excludeSchemas = excludeSchemas;
        this._ignoreExistingMetadata = ignoreExistingMetadata;
    }
}

/**
 * Information about metadata timestamps and record counts.
 * Used to track when metadata was last updated and how many records exist.
 * Helps determine if local metadata cache is up-to-date with the server.
 */
export class MetadataInfo {
    ID: string
    Type: string
    UpdatedAt: Date
    RowCount: number
}

export const ProviderType = {
    Database: 'Database',
    Network: 'Network',
} as const;

export type ProviderType = typeof ProviderType[keyof typeof ProviderType];


/**
 * Represents a potential duplicate record with its probability score.
 * Extends CompositeKey to support multi-field primary keys.
 * Used in duplicate detection and record merging operations.
 */
export class PotentialDuplicate extends CompositeKey {
    ProbabilityScore: number;
    /** Full vector metadata snapshot from the vector DB (Name, Description, EntityIcon, etc.) */
    VectorMetadata?: Record<string, string>;
}

/**
 * Configuration options for duplicate detection behavior.
 * Controls retrieval, scoring, hybrid search, and reranking parameters.
 */
export interface DuplicateDetectionOptions {
    /** ID of an existing Duplicate Run record to continue */
    DuplicateRunID?: string;
    /** Number of nearest neighbors to retrieve per record (default: 5) */
    TopK?: number;
    /** Enable post-retrieval reranking via BaseReranker (default: false) */
    ReRankingEnabled?: boolean;
    /** AI Model ID for the reranker; if omitted, uses default reranker */
    ReRankingModelID?: string;
    /** Max candidates to send to reranker per record (default: all retrieved) */
    ReRankingTopK?: number;
    /** Fusion method when combining vector + keyword results (default: 'rrf') */
    FusionMethod?: 'rrf' | 'weighted';
    /** Weight for keyword search in hybrid mode: 0.0 = pure vector, 1.0 = pure keyword (default: 0.3) */
    KeywordSearchWeight?: number;
    /** Enable incremental mode — only check records not in a completed prior run (default: false) */
    IncrementalOnly?: boolean;
    /**
     * Re-vectorize records before detection (default: false).
     * When false, assumes vectors already exist in the index from a prior sync.
     * Set to true to force a fresh vectorization pass before running detection.
     */
    Revectorize?: boolean;
    /** Progress callback invoked at natural milestones during detection */
    OnProgress?: (progress: DuplicateDetectionProgress) => void;
    /**
     * Override the entity document's PotentialMatchThreshold for this run.
     * Value between 0 and 1 (e.g., 0.30 = 30%). If omitted, uses the entity document's value.
     */
    PotentialMatchThreshold?: number;
    /**
     * Override the entity document's AbsoluteMatchThreshold for this run.
     * Value between 0 and 1. If omitted, uses the entity document's value.
     */
    AbsoluteMatchThreshold?: number;
}

/**
 * Progress information emitted during long-running duplicate detection operations.
 */
export interface DuplicateDetectionProgress {
    Phase: 'Vectorizing' | 'Loading' | 'Embedding' | 'Querying' | 'Matching' | 'Merging';
    TotalRecords: number;
    ProcessedRecords: number;
    MatchesFound: number;
    CurrentRecordID?: string;
    ElapsedMs: number;
}

/**
 * Request parameters for finding potential duplicate records.
 * Supports list-based batch detection and single-record checks.
 */
export class PotentialDuplicateRequest {
    /** The ID of the entity the record belongs to */
    EntityID: string;
    /** The ID of the List entity to use for batch detection (optional — if omitted, records are loaded directly from the entity) */
    ListID?: string;
    /** The Primary Key values of each record being checked for duplicates */
    RecordIDs: CompositeKey[];
    /** The ID of the entity document defining the vectorization template */
    EntityDocumentID?: string;
    /** Optional saved view ID — run this view to determine which records to check */
    ViewID?: string;
    /** Optional SQL filter applied to the entity to determine which records to check */
    ExtraFilter?: string;
    /** Minimum score to consider a record a potential duplicate */
    ProbabilityScore?: number;
    /** Detection options controlling retrieval, scoring, and behavior */
    Options?: DuplicateDetectionOptions;
}

/**
 * Result of a potential duplicate search for a single record.
 * Contains the record being checked and all potential duplicates found.
 * Includes match details and duplicate run information for tracking.
 */
export class PotentialDuplicateResult {

    constructor() {
        this.RecordCompositeKey = new CompositeKey();
        this.Duplicates = [];
        this.DuplicateRunDetailMatchRecordIDs = [];
    }

    EntityID: string;
    RecordCompositeKey: CompositeKey;
    Duplicates: PotentialDuplicate[];
    DuplicateRunDetailMatchRecordIDs: string[];

    /**
     * Optional LLM recommendation for this source record's matched set, populated only
     * when the entity has LLM reasoning enabled and the set cleared the reasoning gate.
     * Consulted by the auto-merge step (e.g. AutoMergeAboveAbsolute additionally requires
     * 'Merge'). Undefined means reasoning did not run for this set — the vector-only path
     * applies, byte-for-byte unchanged.
     */
    ReasoningRecommendation?: 'Merge' | 'NotDuplicate' | 'Uncertain';
    /**
     * Optional resolved per-field survivor overrides (literal {FieldName, Value} entries)
     * the LLM proposed for this set, ready to pass straight to Metadata.MergeRecords()'s
     * FieldMap. Populated alongside {@link ReasoningRecommendation}.
     */
    ReasoningFieldMap?: { FieldName: string; Value: unknown }[];
}

/**
 * Response wrapper for potential duplicate searches.
 * Includes status information and array of results.
 * Status can be 'Inprogress' for asynchronous operations, 'Success' when complete, or 'Error' on failure.
 */
export class PotentialDuplicateResponse {
    Status: 'Inprogress' | 'Success' | 'Error';
    ErrorMessage?: string;
    PotentialDuplicateResult: PotentialDuplicateResult[];
}

/**
 * Interface for entity data providers.
 * Defines core CRUD operations and record change tracking.
 * Implementations handle database-specific operations for entity persistence.
 */
export interface IEntityDataProvider {
    Config(configData: ProviderConfigDataBase): Promise<boolean>

    Load(entity: BaseEntity, CompositeKey: CompositeKey, EntityRelationshipsToLoad: string[], user: UserInfo) : Promise<{}>

    Save(entity: BaseEntity, user: UserInfo, options: EntitySaveOptions) : Promise<{}>

    Delete(entity: BaseEntity, options: EntityDeleteOptions, user: UserInfo) : Promise<boolean>

    GetRecordChanges(entityName: string, CompositeKey: CompositeKey): Promise<RecordChange[]>

    /**
     * Discovers which IS-A child entity, if any, has a record with the given primary key.
     * Used by BaseEntity.InitializeChildEntity() after loading a record to find the
     * most-derived child type. Implementations should execute a single UNION ALL query
     * across all child entity tables for efficiency.
     *
     * @param entityInfo The parent entity's EntityInfo (to find its child entity types)
     * @param recordPKValue The primary key value to search for in child tables
     * @param contextUser Optional context user for server-side operations
     * @returns The child entity name if found, or null if no child record exists
     */
    FindISAChildEntity?(entityInfo: EntityInfo, recordPKValue: string, contextUser?: UserInfo): Promise<{ ChildEntityName: string } | null>;

    /**
     * Discovers ALL IS-A child entities that have records with the given primary key.
     * Used for overlapping subtype parents (AllowMultipleSubtypes = true) where multiple
     * children can coexist. Same UNION ALL query as FindISAChildEntity, but returns all matches.
     *
     * @param entityInfo The parent entity's EntityInfo (to find its child entity types)
     * @param recordPKValue The primary key value to search for in child tables
     * @param contextUser Optional context user for server-side operations
     * @returns Array of child entity names found (empty if none)
     */
    FindISAChildEntities?(entityInfo: EntityInfo, recordPKValue: string, contextUser?: UserInfo): Promise<{ ChildEntityName: string }[]>;

    /**
     * Begin an independent provider-level transaction for IS-A chain orchestration.
     * Returns a provider-specific transaction object (e.g., sql.Transaction for SQLServer).
     * Separate from the provider's internal transaction management (TransactionGroup system).
     * Optional — client-side providers (GraphQL) do not implement this.
     */
    BeginISATransaction?(): Promise<unknown>;

    /**
     * Commit an IS-A chain transaction.
     * @param txn The transaction object returned from BeginISATransaction()
     */
    CommitISATransaction?(txn: unknown): Promise<void>;

    /**
     * Rollback an IS-A chain transaction.
     * @param txn The transaction object returned from BeginISATransaction()
     */
    RollbackISATransaction?(txn: unknown): Promise<void>;
}

/**
 * Save options used when saving an entity record.
 * Provides fine-grained control over the save operation including validation,
 * action execution, and conflict detection.
 */
export class EntitySaveOptions {
    /**
     * If set to true, the record will be saved to the database even if nothing is detected to be "dirty" or changed since the prior load.
     */
    IgnoreDirtyState: boolean = false;
    /**
     * If set to true, an AI actions associated with the entity will be skipped during the save operation
     */
    SkipEntityAIActions?: boolean = false;
    /**
     * If set to true, any Entity Actions associated with invocation types of Create or Update will be skipped during the save operation
     */
    SkipEntityActions?: boolean = false;
    /**
     * When set to true, the save operation will BYPASS Validate() and the actual process of saving changes to the database but WILL invoke any associated actions (AI Actions, Entity Actions, etc...)
     * Subclasses can also override the Save() method to provide custom logic that will be invoked when ReplayOnly is set to true
     */
    ReplayOnly?: boolean = false;
    /**
     * Setting this to true means that the system will not look for inconsistency between the state of the record at the time it was loaded and the current database version of the record. This is normally on
     * because it is a good way to prevent overwriting changes made by other users that happened after your version of the record was loaded. However, in some cases, you may want to skip this check, such as when you are
     * updating a record that you know has not been changed by anyone else since you loaded it. In that case, you can set this property to true to skip the check which will be more efficient.
     * * IMPORTANT: This is only used for client-side providers. On server-side providers, this check never occurs because server side operations are as up to date as this check would yield. 
     */
    SkipOldValuesCheck?: boolean = false;
    
    /**
     * When set to true, the entity will skip the asynchronous ValidateAsync() method during save.
     * This is an advanced setting and should only be used when you are sure the async validation is not needed.
     * The default behavior is to run the async validation and the default value is undefined.
     * Also, you can set an Entity level default in a BaseEntity subclass by overriding the DefaultSkipAsyncValidation() getter property.
     * @see BaseEntity.DefaultSkipAsyncValidation
     */
    SkipAsyncValidation?: boolean = undefined;

    /**
     * Optional callback invoked exactly once, *after* all pre-flight checks pass
     * (synchronous `Validate()`, `ValidateAsync()`, and PreSave hooks) but *before* the
     * record is persisted to the database. It receives the entity being saved.
     *
     * This is the framework hook for **optimistic UI**: a UI surface can render the user's
     * change the moment it is known to be valid — without the "render then validation fails
     * then roll back" flicker you get when you render before calling `Save()`. The await on
     * `Save()` is still in place; only the visible render moves earlier.
     *
     * It does **not** fire when the save is skipped (not dirty / `ReplayOnly`) or when validation
     * fails. Any error thrown by the callback is swallowed and logged so a UI bug can never
     * abort the persistence it was meant to accompany. See `guides/OPTIMISTIC_UI_SAVE_PATTERN.md`.
     *
     * Receives the `BaseEntity` being saved (callers typically close over their own entity
     * reference and ignore the parameter).
     */
    OnValidated?: (entity: BaseEntity) => void;

    /**
     * When true, this entity is being saved as part of an IS-A parent chain
     * initiated by a child entity. Provider behavior:
     * - GraphQLDataProvider: full ORM pipeline runs, skip network call
     * - SQLServerDataProvider: real save using shared ProviderTransaction
     */
    IsParentEntitySave?: boolean = false;

    /**
     * The entity name of the child that initiated this parent save in an IS-A chain.
     * Used by server-side providers to skip the active branch when propagating
     * Record Change entries to sibling branches of overlapping parents.
     * Only set when IsParentEntitySave is true.
     */
    ISAActiveChildEntityName?: string;
}

/**
 * Options used when deleting an entity record.
 * Controls whether associated actions and AI operations should be executed
 * during the deletion process.
 */
export class EntityDeleteOptions {
    /**
     * If set to true, an AI actions associated with the entity will be skipped during the delete operation
     */
    SkipEntityAIActions?: boolean = false;

    /**
     * If set to true, any Entity Actions associated with invocation types of Delete will be skipped during the delete operation
     */
    SkipEntityActions?: boolean = false;

    /**
     * When set to true, the save operation will BYPASS Validate() and the actual process of deleting the record from the database but WILL invoke any associated actions (AI Actions, Entity Actions, etc...)
     * Subclasses can also override the Delete() method to provide custom logic that will be invoked when ReplayOnly is set to true
     */
    ReplayOnly?: boolean = false;

    /**
     * When true, this entity is being deleted as part of an IS-A parent chain
     * initiated by a child entity. The child deletes itself first (FK constraint),
     * then cascades deletion to its parent.
     */
    IsParentEntityDelete?: boolean = false;
}

/**
 * Options used when merging entity records.
 * Controls transaction isolation and other merge-specific behaviors.
 */
export class EntityMergeOptions {
    // nothing here yet, define for future use
}

/**
 * Input parameters for retrieving entity record names.
 * Used for batch operations to get display names for multiple records.
 */
export class EntityRecordNameInput  {
    EntityName: string;
    CompositeKey: CompositeKey;
}

/**
 * Result of an entity record name lookup operation.
 * Contains the display name and status information for the requested record.
 */
export class EntityRecordNameResult  {
    Success: boolean;
    Status: string;
    CompositeKey: CompositeKey
    EntityName: string;
    RecordName?: string;
 }

/**
 * Interface for local storage providers.
 * Abstracts storage operations to support different storage backends
 * (e.g., browser localStorage, IndexedDB, file system).
 *
 * Implementations should handle the optional category parameter as follows:
 * - **IndexedDB**: Create separate object stores per category (e.g., `mj:RunViewCache`)
 * - **localStorage**: Prefix keys with `[mj]:[category]:[key]`
 * - **Memory**: Use nested Map structure (Map<category, Map<key, value>>)
 *
 * When category is not provided, use a default category (e.g., 'default' or 'general').
 */
export interface ILocalStorageProvider {
    /**
     * Retrieves a value from storage. The implementation is responsible for any
     * deserialization required by the underlying medium:
     *  - **IndexedDB**: returns the value directly via structured clone (Date/Map/Set/typed arrays preserved, no parse needed)
     *  - **localStorage / Redis**: deserializes from JSON internally
     *  - **In-memory**: returns the stored reference
     *
     * Returns `null` for missing keys or corrupt entries.
     *
     * @typeParam T - Expected type of the stored value. Caller-controlled — the provider does
     *                not validate the runtime shape against this type. Falls back to `unknown`.
     * @param key - The key to retrieve
     * @param category - Optional category for key isolation (e.g., 'RunViewCache', 'Metadata')
     */
    GetItem<T = unknown>(key: string, category?: string): Promise<T | null>;

    /**
     * Batched retrieval — reads N values for N keys in one logical operation.
     *
     * Returns a `Map` keyed by the input key strings. Missing keys map to `null`.
     * The map preserves the original key set so callers can index by key without
     * relying on array-position alignment.
     *
     * **Why batch?** IndexedDB serializes transactions on the same object store —
     * `Promise.all([...N GetItem calls])` looks parallel but pays per-transaction
     * setup cost (~3–10ms each) for every key. A single transaction with N
     * `get()` calls amortizes that overhead. Redis can use `MGET`/pipelines.
     * In-memory implementations have no real win but implement consistently for
     * a uniform API.
     *
     * Implementations are free to fall back to per-key reads internally if the
     * underlying medium doesn't support batching — the contract is just "read
     * all of these as efficiently as you can". An empty `keys` array returns
     * an empty map without touching the storage backend.
     *
     * @typeParam T - Expected type of all stored values. Caller-controlled.
     * @param keys - The keys to retrieve. Duplicates are deduplicated; the
     *               returned map has one entry per unique key.
     * @param category - Optional category for key isolation (applies to all keys)
     */
    GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>>;

    /**
     * Stores a value. Callers should pass plain data (objects/arrays/primitives/Date/etc).
     * Implementations handle any serialization required by the medium:
     *  - **IndexedDB**: stores natively via structured clone (no string conversion)
     *  - **localStorage / Redis**: serializes to JSON internally
     *  - **In-memory**: stores the reference directly
     *
     * **Class instances lose their prototype on retrieval** — store the underlying data
     * (e.g. via `entity.GetAll()`) and reconstruct on read if needed.
     *
     * @typeParam T - Type of the value being stored. Caller-controlled.
     * @param key - The key to store under
     * @param value - The value to store
     * @param category - Optional category for key isolation
     */
    SetItem<T>(key: string, value: T, category?: string): Promise<void>;

    /**
     * Removes an item from storage.
     * @param key - The key to remove
     * @param category - Optional category for key isolation
     */
    Remove(key: string, category?: string): Promise<void>;

    /**
     * Clears all items in a specific category.
     * If no category is specified, clears the default category only.
     * @param category - The category to clear
     */
    ClearCategory?(category: string): Promise<void>;

    /**
     * Gets all keys in a specific category.
     * @param category - The category to list keys from
     */
    GetCategoryKeys?(category: string): Promise<string[]>;
}

/**
 * Provider interface for filesystem operations.
 * Enables environment-specific file I/O without requiring `eval("require('fs')")` or other
 * bundler-unfriendly patterns. Server-side providers (e.g. SQLServerDataProvider) supply a
 * Node.js implementation; browser-side providers return null from IMetadataProvider.FileSystemProvider.
 *
 * Follows the same pattern as ILocalStorageProvider — defined in core, implemented per environment.
 */
export interface IFileSystemProvider {
    /**
     * Appends content to a file, creating it if it doesn't exist.
     * @param filePath - Full path to the file
     * @param content - Content to append
     */
    AppendToFile(filePath: string, content: string): Promise<void>;

    /**
     * Writes content to a file, overwriting if it exists.
     * @param filePath - Full path to the file
     * @param content - Content to write
     */
    WriteFile(filePath: string, content: string): Promise<void>;

    /**
     * Reads content from a file.
     * @param filePath - Full path to the file
     * @returns File content or null if file doesn't exist
     */
    ReadFile(filePath: string): Promise<string | null>;

    /**
     * Checks if a file exists.
     * @param filePath - Full path to the file
     */
    FileExists(filePath: string): Promise<boolean>;
}

/**
 * Core interface for metadata providers in MemberJunction.
 * Provides access to all system metadata including entities, applications, security, and queries.
 * This is the primary interface for accessing MemberJunction's metadata layer.
 * Implementations typically cache metadata locally for performance.
 */
export interface IMetadataProvider {
    get ProviderType(): ProviderType

    get DatabaseConnection(): any

    /**
     * A stable string that uniquely identifies the underlying connection this provider points to
     * (host/port/database/endpoint — never credentials). Two providers pointing at the same
     * connection should return the same value. Used by BaseEngine to key its per-connection engine
     * instance cache so transient per-request providers don't pollute the cache; same-connection
     * lookups share one cached engine.
     */
    get InstanceConnectionString(): string

    Config(configData: ProviderConfigDataBase, providerToUse?: IMetadataProvider): Promise<boolean>

    get Entities(): EntityInfo[]

    /**
     * O(1) entity lookup by name (case-insensitive, trimmed).
     * Falls back to linear search if the internal Map hasn't been built yet.
     */
    EntityByName(entityName: string): EntityInfo | undefined

    /**
     * O(1) entity lookup by ID (UUID-normalized).
     * Falls back to linear search if the internal Map hasn't been built yet.
     */
    EntityByID(entityID: string): EntityInfo | undefined

    get Applications(): ApplicationInfo[]

    get CurrentUser(): UserInfo

    get Roles(): RoleInfo[]

    get RowLevelSecurityFilters(): RowLevelSecurityFilterInfo[]

    get AuditLogTypes(): AuditLogTypeInfo[]

    get Authorizations(): AuthorizationInfo[]

    /**
     * Flat collection of all authorization-role assignments.
     * Consumed by `AuthorizationInfo.Roles` for lazy per-auth filtering.
     */
    get AuthorizationRoles(): AuthorizationRoleInfo[]

    /** @deprecated Use `QueryEngine.Instance.Queries` from `@memberjunction/core-entities` instead. */
    get Queries(): QueryInfo[]
    /** @deprecated Use `QueryEngine.Instance.Fields` from `@memberjunction/core-entities` instead. */
    get QueryFields(): QueryFieldInfo[]
    /** @deprecated Use `QueryEngine.Instance.Categories` from `@memberjunction/core-entities` instead. */
    get QueryCategories(): QueryCategoryInfo[]
    /** @deprecated Use `QueryEngine.Instance.Permissions` from `@memberjunction/core-entities` instead. */
    get QueryPermissions(): QueryPermissionInfo[]
    /** @deprecated Use `QueryEngine.Instance.QueryEntities` from `@memberjunction/core-entities` instead. */
    get QueryEntities(): QueryEntityInfo[]
    /** @deprecated Use `QueryEngine.Instance.Parameters` from `@memberjunction/core-entities` instead. */
    get QueryParameters(): QueryParameterInfo[]
    /** @deprecated Use `QueryEngine.Instance.Dependencies` from `@memberjunction/core-entities` instead. */
    get QueryDependencies(): QueryDependencyInfo[]
    /** @deprecated Use `QueryEngine.Instance.SQLDialects` from `@memberjunction/core-entities` instead. */
    get SQLDialects(): SQLDialectInfo[]
    /** @deprecated Use `QueryEngine.Instance.QuerySQLs` from `@memberjunction/core-entities` instead. */
    get QuerySQLs(): QuerySQLInfo[]

    get Libraries(): LibraryInfo[]

    get VisibleExplorerNavigationItems(): ExplorerNavigationItem[]

    get AllExplorerNavigationItems(): ExplorerNavigationItem[]

    get LatestRemoteMetadata(): MetadataInfo[]

    get LatestLocalMetadata(): MetadataInfo[]

    get AllMetadata(): AllMetadata

    LocalMetadataObsolete(type?: string): boolean

    /**
     * Creates a new instance of a BaseEntity subclass for the specified entity and calls NewRecord() to initialize it.
     * The UUID will be automatically generated for non-auto-increment uniqueidentifier primary keys.
     * @param entityName - The name of the entity to create (e.g., "Users", "Customers")
     * @param contextUser - Optional context user for permissions (mainly used server-side)
     * @returns Promise resolving to the newly created entity instance with NewRecord() already called
     */
    GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>
    
    /**
     * Creates a new instance of a BaseEntity subclass and loads an existing record using the provided key.
     * @param entityName - The name of the entity to create (e.g., "Users", "Customers")
     * @param loadKey - CompositeKey containing the primary key value(s) to load
     * @param contextUser - Optional context user for permissions (mainly used server-side)
     * @returns Promise resolving to the entity instance with the specified record loaded
     * @throws Error if the record cannot be found or loaded
     */
    GetEntityObject<T extends BaseEntity>(entityName: string, loadKey: CompositeKey, contextUser?: UserInfo): Promise<T>
    /**
     * Returns a list of dependencies - records that are linked to the specified Entity/RecordID combination. A dependency is as defined by the relationships in the database. The MemberJunction metadata that is used
     * for this simply reflects the foreign key relationships that exist in the database. The CodeGen tool is what detects all of the relationships and generates the metadata that is used by MemberJunction. The metadata in question
     * is within the EntityField table and specifically the RelatedEntity and RelatedEntityField columns. In turn, this method uses that metadata and queries the database to determine the dependencies. To get the list of entity dependencies
     * you can use the utility method GetEntityDependencies(), which doesn't check for dependencies on a specific record, but rather gets the metadata in one shot that can be used for dependency checking.
     * @param entityName the name of the entity to check
     * @param CompositeKey the compositeKey for the record to check
     */
    GetRecordDependencies(entityName: string, CompositeKey: CompositeKey): Promise<RecordDependency[]>  

    /**
     * Returns a list of record IDs that are possible duplicates of the specified record. 
     * 
     * @param params Object containing many properties used in fetching records and determining which ones to return
     */
    GetRecordDuplicates(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse>

    /**
     * Returns a list of entity dependencies, basically metadata that tells you the links to this entity from all other entities.
     * @param entityName 
     * @returns 
     */
    GetEntityDependencies(entityName: string): Promise<EntityDependency[]> 

    /**
     * This method will merge two or more records based on the request provided. The RecordMergeRequest type you pass in specifies the record that will survive the merge, the records to merge into the surviving record, and an optional field map that can update values in the surviving record, if desired. The process followed is:
     * 1. A transaction is started
     * 2. The surviving record is loaded and fields are updated from the field map, if provided, and the record is saved. If a FieldMap not provided within the request object, this step is skipped.
     * 3. For each of the records that will be merged INTO the surviving record, we call the GetEntityDependencies() method and get a list of all other records in the database are linked to the record to be deleted. We then go through each of those dependencies and update the link to point to the SurvivingRecordID and save the record.
     * 4. The record to be deleted is then deleted.
     * 5. The transaction is committed if all of the above steps are succesful, otherwise it is rolled back.
     * 
     * The return value from this method contains detailed information about the execution of the process. In addition, all attempted merges are logged in the RecordMergeLog and RecordMergeDeletionLog tables.
     * 
     * @param request 
     * @returns 
     */
    MergeRecords(request: RecordMergeRequest, contextUser?: UserInfo, options?: EntityMergeOptions): Promise<RecordMergeResult> 


    /**
     * Returns the Name of the specific recordId for a given entityName. This is done by
     * looking for the IsNameField within the EntityFields collection for a given entity.
     * If no IsNameField is found, but a field called "Name" exists, that value is returned. Otherwise null returned
     * @param entityName
     * @param CompositeKey
     * @param contextUser - optional user context for permissions
     * @param forceRefresh - if true, bypasses cache and fetches fresh from database
     * @returns the name of the record
     */
    GetEntityRecordName(entityName: string, compositeKey: CompositeKey, contextUser?: UserInfo, forceRefresh?: boolean): Promise<string>

    /**
     * Returns one or more record names using the same logic as GetEntityRecordName, but for multiple records at once - more efficient to use this method if you need to get multiple record names at once
     * @param info
     * @param contextUser - optional user context for permissions
     * @param forceRefresh - if true, bypasses cache and fetches fresh from database
     * @returns an array of EntityRecordNameResult objects
     */
    GetEntityRecordNames(info: EntityRecordNameInput[], contextUser?: UserInfo, forceRefresh?: boolean): Promise<EntityRecordNameResult[]>

    /**
     * Asynchronous lookup of a cached entity record name. Returns the cached name if available, or undefined if not cached.
     * Use this for synchronous contexts (like template rendering) where you can't await GetEntityRecordName().
     * @param entityName - The name of the entity
     * @param compositeKey - The primary key value(s) for the record
     * @param loadIfNeeded - If set to true, will load from database if not already cached
     * @returns The cached display name, or undefined if not in cache
     */
    GetCachedRecordName(entityName: string, compositeKey: CompositeKey, loadIfNeeded?: boolean): Promise<string | undefined>;

    /**
     * Stores a record name in the cache for later synchronous retrieval via GetCachedRecordName().
     * Called automatically by BaseEntity after Load(), LoadFromData(), and Save() operations.
     * @param entityName - The name of the entity
     * @param compositeKey - The primary key value(s) for the record
     * @param recordName - The display name to cache
     */
    SetCachedRecordName(entityName: string, compositeKey: CompositeKey, recordName: string): void

    GetRecordFavoriteStatus(userId: string, entityName: string, CompositeKey: CompositeKey, contextUser?: UserInfo): Promise<boolean>

    SetRecordFavoriteStatus(userId: string, entityName: string, CompositeKey: CompositeKey, isFavorite: boolean, contextUser: UserInfo): Promise<void>

    CreateTransactionGroup(): Promise<TransactionGroupBase>

    Refresh(providerToUse?: IMetadataProvider): Promise<boolean>

    RefreshIfNeeded(providerToUse?: IMetadataProvider): Promise<boolean>

    CheckToSeeIfRefreshNeeded(providerToUse?: IMetadataProvider): Promise<boolean>

    get LocalStorageProvider(): ILocalStorageProvider

    /**
     * Returns the filesystem provider for the current environment, or null if filesystem
     * operations are not available (e.g. in browser environments).
     * Server-side providers should return a NodeFileSystemProvider instance.
     */
    get FileSystemProvider(): IFileSystemProvider | null

    RefreshRemoteMetadataTimestamps(providerToUse?: IMetadataProvider): Promise<boolean>

    SaveLocalMetadataToStorage(): Promise<void>
    
    RemoveLocalMetadataFromStorage(): Promise<void>

    /**
     * Retrieves a dataset by name. When `forceRefresh` is true, bypasses any in-memory or local cache
     * and fetches directly from the database. When false (default), server-side providers may serve
     * from LocalCacheManager if `TrustLocalCacheCompletely` is true.
     * @param datasetName
     * @param itemFilters
     * @param contextUser
     * @param providerToUse
     * @param forceRefresh When true, bypasses all caching and fetches fresh data from the database
     */
    GetDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo, providerToUse?: IMetadataProvider, forceRefresh?: boolean): Promise<DatasetResultType>;
    /**
     * Retrieves the date status information for a dataset and all its items from the server. This method will match the datasetName and itemFilters to the server's dataset and item filters to determine a match
     * @param datasetName 
     * @param itemFilters 
     */
    GetDatasetStatusByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo, providerToUse?: IMetadataProvider): Promise<DatasetStatusResultType>;

    /**
     * Gets a database by name, if required, and caches it in a format available to the client (e.g. IndexedDB, LocalStorage, File, etc). The cache method is Provider specific
     * If itemFilters are provided, the combination of datasetName and the filters are used to determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     */
    GetAndCacheDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo): Promise<DatasetResultType>  

    /**
     * Returns the timestamp of the local cached version of a given datasetName or null if there is no local cache for the 
     * specified dataset
     * @param datasetName the name of the dataset to check
     * @param itemFilters optional filters to apply to the dataset
     */
    GetLocalDatasetTimestamp(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<Date>

    /**
     * This routine checks to see if the local cache version of a given datasetName/itemFilters combination is up to date with the server or not
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    IsDatasetCacheUpToDate(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<boolean> 

    /**
     * This routine gets the local cached version of a given datasetName/itemFilters combination, it does NOT check the server status first. 
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    GetCachedDataset(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetResultType> 

    /**
     * Stores a dataset in the local cache. If itemFilters are provided, the combination of datasetName and the filters are used to build a key and determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     * @param dataset 
     */
    CacheDataset(datasetName: string, itemFilters: DatasetItemFilterType[], dataset: DatasetResultType): Promise<void> 

    /**
     * Determines if a given datasetName/itemFilters combination is cached locally or not
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    IsDatasetCached(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<boolean> 

    /**
     * Creates a key for the given datasetName and itemFilters combination
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    GetDatasetCacheKey(datasetName: string, itemFilters?: DatasetItemFilterType[]): string 

    /**
     * If the specified datasetName is cached, this method will clear the cache. If itemFilters are provided, the combination of datasetName and the filters are used to determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     */
    ClearDatasetCache(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<void> 

    /**
     * Provides access the configuration object that was initially provided to configure the provider
     */
    get ConfigData(): ProviderConfigDataBase
}

/**
 * Single aggregate result value - can be a number, string, Date, boolean, or null
 */
export type AggregateValue = number | string | Date | boolean | null;

/**
 * Result of a single aggregate expression calculation
 */
export interface AggregateResult {
    /** The expression that was calculated */
    expression: string;
    /** The alias (or expression if no alias provided) */
    alias: string;
    /** The calculated value */
    value: AggregateValue;
    /** If calculation failed, the error message */
    error?: string;
}

/**
 * Result of a RunView() execution.
 * Contains the query results along with execution metadata like timing,
 * row counts, and error information.
 */
export type RunViewResult<T = any> = {
    /**
     * Was the view run successful or not
     */
    Success: boolean;
    /**
     * The array of records returned by the view, only valid if Success is true
     */
    Results: Array<T>;
    /**
     * The newly created UserViews.ID value - only provided if RunViewParams.SaveViewResults=true
     */
    UserViewRunID?: string;
    /**
     * Number of rows returned in the Results[] array
     */
    RowCount: number;
    /**
     * Total number of rows that match the view criteria, not just the number returned in the Results[] array
     * This number will only be different when the view is configured to have a UserViewMaxRows value and the criteria of the view in question
     * has more than that # of rows. Otherwise it will be the same value as RowCount.
     */
    TotalRowCount: number;
    /**
     * Time elapsed in executing the view (in milliseconds)
     */
    ExecutionTime: number;
    /**
     * If Success is false, this will contain a message describing the error condition.
     */
    ErrorMessage: string;

    /**
     * Results of aggregate calculations, in same order as input Aggregates array.
     * Only present if Aggregates were requested in RunViewParams.
     */
    AggregateResults?: AggregateResult[];

    /**
     * Execution time for aggregate query specifically (in milliseconds).
     * Only present if Aggregates were requested.
     */
    AggregateExecutionTime?: number;

    /**
     * If an `OnDataChanged` callback was provided in {@link RunViewParams}, this function
     * unregisters that callback. Call this during cleanup (e.g., Angular `ngOnDestroy`,
     * React effect cleanup) to prevent memory leaks.
     *
     * For long-lived callers like engines, this is typically not needed — the callback
     * persists for the process lifetime.
     *
     * @example
     * ```typescript
     * const result = await rv.RunView({ EntityName: 'Users', OnDataChanged: (e) => { ... } });
     * // Later:
     * result.Unsubscribe?.();
     * ```
     */
    Unsubscribe?: () => void;
}

/**
 * Interface for providers that execute views.
 * Supports parameterized view execution with filtering and pagination.
 * Views are the primary way to query entity data in MemberJunction.
 */
export interface IRunViewProvider {
    Config(configData: ProviderConfigDataBase): Promise<boolean>

    RunView<T = any>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>>
    RunViews<T = any>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]>

    /**
     * Executes multiple RunView requests with smart cache checking.
     * For each view with cacheStatus provided, the server checks if the cached data is still current
     * before executing the full query. This reduces unnecessary data transfer when cached data is valid.
     * @param params Array of view parameters with optional cache status for each
     * @param contextUser Optional user context for permissions
     * @returns Response containing status and fresh data only for stale caches
     */
    RunViewsWithCacheCheck?<T = unknown>(params: RunViewWithCacheCheckParams[], contextUser?: UserInfo): Promise<RunViewsWithCacheCheckResponse<T>>

    /**
     * Performs a full-text search across all entities that have FullTextSearchEnabled=true in their metadata.
     * Uses the database-native full-text search capabilities (SQL Server FREETEXT via CodeGen-generated functions,
     * PostgreSQL tsvector/GIN indexes, etc.) through the existing RunView + UserSearchString infrastructure.
     *
     * @param params Search parameters including the search text and optional entity name filter
     * @param contextUser Optional user context for permissions and row-level security
     * @returns Array of search results grouped by entity, with title, snippet, and relevance score
     *
     * @see {@link FullTextSearchParams} for parameter details
     * @see {@link FullTextSearchResult} for result structure
     * @see /packages/MJCore/docs/FULL_TEXT_SEARCH_GUIDE.md for comprehensive documentation
     */
    FullTextSearch(params: FullTextSearchParams, contextUser?: UserInfo): Promise<FullTextSearchResult>

    /**
     * Ranked search over **one** entity's records, blending lexical name/text-field
     * matching with semantic embedding cosine. Results are post-filtered by the
     * caller's row-level read permissions on that entity.
     *
     * ## How this differs from the other lookups on `IMetadataProvider`
     *
     * | Method | Purpose |
     * |---|---|
     * | {@link EntityByName} / {@link EntityByID} | Look up an entity **definition** by name or ID. Deterministic, not ranked, returns `EntityInfo`. |
     * | {@link FullTextSearch} | Server-side text search across one or many entities using each entity's `UserSearchString` rule (DB-level LIKE / FTS). Returns flat per-entity result groups, no semantic ranking. |
     * | **`SearchEntity`** (this) | Hybrid lexical-plus-semantic ranking of records **inside one entity**, backed by an `EntityDocument`-driven vector index. Use when you need "the N most relevant records of this entity for the user's free-text request". |
     * | {@link SearchEntities} | Batch form — runs `SearchEntity` over many entities in one round-trip. |
     *
     * Semantic ranking requires an Active `EntityDocument` of type `Search`
     * registered for the target entity (see `/metadata/entity-documents/` for
     * the seeded one against `MJ: Entities`); without it, `mode: 'semantic'`
     * returns no rows and `mode: 'hybrid'` degrades to lexical-only.
     *
     * @param params Target entity name, search text, and optional ranking knobs.
     * @returns Ranked `EntitySearchResult[]` — descending by score, sliced to `topK`.
     */
    SearchEntity(params: SearchEntityParams): Promise<EntitySearchResult[]>

    /**
     * Batch form of {@link SearchEntity}. Runs the per-entity ranking against
     * **many** entities in one call. Transports as a single JSON payload in both
     * directions over GraphQL when invoked through `GraphQLDataProvider`, so
     * N entity searches cost one round-trip instead of N.
     *
     * Server-side providers fan the call out via `Promise.all` to independent
     * `SearchEntity` invocations — each entity's lexical pass, semantic pass,
     * blending, and permission filter run independently, and the per-entity
     * result arrays come back aligned by input order.
     *
     * Use this whenever an agent or workflow needs ranked results from more
     * than one entity for the same user request (e.g., "find anything
     * relevant to 'overdue payments'" across Invoices, Customers, and Notes).
     *
     * @param params One `SearchEntityParams` per target entity.
     * @returns Array of result arrays, aligned by input order — `result[i]`
     *          holds the ranked matches for `params[i]`.
     */
    SearchEntities(params: SearchEntityParams[]): Promise<EntitySearchResult[][]>
}

/**
 * Per-entity input for {@link IMetadataProvider.SearchEntity} and
 * {@link IMetadataProvider.SearchEntities}. Bundles the entity name, the
 * search text, and the ranking options into a single transport-friendly
 * shape so batched calls fit one GraphQL payload.
 */
export type SearchEntityParams = {
    /** Name of the entity to search (e.g., `'MJ: Entities'`, `'Accounts'`). */
    entityName: string;
    /** Free-text query. Empty/whitespace returns an empty result. */
    searchText: string;
    /** Ranking mode + knobs. See {@link SearchEntitiesOptions}. */
    options?: SearchEntitiesOptions;
};

/**
 * Options for {@link IMetadataProvider.SearchEntity} / {@link IMetadataProvider.SearchEntities}.
 */
export type SearchEntitiesOptions = {
    /**
     * Ranking strategy:
     * - `'lexical'`: name-field substring / prefix matching only.
     * - `'semantic'`: vector cosine against the EntityDocument-backed index.
     * - `'hybrid'`: weighted RRF blend of the two. **Default.**
     */
    mode?: 'lexical' | 'semantic' | 'hybrid';

    /** RRF smoothing constant. Default: 60 (paper standard). */
    rrfK?: number;

    /** Per-list weights for hybrid mode. Default: `{ lexical: 1.0, semantic: 1.0 }`. */
    weights?: { lexical?: number; semantic?: number };

    /** Maximum results to return after filtering. Default: 10. */
    topK?: number;

    /** Drop results below this final blended score. Default: 0. */
    minScore?: number;

    /**
     * Override which EntityDocument to use. Defaults to the active Search-category
     * EntityDocument registered for the entity.
     */
    entityDocumentId?: string;

    /** Context user for permission filtering and embedding-model lookup. */
    contextUser?: UserInfo;
};

/**
 * One ranked result from {@link IMetadataProvider.SearchEntity}.
 */
export type EntitySearchResult = {
    /** Pointer to the matching `EntityRecordDocument` row. Null when result came purely from the lexical pass. */
    entityRecordDocumentId: string | null;
    /** Record ID within the target entity (suitable for `Load()` on the entity object). */
    recordId: string;
    /** Final blended/single-mode score. */
    score: number;
    /** Which signal(s) contributed. */
    matchType: 'lexical' | 'semantic' | 'hybrid';
    /** Raw per-list scores, for callers that want to audit or re-rank. */
    components: {
        lexical?: number;
        semantic?: number;
    };
};

// ============================================================================
// FULL-TEXT SEARCH TYPES
// ============================================================================

/**
 * Parameters for the FullTextSearch method.
 */
export type FullTextSearchParams = {
    /**
     * The search text to find across entities. This is passed as UserSearchString to RunView,
     * which routes it through the database-native full-text search infrastructure
     * (SQL Server FREETEXT functions or PostgreSQL tsvector queries).
     */
    SearchText: string;

    /**
     * Optional list of entity names to restrict the search to. Each entity in this list
     * MUST have FullTextSearchEnabled=true — entities without FTS enabled will be silently skipped.
     * If not provided, ALL entities with FullTextSearchEnabled=true are searched.
     */
    EntityNames?: string[];

    /**
     * Maximum number of rows to return per entity. Defaults to 10 if not specified.
     * Helps control result set size when searching across many entities.
     */
    MaxRowsPerEntity?: number;
}

/**
 * A single matched record from a full-text search.
 */
export type FullTextSearchResultItem = {
    /**
     * The name of the entity this result came from (e.g., "MJ: AI Models")
     */
    EntityName: string;

    /**
     * The primary key value of the matched record
     */
    RecordID: string;

    /**
     * The display title for this result, sourced from the entity's best "name" field
     * (Name, Title, Subject, etc.)
     */
    Title: string;

    /**
     * A text snippet providing context for the match, sourced from the entity's best
     * "description" field (Description, Summary, Body, etc.). Truncated to ~200 chars.
     */
    Snippet: string;

    /**
     * Relevance score for ranking. Uses rank-based scoring (1/(rank+1)) to be
     * compatible with Reciprocal Rank Fusion (RRF) when combined with vector search results.
     */
    Score: number;
}

/**
 * Result of a FullTextSearch operation across multiple entities.
 */
export type FullTextSearchResult = {
    /**
     * Whether the search completed successfully
     */
    Success: boolean;

    /**
     * Error message if Success is false
     */
    ErrorMessage?: string;

    /**
     * All matched records across all searched entities, ordered by relevance score descending
     */
    Results: FullTextSearchResultItem[];

    /**
     * Total number of results found
     */
    TotalCount: number;

    /**
     * Number of entities that were searched
     */
    EntitiesSearched: number;

    /**
     * Time taken to execute the search in milliseconds
     */
    ElapsedMs: number;
}

// ============================================================================
// RUNVIEW SMART CACHE CHECK TYPES
// ============================================================================

/**
 * Client-side cache status information for a single RunView request.
 * Sent to the server to determine if cached data is still current.
 */
export type RunViewCacheStatus = {
    /**
     * The maximum __mj_UpdatedAt value from the client's cached results.
     * Used to detect if any records have been added or updated.
     */
    maxUpdatedAt: string;
    /**
     * The number of rows in the client's cached results.
     * Used to detect if any records have been deleted.
     */
    rowCount: number;
}

/**
 * Parameters for a single RunView request with optional cache status.
 * When cacheStatus is provided, the server will check if the cache is current
 * before executing the full query.
 */
export type RunViewWithCacheCheckParams = {
    /**
     * The standard RunView parameters
     */
    params: RunViewParams;
    /**
     * Optional cache status from the client. If provided, the server will
     * check if the cached data is still current before returning results.
     * If not provided, the server will always execute the query.
     */
    cacheStatus?: RunViewCacheStatus;
}

/**
 * Differential update data containing only changes since the client's cached state.
 * Used to efficiently update client caches without transferring the entire dataset.
 */
export type DifferentialData<T = unknown> = {
    /**
     * Records that have been created or updated since the client's maxUpdatedAt.
     * These should be merged into the client's cache, replacing any existing records with the same primary key.
     */
    updatedRows: T[];
    /**
     * Primary key values (as concatenated strings) of records that have been deleted.
     * Format uses CompositeKey.ToConcatenatedString() - e.g., "ID|abc123" or "Field1|val1||Field2|val2"
     * These should be removed from the client's cache.
     */
    deletedRecordIDs: string[];
}

/**
 * Result for a single RunView with cache check.
 * The server returns 'current' (cache valid), 'differential' (partial update), or 'stale' (full refresh needed).
 */
export type RunViewWithCacheCheckResult<T = unknown> = {
    /**
     * The index of this view in the batch request (for correlation)
     */
    viewIndex: number;
    /**
     * 'current' means the client's cache is still valid - no data returned
     * 'differential' means only changes are returned - client should merge with existing cache
     * 'stale' means full refresh is needed - fresh data is included in results (fallback when entity doesn't track changes)
     * 'error' means there was an error checking/executing the view
     */
    status: 'current' | 'differential' | 'stale' | 'error';
    /**
     * The fresh results - only populated when status is 'stale' (full refresh)
     */
    results?: T[];
    /**
     * Differential update data - only populated when status is 'differential'
     * Contains updated/created rows and deleted record IDs since client's maxUpdatedAt
     */
    differentialData?: DifferentialData<T>;
    /**
     * The maximum __mj_UpdatedAt from the results - populated when status is 'stale' or 'differential'
     */
    maxUpdatedAt?: string;
    /**
     * The row count of the results - populated when status is 'stale' or 'differential'
     * For 'differential', this is the NEW total row count after applying the delta
     */
    rowCount?: number;
    /**
     * Error message if status is 'error'
     */
    errorMessage?: string;
    /**
     * Aggregate results - populated when status is 'stale' or 'differential' and aggregates were requested.
     * For 'differential', aggregates are always re-computed fresh (can't be incrementally updated).
     */
    aggregateResults?: AggregateResult[];
}

/**
 * Response from RunViewsWithCacheCheck - contains results for each view in the batch
 */
export type RunViewsWithCacheCheckResponse<T = unknown> = {
    /**
     * Whether the overall operation succeeded
     */
    success: boolean;
    /**
     * Results for each view in the batch, in the same order as the input
     */
    results: RunViewWithCacheCheckResult<T>[];
    /**
     * Overall error message if success is false
     */
    errorMessage?: string;
}

/**
 * Result of executing a saved query.
 * Contains the query results and execution metadata.
 */
export type RunQueryResult = {
    QueryID: string;
    QueryName: string;
    Success: boolean;
    Results: any[];
    RowCount: number;
    /**
     * Total number of rows that would be returned without pagination.
     * Only differs from RowCount when StartRow or MaxRows are used.
     */
    TotalRowCount: number;
    /**
     * The page number returned (1-based). Derived from StartRow and MaxRows.
     * Undefined when paging is not active.
     */
    PageNumber?: number;
    /**
     * The page size used for this result.
     * Undefined when paging is not active.
     */
    PageSize?: number;
    ExecutionTime: number;
    ErrorMessage: string;
    /**
     * Parameters that were applied to the query, including defaults
     */
    AppliedParameters?: Record<string, any>;
    /**
     * Whether this result was served from cache
     */
    CacheHit?: boolean;
    /**
     * Cache key used for this query
     */
    CacheKey?: string;
    /**
     * Time until cache expiration in milliseconds
     */
    CacheTTLRemaining?: number;
}

// ============================================================================
// RUNQUERY SMART CACHE CHECK TYPES
// ============================================================================

/**
 * Client-side cache status information for a single RunQuery request.
 * Sent to the server to determine if cached data is still current.
 * Uses fingerprint data (maxUpdatedAt + rowCount) for efficient cache validation.
 */
export type RunQueryCacheStatus = {
    /**
     * The maximum __mj_UpdatedAt value from the client's cached results.
     * Used to detect if any records have been added or updated.
     */
    maxUpdatedAt: string;
    /**
     * The number of rows in the client's cached results.
     * Used to detect if any records have been deleted.
     */
    rowCount: number;
}

/**
 * Parameters for a single RunQuery request with optional cache status.
 * When cacheStatus is provided, the server will check if the cache is current
 * before executing the full query.
 */
export type RunQueryWithCacheCheckParams = {
    /**
     * The standard RunQuery parameters
     */
    params: RunQueryParams;
    /**
     * Optional cache status from the client. If provided, the server will
     * use the Query's CacheValidationSQL to check if cached data is still current.
     * If not provided, the server will always execute the query.
     */
    cacheStatus?: RunQueryCacheStatus;
}

/**
 * Result for a single RunQuery with cache check.
 * The server returns either 'current' (cache is valid) or 'stale' (with fresh data).
 */
export type RunQueryWithCacheCheckResult<T = unknown> = {
    /**
     * The index of this query in the batch request (for correlation)
     */
    queryIndex: number;
    /**
     * The query ID for reference
     */
    queryId: string;
    /**
     * 'current' means the client's cache is still valid - no data returned
     * 'stale' means the cache is outdated - fresh data is included in results
     * 'error' means there was an error checking/executing the query
     * 'no_validation' means the query doesn't have CacheValidationSQL configured
     */
    status: 'current' | 'stale' | 'error' | 'no_validation';
    /**
     * The fresh results - only populated when status is 'stale' or 'no_validation'
     */
    results?: T[];
    /**
     * The maximum __mj_UpdatedAt from the results - only when status is 'stale'
     */
    maxUpdatedAt?: string;
    /**
     * The row count of the results - only when status is 'stale'
     */
    rowCount?: number;
    /**
     * Error message if status is 'error'
     */
    errorMessage?: string;
}

/**
 * Response from RunQueriesWithCacheCheck - contains results for each query in the batch
 */
export type RunQueriesWithCacheCheckResponse<T = unknown> = {
    /**
     * Whether the overall operation succeeded
     */
    success: boolean;
    /**
     * Results for each query in the batch, in the same order as the input
     */
    results: RunQueryWithCacheCheckResult<T>[];
    /**
     * Overall error message if success is false
     */
    errorMessage?: string;
}

/**
 * Interface for providers that execute stored queries.
 * Supports execution of pre-defined SQL queries with security controls.
 * Queries must be pre-approved and stored in the Query entity.
 */
export interface IRunQueryProvider {
    Config(configData: ProviderConfigDataBase): Promise<boolean>

    RunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult>

    /**
     * Executes multiple queries in a single batch operation.
     * More efficient than calling RunQuery multiple times as it reduces network overhead.
     * @param params - Array of query parameters
     * @param contextUser - Optional user context for permissions
     * @returns Array of query results in the same order as input params
     */
    RunQueries(params: RunQueryParams[], contextUser?: UserInfo): Promise<RunQueryResult[]>

    /**
     * Executes multiple query requests with smart cache checking.
     * For each query with cacheStatus provided, the server uses the Query's CacheValidationSQL
     * to check if the cached data is still current before executing the full query.
     * This reduces unnecessary data transfer when cached data is valid.
     * @param params Array of query parameters with optional cache status for each
     * @param contextUser Optional user context for permissions
     * @returns Response containing status and fresh data only for stale caches
     */
    RunQueriesWithCacheCheck?<T = unknown>(params: RunQueryWithCacheCheckParams[], contextUser?: UserInfo): Promise<RunQueriesWithCacheCheckResponse<T>>

    /**
     * Executes a query from a `QueryExecutionSpec` — the lower-layer interface-based entry point.
     * Runs the full pipeline: composition resolution → Nunjucks template processing → SQL execution.
     * Used for both saved queries (upper layer maps QueryInfo to spec) and transient test queries.
     * @param spec - The execution spec describing the query, parameters, and inline dependencies
     * @param contextUser - Optional user context for permissions (required server-side)
     * @returns Query results including data rows and execution metadata
     */
    ExecuteQueryFromSpec(spec: QueryExecutionSpec, contextUser?: UserInfo): Promise<RunQueryResult>
}

/**
 * Execution mode of a Remote Operation.
 * - `Sync` — plain request/response; the result is returned when the operation completes.
 * - `LongRunning` — the operation is backed by a tracked run (e.g. a `ProcessRun`); the caller
 *   chooses how to consume it via {@link RemoteOpInvokeMode}.
 */
export type RemoteOpExecMode = 'Sync' | 'LongRunning';

/**
 * How a caller consumes a `LongRunning` Remote Operation (ignored for `Sync` operations).
 * - `attached` — the returned promise stays pending until completion and streaming progress is
 *   delivered to {@link RemoteOpInvokeOptions.onProgress}.
 * - `detached` — the call returns a handle immediately; completion is delivered out-of-band
 *   (notification) and status is pollable via a sibling status operation.
 */
export type RemoteOpInvokeMode = 'attached' | 'detached';

/**
 * A single progress update emitted by a `LongRunning` Remote Operation while it executes.
 * The shape is intentionally generic so any operation can stream meaningful progress.
 */
export interface RemoteOpProgress {
    /** Stable key of the operation emitting the progress (e.g. `RecordProcess.RunNow`). */
    OperationKey: string;
    /** Opaque handle for the run this progress belongs to (e.g. a `ProcessRunID`). */
    Handle?: string;
    /** Coarse status label (e.g. `Running`, `Paused`). Operation-defined. */
    Status?: string;
    /** Items processed so far, when the operation reports countable progress. */
    Processed?: number;
    /** Total items to process, when known. */
    Total?: number;
    /** Human-readable progress message. */
    Message?: string;
    /** Arbitrary structured progress payload for richer UIs. */
    Payload?: unknown;
}

/**
 * Options controlling how a Remote Operation is invoked. All fields are optional; the defaults
 * produce a simple request/response call on the active provider.
 */
export interface RemoteOpInvokeOptions {
    /** For `LongRunning` operations, how the caller wants to consume the run (default `attached`). */
    mode?: RemoteOpInvokeMode;
    /** Callback receiving streaming {@link RemoteOpProgress} updates when invoked `attached`. */
    onProgress?: (progress: RemoteOpProgress) => void;
    /**
     * Explicit provider to route through. When omitted, the active default provider is used.
     * The resolved provider also implements {@link IRemoteOperationProvider} (it is a `ProviderBase`).
     */
    provider?: IMetadataProvider;
    /** Server-side acting user. Supplied on the server; ignored on the client (set per session). */
    user?: UserInfo;
    /**
     * Optional contract fingerprint carried in the wire envelope so the server can reject a stale
     * client loudly instead of mis-deserializing. Usually derived from the operation definition.
     */
    contractFingerprint?: string;
}

/**
 * Result of invoking a Remote Operation. Like other MJ result objects, it carries `Success` +
 * `ErrorMessage` rather than throwing for logical failures.
 */
export interface RemoteOpResult<TOutput = unknown> {
    /** True when the operation executed (or was accepted, for detached long-running) successfully. */
    Success: boolean;
    /** The typed output payload — present for `Sync` results and `attached` long-running completion. */
    Output?: TOutput;
    /** Opaque handle (e.g. a `ProcessRunID`) returned immediately for `detached` long-running runs. */
    Handle?: string;
    /** Machine-readable outcome code (e.g. `SUCCESS`, `UNKNOWN_OPERATION`, `FORBIDDEN`, `NOT_SUPPORTED`). */
    ResultCode?: string;
    /** Human-readable error detail when `Success` is false. */
    ErrorMessage?: string;
}

/**
 * Provider capability for routing typed Remote Operations. Implemented once by `ProviderBase`, so
 * every provider inherits it: server providers execute the operation in-process; the client
 * provider marshals it over the wire. This is deliberately a **separate** interface from
 * {@link IMetadataProvider} (whose surface is data retrieval / bounded mutation) — a generic
 * code-execution entry point does not belong there.
 *
 * Prefer the typed `BaseRemotableOperation.Execute()` entry point over calling `RouteOperation`
 * directly; `RouteOperation` is the stringly-typed power-tool seam for dynamic dispatch / tooling.
 */
export interface IRemoteOperationProvider {
    /**
     * Routes a single Remote Operation by key to its implementation and returns the result.
     * @param operationKey - Stable registry key of the operation (e.g. `RecordProcess.RunNow`).
     * @param input - The operation's typed input payload.
     * @param options - Optional invocation options (mode, progress callback, user, provider, fingerprint).
     * @returns The operation result, including typed `Output` (sync) or a `Handle` (detached long-running).
     */
    RouteOperation<TInput = unknown, TOutput = unknown>(operationKey: string, input: TInput, options?: RemoteOpInvokeOptions): Promise<RemoteOpResult<TOutput>>;
}

/**
 * Result of executing a report.
 * Contains the report data and execution metadata.
 */
export type RunReportResult = {
    ReportID: string;
    Success: boolean;
    Results: any[];
    RowCount: number;
    ExecutionTime: number;
    ErrorMessage: string;
}

/**
 * Interface for providers that execute reports.
 * Handles report generation with various output formats.
 * Reports combine data from multiple sources and apply formatting.
 */
export interface IRunReportProvider {
    Config(configData: ProviderConfigDataBase): Promise<boolean>

    RunReport(params: RunReportParams, contextUser?: UserInfo): Promise<RunReportResult>
}

/**
 * Result of loading a dataset.
 * Contains all dataset items with their data and metadata.
 * Datasets are collections of related entity data loaded together.
 */
export type DatasetResultType = {
    DatasetID: string;
    DatasetName: string;
    Success: boolean;
    Status: string;
    LatestUpdateDate: Date;
    Results: DatasetItemResultType[];
}

/**
 * Result for a single item within a dataset.
 * Represents one entity's data within the larger dataset collection.
 */
export type DatasetItemResultType = {
    Code: string;
    EntityName: string;
    EntityID: string;
    Results: any[];
    /**
     * Optional, provides the latest update date for the results provided
     */
    LatestUpdateDate?: Date;
    /**
     * Optional, a message if this item failed to load
     */
    Status?: string;
    /**
     * Optional, if not provided Success is assumed to be true
     */
    Success?: boolean;
}

/**
 * Filter specification for a dataset item.
 * Allows applying custom WHERE clauses to individual dataset items.
 */
export type DatasetItemFilterType = {
    ItemCode: string;
    Filter: string;
}

/**
 * Status information for a dataset.
 * Used to check if cached data is up-to-date without loading the full dataset.
 */
export type DatasetStatusResultType = {
    DatasetID: string;
    DatasetName: string;
    Success: boolean;
    Status: string;
    LatestUpdateDate: Date;
    EntityUpdateDates: DatasetStatusEntityUpdateDateType[];
 }

/**
 * Update date information for a single entity within a dataset.
 * Tracks when each entity's data was last modified.
 */
export type DatasetStatusEntityUpdateDateType = {
    EntityName: string;
    EntityID: string;
    UpdateDate: Date;
    RowCount: number;
}   


/**
 * AllMetadata is used to pass all metadata around in a single object for convenience and type safety.
 * Contains all system metadata collections including entities, applications, security, and queries.
 * This class provides a centralized way to access all MemberJunction metadata.
 */
export class AllMetadata {
    CurrentUser: UserInfo = null;

    // Arrays of Metadata below
    AllEntities: EntityInfo[] = [];
    AllApplications: ApplicationInfo[] = [];
    AllRoles: RoleInfo[] = [];
    AllRowLevelSecurityFilters: RowLevelSecurityFilterInfo[] = [];
    AllAuditLogTypes: AuditLogTypeInfo[] = [];
    AllAuthorizations: AuthorizationInfo[] = [];
    /**
     * Flat collection of all authorization-role assignments.
     * Loaded via `AllMetadataArrays` and used by `AuthorizationInfo.Roles`
     * for lazy, on-demand filtering — mirrors the `AllQueryFields` pattern.
     */
    AllAuthorizationRoles: AuthorizationRoleInfo[] = [];
    /** @deprecated Query data now lives in QueryEngine. Will be removed in v6.x. */
    AllQueryCategories: QueryCategoryInfo[] = [];
    /** @deprecated Query data now lives in QueryEngine. Will be removed in v6.x. */
    AllQueries: QueryInfo[] = [];
    /** @deprecated Query data now lives in QueryEngine. Will be removed in v6.x. */
    AllQueryFields: QueryFieldInfo[] = [];
    /** @deprecated Query data now lives in QueryEngine. Will be removed in v6.x. */
    AllQueryPermissions: QueryPermissionInfo[] = [];
    /** @deprecated Query data now lives in QueryEngine. Will be removed in v6.x. */
    AllQueryEntities: QueryEntityInfo[] = [];
    /** @deprecated Query data now lives in QueryEngine. Will be removed in v6.x. */
    AllQueryParameters: QueryParameterInfo[] = [];
    /** @deprecated Query data now lives in QueryEngine. Will be removed in v6.x. */
    AllQueryDependencies: QueryDependencyInfo[] = [];
    /** @deprecated Query data now lives in QueryEngine. Will be removed in v6.x. */
    AllSQLDialects: SQLDialectInfo[] = [];
    /** @deprecated Query data now lives in QueryEngine. Will be removed in v6.x. */
    AllQuerySQLs: QuerySQLInfo[] = [];
    AllEntityDocumentTypes: EntityDocumentTypeInfo[] = [];
    AllLibraries: LibraryInfo[] = [];
    AllExplorerNavigationItems: ExplorerNavigationItem[] = [];
}

/**
 * Represents the result of a simple text embedding operation. Not 
 * implemented in @memberjunction/core package but defined here and
 * implemented in sub-classes that live exclusively on the server-side
 */
export interface SimpleEmbeddingResult {
    vector: number[];
    modelID: string;
}