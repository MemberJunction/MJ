import {
    BaseEntity,
    BaseEntityResult,
    DatabasePlatform,
    DatabaseProviderBase,
    EntitySaveOptions,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    PostCommitToken,
    ProviderBase,
    ProviderType,
    SimpleEmbeddingResult,
    UserInfo,
} from "@memberjunction/core";
import {
    ComputeQueryFingerprintAsync,
    MJQueryEntityEntity,
    MJQueryFieldEntity,
    MJQueryParameterEntity,
    MJQuerySQLEntity,
    MJQueryEntityExtended,
    MJSQLDialectEntity,
    QueryDefinitionRows,
    QueryEngine,
} from "@memberjunction/core-entities";
import { EscapeSQLString, Float32VectorToBase64, RegisterClass, MJGlobal, UUIDsEqual } from "@memberjunction/global";
import { GenericDatabaseProvider, UserCache } from "@memberjunction/generic-database-provider";
import { CompositionFullPath } from "@memberjunction/sql-parser";
import { EmbedTextLocalHelper } from "./util";
import {
    CleanupQueryData,
    ConvertTSQLToPostgreSQL,
    CollectDeclaredQueryChildren,
    HasDeclaredQueryChildren,
    FindReplacedRows,
    QueueReplacedRowDeletion,
    QueryChildNameKey,
    QueryEntityKey,
    NO_DECLARED_QUERY_CHILDREN,
    ComputeQueryExtraction,
    WriteExtractedChildRows,
    ApplyFieldFacts,
    RunDescriptionPass,
    SQLUsesTemplate,
    ReadCompositionTargetsAsync,
    MergeCompositionCandidates,
} from "./query-extraction";
import type {
    QuerySyncContext,
    DeclaredQueryChildren,
    KnownQueryParameter,
    QueryExtractionMode,
    QueryExtractionOverride,
    QueryExtractionResult,
    ChildRowWriteSummary,
    CompositionTargetRead,
} from "./query-extraction";
import { ApplyApprovalRulesAsync, ApprovalRefusalResult } from "./approvalStamp";

/** The provider shape extraction reads and writes through. */
type ExtractionProvider = IMetadataProvider & IRunViewProvider;

/** Whether `provider` can read views and create entity objects, which is all extraction's writes need. */
function IsExtractionProvider(provider: unknown): provider is ExtractionProvider {
    if (provider === null || typeof provider !== 'object') return false;
    return typeof Reflect.get(provider, 'RunView') === 'function' && typeof Reflect.get(provider, 'GetEntityObject') === 'function';
}

/** Whether and how a save extracts. */
interface ExtractionPlan {
    readonly Run: boolean;
    readonly Mode: QueryExtractionMode;
}

/**
 * Server-side query entity with embedding generation, SQL extraction, and dialect auto-conversion.
 * Extends `MJQueryEntityExtended`, which provides the child-relationship getters and business
 * logic available on both client and server.
 *
 * **Extraction.** A save of a new query, of a query whose SQL changed, or with
 * {@link ExtractionOverride} `Force`, establishes the query's facts (`ComputeQueryExtraction`):
 * its parameters, compositions and the entities it reads from MJ's parser, and its output fields
 * from the database server's description of each render. Save-time rule errors and repeated
 * output names refuse a new or edited query, with the reasons in the save's result. Once the save
 * of the query row succeeds, the child rows are brought in line with the facts as the system user,
 * keeping what people authored (`WriteExtractedChildRows`), and the query's `UsesTemplate`,
 * `ExtractedSQLHash`, `ExtractionStatus` and `ExtractionMessage` record the run. Empty
 * descriptions are then filled by an LLM after the save's transaction commits, unless the save
 * skips AI actions.
 */
@RegisterClass(BaseEntity, 'MJ: Queries')
export class MJQueryEntityServer extends MJQueryEntityExtended {
    /** Optional caller-provided parameter sample values. When set, these are used as the sample of a
     *  parameter extraction adds, and in the renders that are described. Use this to pass tested,
     *  validated values from the calling system. Keys are parameter names. */
    public ParameterHints?: Map<string, string>;

    /**
     * What the next save does about extraction: `Auto` (the default) extracts when the query is new
     * or its SQL changed; `Skip` does not extract, so the save-time rules are not applied and the
     * child rows, the Extraction columns and `UsesTemplate` stay as they are (for bulk loaders and
     * fixtures that write those themselves); `Force` extracts even when the SQL did not change.
     * Reset to `Auto` after each save.
     */
    public ExtractionOverride: QueryExtractionOverride = 'Auto';

    /** The SQL a re-extraction reads instead of the cached platform variant (set by {@link RerunExtraction}). */
    private platformSQLOverride: string | null = null;

    /** The facts an explicit refresh already established, which its save writes instead of extracting again. */
    private presetExtraction: QueryExtractionResult | null = null;

    /** Whether the running save is an explicit refresh ({@link ApplyRefreshAsync}). */
    private refreshing = false;

    /** What the last save's child-row writes changed; `null` when it wrote none. */
    private lastWriteSummary: ChildRowWriteSummary | null = null;

    // ─── Embedding Methods ───────────────────────────────────────────────────────

    /**
     * Simple proxy to local helper method for embeddings. Needed for BaseEntity sub-classes that want to use embeddings built into BaseEntity
     */
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }

    /**
     * Generates an embedding from composite text (Name + UserQuestion + Description) for richer semantic search.
     * Stores the vector in EmbeddingVector (JSON) and EmbeddingVectorBinary (float32 bytes, base64), and the
     * model reference in EmbeddingModelID.
     *
     * Same contract as `MJTagEntityServer`: when no vector comes back — empty text, an empty result or an
     * embedder error — all three columns are cleared, so a query whose text changed never keeps a vector
     * computed from its old text. An embedder error is logged and does not fail the save; the query simply
     * has no semantic match until its next successful embedding.
     *
     * Does nothing when {@link SkipEmbeddings} is set (a bulk load computes them later), so the stored
     * vector is left as it is.
     */
    protected async GenerateCompositeEmbedding(): Promise<void> {
        if (this.SkipEmbeddings) {
            return;
        }
        const parts = [
            this.Name || '',
            this.UserQuestion || '',
            this.Description || ''
        ].filter(p => p.trim().length > 0);

        if (parts.length === 0) {
            this.clearEmbedding();
            return;
        }

        const compositeText = parts.join(' | ');
        try {
            const result = await this.EmbedTextLocal(compositeText);
            if (result?.vector && result.vector.length > 0) {
                this.EmbeddingVector = JSON.stringify(result.vector);
                this.EmbeddingVectorBinary = Float32VectorToBase64(result.vector);
                this.EmbeddingModelID = result.modelID;
                return;
            }
        } catch (error) {
            LogError(`[MJQueryEntityServer] Embedding refresh failed for query "${this.Name}": ${error instanceof Error ? error.message : String(error)}`);
        }
        this.clearEmbedding();
    }

    /** Clears the stored vector (both forms) and the model it was computed with. */
    private clearEmbedding(): void {
        this.EmbeddingVector = null;
        this.EmbeddingVectorBinary = null;
        this.EmbeddingModelID = null;
    }

    /** Re-embeds when the embedded text changed; clears a stale vector when there is no description. */
    private async refreshEmbeddingAsync(): Promise<void> {
        const changed = !this.IsSaved || ['Name', 'Description', 'UserQuestion'].some(f => this.GetFieldByName(f).Dirty);
        if (changed) {
            await this.GenerateCompositeEmbedding();
        } else if ((!this.Description || this.Description.trim().length === 0) && !this.SkipEmbeddings) {
            this.clearEmbedding();
        }
    }

    // ─── Save / Delete Overrides ─────────────────────────────────────────────────

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // Over a client provider (a process that loads this package but saves over GraphQL), the server
        // the save reaches applies the approval rules and extracts; doing it here too would write the
        // child rows twice, the second time from the client.
        if (this.savesOverNetwork) return super.Save(options);
        let approving: boolean;
        try {
            // Approving is a server act; a ReplayOnly save writes nothing, so it has nothing to stamp.
            approving = !options?.ReplayOnly && await ApplyApprovalRulesAsync(this, 'Status', this.Status);
        } catch (e) {
            this.RegisterResultHistoryEntry(ApprovalRefusalResult(this, e));
            return false;
        }
        try {
            return await this.saveWithExtractionAsync(options, approving);
        } catch (e) {
            LogError('Failed to save query:', e);
            this.LatestResult?.Errors.push(e);
            return false;
        } finally {
            this.ExtractionOverride = 'Auto';
            this.platformSQLOverride = null;
            this.presetExtraction = null;
            this.refreshing = false;
        }
    }

    /** Whether this object saves through a network (client) provider rather than to a database. */
    private get savesOverNetwork(): boolean {
        const provider: unknown = this.ProviderToUse;
        return provider instanceof ProviderBase && provider.ProviderType === ProviderType.Network;
    }

    /**
     * The save: facts first (a refusal writes nothing), then the query row (a graph save with any
     * declared children), then the child rows extraction derives, then the approval fingerprint.
     */
    private async saveWithExtractionAsync(options: EntitySaveOptions | undefined, approving: boolean): Promise<boolean> {
        const declared = await this.PrepareDeclaredChildrenAsync(options);
        const plan = this.planExtraction(options, HasDeclaredQueryChildren(declared));
        const extraction = plan.Run ? await this.computeExtractionAsync(plan.Mode) : null;
        if (extraction?.Refusal) {
            this.RegisterResultHistoryEntry(this.refusalResult(extraction.Refusal));
            return false;
        }
        this.applyRunColumns(extraction);
        if (extraction) this.applyFactsToDeclaredFields(extraction);
        await this.refreshEmbeddingAsync();
        const postCommit = this.capturePostCommitToken();
        this.lastWriteSummary = null;
        if (!await super.Save(options)) {
            return false;
        }
        if (extraction) {
            await this.writeExtractionAsync(extraction, options, postCommit);
            // A refresh brings the derived rows in line with the SQL; it never writes SQL, a dialect variant's included.
            if (!this.refreshing) await this.autoConvertDialectsAsync();
        } else if (!this.hasSQL) {
            await this.cleanupEmptyQueryAsync();
        }
        // The child and dialect rows are rewritten after the Query row, so the approved fingerprint is
        // taken last, from the definition as stored.
        if (approving) {
            await this.stampApprovalFingerprintAsync(options);
        }
        return true;
    }

    private get hasSQL(): boolean {
        return !!this.SQL && this.SQL.trim().length > 0;
    }

    /**
     * Whether this save extracts, and under which rules: a new or edited query extracts under the
     * save-time rules; a save that writes declared child rows, or a `Force` override, re-extracts an
     * unchanged query under the refresh rules, so the facts of rows it writes are corrected again.
     */
    private planExtraction(options: EntitySaveOptions | undefined, writesDeclaredChildren: boolean): ExtractionPlan {
        const edited = !this.IsSaved || this.GetFieldByName('SQL').Dirty;
        if (options?.ReplayOnly || !this.hasSQL || this.ExtractionOverride === 'Skip') {
            return { Run: false, Mode: 'Save' };
        }
        return { Run: edited || writesDeclaredChildren || this.ExtractionOverride === 'Force', Mode: edited ? 'Save' : 'Refresh' };
    }

    /**
     * Sets the columns a save records about the SQL before the row is written. `UsesTemplate` is a
     * lexical fact and follows every SQL change; it is never changed by a failed extraction. A save
     * with {@link ExtractionOverride} `Skip` leaves it as the caller set it, like the other
     * extraction results.
     */
    private applyRunColumns(extraction: QueryExtractionResult | null): void {
        if (extraction) {
            this.UsesTemplate = extraction.UsesTemplate;
            this.ExtractedSQLHash = extraction.Hash;
            this.ExtractionStatus = extraction.Status;
            this.ExtractionMessage = extraction.Messages.length > 0 ? extraction.Messages.join('\n') : null;
        } else if (!this.hasSQL) {
            this.UsesTemplate = false;
        } else if (this.ExtractionOverride !== 'Skip' && (!this.IsSaved || this.GetFieldByName('SQL').Dirty)) {
            this.UsesTemplate = this.lexicalUsesTemplate();
        }
    }

    /**
     * Gives each field row this save declares the facts extraction established for it, before the
     * graph is written. Facts follow the SQL and the database server whatever a caller declares, so
     * a declaration that carries facts (types, nullability, sequence, source) for another platform is
     * corrected before it is written instead of being written and then corrected, and a new declared
     * row, which may declare only its name and annotations, gets the facts its columns require.
     */
    private applyFactsToDeclaredFields(extraction: QueryExtractionResult): void {
        if (!extraction.Fields) return;
        const facts = new Map(extraction.Fields.map(f => [f.Name.toLowerCase(), f]));
        for (const row of this.DeclaredFields?.Items ?? []) {
            const fact = facts.get((row.Name ?? '').toLowerCase());
            if (fact) ApplyFieldFacts(row, fact);
        }
    }

    /** Whether the SQL holds a template tag outside comments, read by the lexer. */
    private lexicalUsesTemplate(): boolean {
        return SQLUsesTemplate(this.SQL ?? '', this.extractionPlatform);
    }

    /** The save's result entry for a refused save, carrying the reasons. */
    private refusalResult(reason: string): BaseEntityResult {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = this.IsSaved ? 'update' : 'create';
        result.Message = reason;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        return result;
    }

    /**
     * The declared-rows-win hook, run before the save writes anything.
     *
     * A caller can save a query together with child rows it declares, through the `Parameters`,
     * `Fields` and `Entities` collections. When a NEW declared row has the key of a stored row with a
     * different ID whose `DetectionMethod` is not `Manual` (a row extraction created), the stored row
     * is deleted inside the same graph save, before the declared row is inserted. The declared row
     * keeps the ID the caller gave it, which is what makes a metadata file that names its child IDs
     * converge instead of colliding with rows extraction wrote earlier. A stored `Manual` row is never
     * deleted here; a declared row that collides with one fails the save on the database's own
     * uniqueness rule where there is one.
     *
     * Extraction then runs after `super.Save()`, sees the declared rows already written, and treats
     * them like any stored row: their facts are corrected from the SQL, their authored annotations
     * kept.
     *
     * @param options - The save's options. A `ReplayOnly` save, or one that skips related
     *   collections, writes no declared rows, so nothing is declared.
     * @returns The keys of the child rows this save declares.
     */
    protected async PrepareDeclaredChildrenAsync(options?: EntitySaveOptions): Promise<DeclaredQueryChildren> {
        if (options?.ReplayOnly || options?.SkipRelatedCollections) {
            return NO_DECLARED_QUERY_CHILDREN;
        }
        const collections = { Parameters: this.DeclaredParameters, Fields: this.DeclaredFields, Entities: this.DeclaredEntities };
        const declared = CollectDeclaredQueryChildren(collections);
        if (this.IsSaved && HasDeclaredQueryChildren(declared)) {
            await this.queueReplacedRowDeletionsAsync();
        }
        return declared;
    }

    /**
     * Reads the stored child rows from the database (never a cache, which inside a transaction can
     * miss rows written earlier in it) and queues the extraction-created rows each new declared row
     * replaces for deletion in the graph save.
     */
    private async queueReplacedRowDeletionsAsync(): Promise<void> {
        const filter = `QueryID='${EscapeSQLString(this.ID)}'`;
        const [parameters, fields, entities] = await this.RunViewProviderToUse.RunViews([
            { EntityName: 'MJ: Query Parameters', ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true },
            { EntityName: 'MJ: Query Fields', ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true },
            { EntityName: 'MJ: Query Entities', ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true },
        ], this.ContextCurrentUser);
        if (!parameters?.Success || !fields?.Success || !entities?.Success) {
            throw new Error(`could not read the query's stored child rows: ${parameters?.ErrorMessage || fields?.ErrorMessage || entities?.ErrorMessage}`);
        }
        const newItems = <T extends { IsSaved: boolean }>(items: readonly T[]): T[] => items.filter(i => !i.IsSaved);
        const byName = (row: { Name: string }) => QueryChildNameKey(row.Name);
        for (const row of FindReplacedRows<MJQueryParameterEntity>(newItems(this.DeclaredParameters.Items), parameters.Results as MJQueryParameterEntity[], byName)) {
            QueueReplacedRowDeletion(this.DeclaredParameters, row);
        }
        for (const row of FindReplacedRows<MJQueryFieldEntity>(newItems(this.DeclaredFields.Items), fields.Results as MJQueryFieldEntity[], byName)) {
            QueueReplacedRowDeletion(this.DeclaredFields, row);
        }
        for (const row of FindReplacedRows<MJQueryEntityEntity>(newItems(this.DeclaredEntities.Items), entities.Results as MJQueryEntityEntity[], QueryEntityKey)) {
            QueueReplacedRowDeletion(this.DeclaredEntities, row);
        }
    }

    /**
     * Stores the fingerprint of the definition just approved: this row's SQL, template flag and
     * external source, with its dialect and parameter rows read back from the database. Until this
     * write lands the approval is not current, so a failure here fails closed.
     */
    private async stampApprovalFingerprintAsync(options?: EntitySaveOptions): Promise<void> {
        try {
            this.ApprovedFingerprint = await ComputeQueryFingerprintAsync(this, await this.loadDefinitionRowsAsync());
            if (!await super.Save(options)) {
                LogError(`[MJQueryEntityServer] Query "${this.Name}" was approved but its fingerprint was not saved: ${this.LatestResult?.CompleteMessage}`);
            }
        } catch (e) {
            LogError(`[MJQueryEntityServer] Query "${this.Name}" was approved but its fingerprint could not be computed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** This query's dialect and parameter rows as stored, bypassing every cache. */
    private async loadDefinitionRowsAsync(): Promise<QueryDefinitionRows> {
        type DefinitionRow = Pick<MJQuerySQLEntity, 'SQLDialectID' | 'SQL'> &
            Pick<MJQueryParameterEntity, 'Name' | 'Type' | 'IsRequired' | 'ValidationFilters' | 'IsServerSet'>;
        const filter = `QueryID='${EscapeSQLString(this.ID)}'`;
        const [sqls, parameters] = await this.RunViewProviderToUse.RunViews<DefinitionRow>([
            { EntityName: 'MJ: Query SQLs', ExtraFilter: filter, Fields: ['SQLDialectID', 'SQL'], ResultType: 'simple', BypassCache: true },
            { EntityName: 'MJ: Query Parameters', ExtraFilter: filter, Fields: ['Name', 'Type', 'IsRequired', 'ValidationFilters', 'IsServerSet'], ResultType: 'simple', BypassCache: true },
        ], this.ContextCurrentUser);
        if (!sqls?.Success || !parameters?.Success) {
            throw new Error(`could not read the query's definition rows: ${sqls?.ErrorMessage || parameters?.ErrorMessage}`);
        }
        return { SQLs: sqls.Results, Parameters: parameters.Results };
    }

    override async Delete(options?: EntitySaveOptions): Promise<boolean> {
        try {
            return await super.Delete(options);
        } catch (e) {
            LogError('Failed to delete query:', e);
            this.LatestResult?.Errors.push(e);
            return false;
        }
    }

    // ─── Extraction ──────────────────────────────────────────────────────────────

    /**
     * The platform the query is extracted for: the platform of the provider this entity saves
     * through, so two providers on different platforms in one process each extract for their own.
     */
    private get extractionPlatform(): DatabasePlatform {
        const provider = this.ProviderToUse;
        return provider instanceof DatabaseProviderBase ? provider.PlatformKey : 'sqlserver';
    }

    /** The provider as extraction reads and writes through it; `null` when it cannot read views and create entity objects. */
    private get extractionProvider(): ExtractionProvider | null {
        const provider: unknown = this.ProviderToUse;
        return IsExtractionProvider(provider) ? provider : null;
    }

    /**
     * The user derived child rows are read and written as: the system user, once the caller's save
     * of the query is authorized (the rows mirror SQL the caller was allowed to change, like CodeGen
     * output). The caller when no system user is loaded.
     */
    private get extractionUser(): UserInfo {
        if (this.refreshing) return this.ContextCurrentUser;
        return UserCache.Instance?.GetSystemUser?.() ?? this.ContextCurrentUser;
    }

    /** The SQL extraction reads: a re-extraction's override, else the query's SQL for the platform. */
    private get extractionSQL(): string {
        return this.platformSQLOverride ?? (this.GetPlatformSQL(this.extractionPlatform) || this.SQL || '');
    }

    /** Establishes the query's facts (nothing is written); an explicit refresh's facts when it already has them. */
    private async computeExtractionAsync(mode: QueryExtractionMode): Promise<QueryExtractionResult> {
        if (this.presetExtraction) return this.presetExtraction;
        const provider = this.ProviderToUse;
        await this.ensureQueryEngineLoadedAsync();
        const targets = await this.readCompositionTargetsAsync();
        return ComputeQueryExtraction({
            QueryID: this.IsSaved ? this.ID : null,
            QueryName: this.Name,
            QueryPath: CompositionFullPath({ Name: this.Name, CategoryPath: this.CategoryID ? this.BuildCategoryPath(this.CategoryID) : '' }),
            SQL: this.extractionSQL,
            Platform: this.extractionPlatform,
            Mode: mode,
            IsExternal: !!this.ExternalDataSourceID,
            KnownParameters: await this.knownParametersAsync(),
            ParameterHints: this.ParameterHints,
            ContextUser: this.ContextCurrentUser,
            Entities: provider instanceof DatabaseProviderBase ? provider.Entities : [],
            Queries: MergeCompositionCandidates(targets.Candidates, QueryEngine.Instance.Queries),
            CompositionDependencies: targets.InlineDependencies,
            Describe: provider instanceof GenericDatabaseProvider ? (sql: string) => provider.DescribeStatement(sql, this.ContextCurrentUser) : null,
        });
    }

    /**
     * The queries the SQL composes, read on this save's provider with every cache bypassed, so a
     * target saved earlier in the same transaction (one metadata push creating both queries) is
     * found before the shared query cache hears of it. Nothing is read for SQL that composes
     * nothing, or on a provider that cannot run views.
     */
    private async readCompositionTargetsAsync(): Promise<CompositionTargetRead> {
        const provider = this.ProviderToUse;
        if (!(provider instanceof DatabaseProviderBase)) return { Candidates: [], InlineDependencies: [] };
        const engine = QueryEngine.Instance;
        const cachedIDs = new Set(engine.Queries.map(q => q.ID.toLowerCase()));
        return ReadCompositionTargetsAsync(this.extractionSQL, this.extractionPlatform, provider, this.extractionUser, cachedIDs, engine.SQLDialects);
    }

    /** Loads QueryEngine when this process has not yet (a CLI or sync context); compositions resolve against it. */
    private async ensureQueryEngineLoadedAsync(): Promise<void> {
        if (QueryEngine.Instance.Loaded) return;
        try {
            await QueryEngine.Instance.Config(false, this.ContextCurrentUser);
        } catch (e) {
            LogError(`[MJQueryEntityServer] QueryEngine could not be loaded for extraction of "${this.Name}": ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * The parameter rows extraction knows before it runs: the stored rows, read from the database
     * (never the cache), overlaid by the rows this save declares.
     */
    private async knownParametersAsync(): Promise<KnownQueryParameter[]> {
        const byName = new Map<string, MJQueryParameterEntity>();
        for (const row of await this.storedParametersAsync()) byName.set(row.Name.toLowerCase(), row);
        for (const row of this.DeclaredParameters?.Items ?? []) byName.set(row.Name.toLowerCase(), row);
        return [...byName.values()].map(row => ({
            Name: row.Name, Type: row.Type, IsRequired: row.IsRequired === true, IsServerSet: row.IsServerSet === true,
            SampleValue: row.SampleValue, DefaultValue: row.DefaultValue, ValidationFilters: row.ValidationFilters,
            IsAuthored: row.DetectionMethod === 'Manual',
        }));
    }

    private async storedParametersAsync(): Promise<MJQueryParameterEntity[]> {
        const provider = this.extractionProvider;
        if (!this.IsSaved || !provider) return [];
        const result = await provider.RunView<MJQueryParameterEntity>({
            EntityName: 'MJ: Query Parameters', ExtraFilter: `QueryID='${EscapeSQLString(this.ID)}'`, ResultType: 'entity_object', BypassCache: true,
        }, this.extractionUser);
        if (!result.Success) throw new Error(`could not read the query's stored parameters: ${result.ErrorMessage}`);
        return result.Results ?? [];
    }

    /**
     * Writes the derived child rows as the system user, inside the caller's transaction when there
     * is one, then queues the description pass. A failed write is recorded on the query
     * (`ExtractionStatus` `Error`) rather than failing a save whose row is already written.
     */
    private async writeExtractionAsync(extraction: QueryExtractionResult, options: EntitySaveOptions | undefined, postCommit: PostCommitToken | undefined): Promise<void> {
        const provider = this.extractionProvider;
        try {
            if (!provider) throw new Error('the query is not saved through a database provider');
            const summary = await WriteExtractedChildRows({ QueryID: this.ID, Provider: provider, User: this.extractionUser, EntityName: id => this.entityNameOf(id) }, extraction);
            this.lastWriteSummary = summary;
            this.queueDescriptionPass(summary, options, postCommit);
        } catch (e) {
            // An explicit refresh runs in its own transaction, which a failed write rolls back.
            if (this.refreshing) throw e;
            await this.recordWriteFailureAsync(e);
        }
    }

    /** An entity's name from the saving provider's catalog, for reporting; the ID when it is not there. */
    private entityNameOf(entityID: string): string {
        const provider = this.ProviderToUse;
        const entities = provider instanceof DatabaseProviderBase ? provider.Entities : [];
        return entities.find(e => UUIDsEqual(e.ID, entityID))?.Name ?? entityID;
    }

    private async recordWriteFailureAsync(error: unknown): Promise<void> {
        const reason = `The extracted child rows could not be written: ${error instanceof Error ? error.message : String(error)}`;
        LogError(`[MJQueryEntityServer] Query "${this.Name}": ${reason}`);
        this.ExtractionStatus = 'Error';
        this.ExtractionMessage = this.ExtractionMessage ? `${this.ExtractionMessage}\n${reason}` : reason;
        if (!await super.Save()) {
            LogError(`[MJQueryEntityServer] Query "${this.Name}": the extraction failure could not be recorded: ${this.LatestResult?.CompleteMessage}`);
        }
    }

    /** The post-commit token of the caller's transaction, captured before the save writes anything. */
    private capturePostCommitToken(): PostCommitToken | undefined {
        const provider = this.ProviderToUse;
        return provider instanceof DatabaseProviderBase ? provider.CapturePostCommitToken() : undefined;
    }

    /**
     * Queues the LLM description pass to run after the caller's transaction commits, when some row
     * has no description and the save does not skip AI actions. No LLM call is made inside the
     * transaction. A save-triggered extraction that changed no child row does not queue it: the
     * rows are as the last run left them, so a repeated save (a re-push of unchanged metadata) does
     * not call the LLM again, and a pass that failed is not retried, and recorded, on every save.
     * An explicit refresh that asks for the pass always queues it.
     */
    private queueDescriptionPass(summary: ChildRowWriteSummary, options: EntitySaveOptions | undefined, postCommit: PostCommitToken | undefined): void {
        const provider = this.ProviderToUse;
        const undescribed = summary.FieldsWithoutDescription.length + summary.ParametersWithoutDescription.length;
        if (options?.SkipEntityAIActions || undescribed === 0 || !(provider instanceof DatabaseProviderBase)) return;
        if (!this.refreshing && summary.Changes.length === 0) return;
        const request = { QueryID: this.ID, QueryName: this.Name, SQL: this.extractionSQL, Provider: provider, User: this.extractionUser };
        provider.RunAfterCommit(() => RunDescriptionPass(request), `query description pass for "${this.Name}"`, postCommit);
    }

    /**
     * Re-extracts this query: a save with {@link ExtractionOverride} `Force`. Called by
     * `MJQuerySQLEntityServer` when a dialect variant for the current platform is saved.
     *
     * @param skipAIEnrichment Skip the description pass, as `SkipEntityAIActions` does for a save.
     * @param platformSQL The SQL to extract from (the variant just saved), instead of the cached
     *   platform variant, which inside a transaction may not hold it yet.
     */
    public async RerunExtraction(skipAIEnrichment = false, platformSQL?: string): Promise<void> {
        this.ExtractionOverride = 'Force';
        this.platformSQLOverride = platformSQL ?? null;
        if (!await this.Save({ SkipEntityAIActions: skipAIEnrichment })) {
            LogError(`[MJQueryEntityServer] Re-extraction of query "${this.Name}" failed: ${this.LatestResult?.CompleteMessage}`);
        }
    }

    // ─── Explicit refresh ────────────────────────────────────────────────────────

    /**
     * Establishes this saved query's facts under the refresh rules (a save-time rule error is
     * recorded, never a refusal), as the save would, and writes nothing. The facts are read on the
     * provider this entity was loaded with, for its platform.
     */
    public async ComputeRefreshExtractionAsync(): Promise<QueryExtractionResult> {
        return this.computeExtractionAsync('Refresh');
    }

    /**
     * The child-row changes `extraction` would make, worked out against the rows stored now and
     * read as this entity's context user. Nothing is written.
     */
    public async PreviewRefreshAsync(extraction: QueryExtractionResult, entityName?: (entityID: string) => string): Promise<ChildRowWriteSummary> {
        const provider = this.extractionProvider;
        if (!provider) throw new Error('the query is not loaded through a database provider');
        return WriteExtractedChildRows({ QueryID: this.ID, Provider: provider, User: this.ContextCurrentUser, DryRun: true, EntityName: entityName ?? (id => this.entityNameOf(id)) }, extraction);
    }

    /**
     * Writes `extraction` (from {@link ComputeRefreshExtractionAsync}): a save with
     * {@link ExtractionOverride} `Force` that records the run on the query and brings the child
     * rows in line with the facts. Unlike a save-triggered extraction, the child rows are written
     * as this entity's context user, so each write is checked against that user's permissions, and
     * a failed write fails the refresh instead of being recorded on the query. SQL, dialect
     * variants and the embedding are never written.
     *
     * @param withAI Queue the LLM description pass for rows still without a description.
     * @returns What the child-row writes changed.
     * @throws Error when the save or a child-row write fails; the caller's transaction should be rolled back.
     */
    public async ApplyRefreshAsync(extraction: QueryExtractionResult, withAI: boolean): Promise<ChildRowWriteSummary | null> {
        this.ExtractionOverride = 'Force';
        this.presetExtraction = extraction;
        this.refreshing = true;
        // A refresh changes the derived rows, not the text the embedding is computed from.
        const skipEmbeddings = this.SkipEmbeddings;
        this.SkipEmbeddings = true;
        try {
            if (!await this.Save({ SkipEntityAIActions: !withAI })) {
                throw new Error(this.LatestResult?.CompleteMessage || `the refresh of query "${this.Name}" could not be saved`);
            }
        } finally {
            this.SkipEmbeddings = skipEmbeddings;
        }
        return this.lastWriteSummary;
    }

    /**
     * Cleans up all extraction data when SQL is empty.
     */
    private async cleanupEmptyQueryAsync(): Promise<void> {
        const provider = this.extractionProvider;
        if (!provider) return;
        try {
            const ctx: QuerySyncContext = {
                queryID: this.ID,
                queryName: this.Name,
                sql: '',
                isSaved: this.IsSaved,
                contextUser: this.extractionUser,
                metadataProvider: provider,
                runViewProvider: provider,
                platform: this.extractionPlatform,
            };
            await CleanupQueryData(ctx);
        } catch (e) {
            LogError('Error in async cleanup:', e);
        }
    }

    // ─── Dialect Conversion ──────────────────────────────────────────────────────

    /**
     * Auto-converts the query's SQL to other dialects based on the queryDialects
     * configuration stored in GlobalObjectStore. Best-effort: failures never block the save.
     */
    private async autoConvertDialectsAsync(): Promise<void> {
        try {
            const config = MJGlobal.Instance.GetGlobalObjectStore()?.['queryDialects'] as
                { autoConvertOnSave?: boolean; targetPlatforms?: string[] } | undefined;

            if (!config?.autoConvertOnSave || !config.targetPlatforms?.length) {
                return;
            }

            if (!this.SQL || this.SQL.trim().length === 0) {
                return;
            }

            const qe = QueryEngine.Instance;
            const dialects = qe.SQLDialects;

            const sourceDialect = this.SQLDialectID
                ? dialects.find(d => UUIDsEqual(d.ID, this.SQLDialectID))
                : dialects.find(d => d.PlatformKey === 'sqlserver');

            if (!sourceDialect) {
                console.warn(`Query "${this.Name}" - Could not determine source dialect, skipping auto-convert`);
                return;
            }

            for (const targetPlatformKey of config.targetPlatforms) {
                await this.convertToTargetDialect(sourceDialect, targetPlatformKey, dialects);
            }
        } catch (e) {
            console.warn(`Query "${this.Name}" - Auto-convert dialects failed:`, e);
        }
    }

    /**
     * Converts and persists SQL for a single target dialect. Logs warnings on skip/failure.
     */
    private async convertToTargetDialect(
        sourceDialect: MJSQLDialectEntity,
        targetPlatformKey: string,
        dialects: MJSQLDialectEntity[]
    ): Promise<void> {
        try {
            if (targetPlatformKey === sourceDialect.PlatformKey) {
                return;
            }

            const targetDialect = dialects.find(d => d.PlatformKey === targetPlatformKey);
            if (!targetDialect) {
                console.warn(`Query "${this.Name}" - Target dialect "${targetPlatformKey}" not found, skipping`);
                return;
            }

            if (sourceDialect.PlatformKey !== 'sqlserver' || targetPlatformKey !== 'postgresql') {
                console.warn(`Query "${this.Name}" - Conversion from "${sourceDialect.PlatformKey}" to "${targetPlatformKey}" not yet supported`);
                return;
            }

            const convertedSQL = ConvertTSQLToPostgreSQL(this.SQL);
            await this.upsertQuerySQLRecord(targetDialect, convertedSQL);
        } catch (platformError) {
            console.warn(`Query "${this.Name}" - Auto-convert to "${targetPlatformKey}" failed:`, platformError);
        }
    }

    /**
     * Creates or updates a QuerySQL record for the given dialect.
     */
    private async upsertQuerySQLRecord(
        targetDialect: MJSQLDialectEntity,
        convertedSQL: string,
    ): Promise<void> {
        const md = this.extractionProvider;
        if (!md) return;

        // Look up existing record from QueryEngine cache instead of a RunView call
        const existing = QueryEngine.Instance.QuerySQLs.find(
            qs => UUIDsEqual(qs.QueryID, this.ID) && UUIDsEqual(qs.SQLDialectID, targetDialect.ID)
        );

        let record: MJQuerySQLEntity;
        if (existing) {
            record = existing;
        } else {
            record = await md.GetEntityObject<MJQuerySQLEntity>('MJ: Query SQLs', this.ContextCurrentUser);
            record.QueryID = this.ID;
            record.SQLDialectID = targetDialect.ID;
        }

        record.SQL = convertedSQL;

        const saved = await record.Save();
        if (!saved) {
            console.warn(`Query "${this.Name}" - Failed to save QuerySQL record for dialect "${targetDialect.Name}"`);
        }
    }
}
