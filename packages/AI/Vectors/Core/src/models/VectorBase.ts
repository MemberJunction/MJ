import { AIEngine } from "@memberjunction/aiengine";
import { BaseEntity, Metadata, CompositeKey, RunView, UserInfo, EntityInfo, RunViewResult, LogError, IMetadataProvider } from "@memberjunction/core";
import { MJVectorDatabaseEntity } from "@memberjunction/core-entities";
import { UUIDsEqual } from "@memberjunction/global";
import { PageRecordsParams } from "../generic/VectorCore.types";
import { MJAIModelEntityExtended } from "@memberjunction/ai-core-plus";

export class VectorBase {
    _runView: RunView;  // case-violation-ok-legacy-back-compat: the PascalCase name is already taken in this scope
    _metadata: Metadata;  // case-violation-ok-legacy-back-compat: the PascalCase name is already taken in this scope
    _currentUser: UserInfo;  // case-violation-ok-legacy-back-compat: the PascalCase name is already taken in this scope
    protected _provider: IMetadataProvider | null = null;

    /**
     * @param provider - Optional metadata provider to bind this instance (and all of its
     * metadata/view operations) to. Server-side callers servicing per-request connections
     * MUST pass their request-scoped provider (e.g. `this.ProviderToUse` from a BaseEntity
     * subclass) — relying on the global default silently uses the wrong connection in
     * multi-provider scenarios. Falls back to the global default provider when omitted.
     */
    constructor(provider?: IMetadataProvider | null) {
        // `_metadata` is the global `Metadata` helper, kept only because the field is public. It is
        // not an IMetadataProvider, so nothing may hand it to code that expects one — see `Provider`.
        this._metadata = new Metadata(); // global-provider-ok: legacy public field; metadata reads go through Provider
        this.Provider = provider ?? null; // setter also binds _runView to the provider
        this._currentUser = provider?.CurrentUser ?? this._metadata.CurrentUser;
    }

    /**
     * Provider-aware metadata access: returns the explicit provider when one was supplied
     * (constructor or `Provider` setter), otherwise the global default. All metadata
     * operations in this class hierarchy go through this getter so a bound instance never
     * leaks onto the global provider.
     */
    public get Metadata(): IMetadataProvider { return this.Provider; }
    public get RunView(): RunView { return this._runView; }
    public get CurrentUser(): UserInfo { return this._currentUser; }
    public set CurrentUser(user: UserInfo) { this._currentUser = user; }

    /**
     * Optional metadata provider override. Pass the provider to the constructor (preferred)
     * or set `instance.Provider = providerToUse` before invoking helper methods in
     * multi-provider contexts. Setting it rebinds the internal RunView instance so view
     * execution rides the same provider. Falls back to the global default when unset.
     *
     * The fallback is the global provider itself, never the `Metadata` wrapper: consumers
     * type-check what they get here (e.g. `VectorDBBase.TryWireColocatedHost` needs an
     * `IColocatedVectorHost`), and the wrapper fails those checks.
     */
    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
        // Real providers (ProviderBase subclasses) implement IRunViewProvider too;
        // FromMetadataProvider centralizes that cast. With no explicit provider the
        // RunView falls back to the global default, matching the Metadata getter.
        this._runView = value ? RunView.FromMetadataProvider(value) : new RunView();
    }

    protected async GetRecordsByEntityID(entityID: string, recordIDs?: CompositeKey[]): Promise<BaseEntity[]> {
        const md = this.Provider;
        const entity = md.Entities.find(e => UUIDsEqual(e.ID, entityID));
        if (!entity){
            throw new Error(`Entity with ID ${entityID} not found.`);
        }

        const rvResult = await this._runView.RunView<BaseEntity>({
            EntityName: entity.Name,
            ExtraFilter: recordIDs ? this.BuildExtraFilter(recordIDs): undefined,
            ResultType: 'entity_object',
            IgnoreMaxRows: true
        }, this.CurrentUser);

        if(!rvResult.Success){
            throw new Error(rvResult.ErrorMessage);
        }

        return rvResult.Results;
    }

    protected async PageRecordsByEntityID<T>(params: PageRecordsParams): Promise<T[]> {
        const entity: EntityInfo | undefined = this.Metadata.Entities.find((e) => UUIDsEqual(e.ID, params.EntityID as string));
        if (!entity) {
          throw new Error(`Entity with ID ${params.EntityID} not found.`);
        }

        // Prefer keyset (seek) pagination when the caller provides AfterKey.
        // The framework will throw AfterKeyNotSupportedError if the entity has a composite
        // PK — callers iterating those entities must use the PageNumber path.
        const useKeyset = !!params.AfterKey;

        const rvResult: RunViewResult<T> = await this._runView.RunView<T>({
            EntityName: entity.Name,
            ResultType: params.ResultType,
            MaxRows: params.PageSize,
            // Vectorization sweeps the entire entity one page at a time; each page is read
            // exactly once. Caching these bulk pages is pure downside — it pollutes the local
            // cache with single-use results and pulls in the dedup/linger layer (which keyed
            // sequential keyset pages identically and froze the seek cursor). Bypass all caching
            // so every page is a fresh DB read.
            BypassCache: true,
            ...(useKeyset
                ? { AfterKey: params.AfterKey, OrderBy: entity.FirstPrimaryKey!.Name } // first-pk-ok: keyset AfterKey/OrderBy is single-column by design; callers gate on CanUseKeysetPagination (PrimaryKeys.length === 1)
                : { StartRow: Math.max(0, (params.PageNumber - 1) * params.PageSize) }),
            ExtraFilter: params.Filter
        }, this.CurrentUser);

        if (!rvResult.Success) {
          throw new Error(rvResult.ErrorMessage);
        }

        return rvResult.Results;
    }

    /**
     * Returns true when {@link PageRecordsByEntityID} can serve the given entity via
     * keyset (seek) pagination — i.e. the entity has a single-column PK on a comparable
     * type. Callers iterating large tables should consult this and pass `AfterKey` when true.
     */
    protected CanUseKeysetPagination(entityID: string | number): boolean {
        const entity = this.Metadata.Entities.find(e => UUIDsEqual(e.ID, entityID as string));
        if (!entity || !entity.FirstPrimaryKey) return false; // first-pk-ok: keyset-eligibility check; an entity without a key column cannot be seek-paginated
        if (entity.PrimaryKeys.length !== 1) return false;
        // Inline allowlist check (avoid pulling in the helper here)
        const t = VectorBase.normalizeSqlTypeName(entity.FirstPrimaryKey.Type || ''); // first-pk-ok: guarded by PrimaryKeys.length === 1 above
        // Same set as KEYSET_PAGINATION_ORDERABLE_PK_TYPES in @memberjunction/core
        return ['uniqueidentifier','uuid','int','bigint','smallint','tinyint','decimal','numeric','money','smallmoney',
            'float','real','double precision','char','varchar','nchar','nvarchar','text','ntext',
            'date','datetime','datetime2','datetimeoffset','smalldatetime','time','bit',
            'integer','bigserial','serial','character varying','character','timestamp',
            'timestamp with time zone','timestamp without time zone','boolean'].includes(t);
    }

    /**
     * Lower-cases a SQL type name and drops a trailing size spec, so `nvarchar(255)` becomes
     * `nvarchar` and `decimal(10, 2)` becomes `decimal`. It scans the string instead of using a
     * regex: the type comes from metadata, and a backtracking pattern over it runs in polynomial time.
     */
    private static normalizeSqlTypeName(type: string): string {
        const trimmed = type.trim();
        if (!trimmed.endsWith(')')) {
            return trimmed.toLowerCase();
        }
        const close = trimmed.length - 1;
        // The size spec is the last "(...)" group: it opens at the first '(' after the previous ')'.
        const open = trimmed.indexOf('(', trimmed.lastIndexOf(')', close - 1) + 1);
        const base = open >= 0 && open < close ? trimmed.slice(0, open) : trimmed;
        return base.trim().toLowerCase();
    }

    /**
     * Builds a SQL filter from composite keys. Values are sanitized to prevent SQL injection.
     */
    protected BuildExtraFilter(compositeKeys: CompositeKey[]): string {
        return compositeKeys.map((keyValue) => {
            return keyValue.KeyValuePairs.map((keys) => {
                const sanitizedValue = String(keys.Value).replace(/'/g, "''");
                return `${keys.FieldName} = '${sanitizedValue}'`;
            }).join(" AND ");
        }).join("\n OR ");
    }

    protected GetAIModel(id?: string): MJAIModelEntityExtended {
        let model: MJAIModelEntityExtended;
        if(id){
            model = AIEngine.Instance.Models.find(m => m.AIModelType === "Embeddings" && UUIDsEqual(m.ID, id));
        }
        else{
            model = AIEngine.Instance.Models.find(m => m.AIModelType === "Embeddings");
        }

        if(!model){
            throw new Error("No AI Model Entity found");
        }
        return model;
    }

    protected GetVectorDatabase(id?: string): MJVectorDatabaseEntity {
        if(AIEngine.Instance.VectorDatabases.length > 0){
            if(id){
                let vectorDB = AIEngine.Instance.VectorDatabases.find(vd => UUIDsEqual(vd.ID, id));
                if(vectorDB){
                    return vectorDB;
                }
            }
            else{
                return AIEngine.Instance.VectorDatabases[0];
            }
        }

        throw new Error("No Vector Database Entity found");
    }

    protected async RunViewForSingleValue<T extends BaseEntity>(entityName: string, extraFilter: string): Promise<T | null> {
        const rvResult = await this._runView.RunView({
            EntityName: entityName,
            ExtraFilter: extraFilter,
            ResultType: 'entity_object'
        }, this.CurrentUser);

        if(rvResult.Success){
            return rvResult.RowCount > 0 ? rvResult.Results[0] as T: null;
        }
        else{
            LogError(rvResult.ErrorMessage);
            return null;
        }
    }

    /**
     * Saving an Entity in any vector related package needs the CurrentUser property to be set on the entity
     * So this is a simple wrapper to set it before saving
     **/
    protected async SaveEntity(entity: BaseEntity): Promise<boolean> {
        entity.ContextCurrentUser = this.CurrentUser;
        return await entity.Save();
    }
}