import { AIEngine } from "@memberjunction/aiengine";
import { BaseEntity, Metadata, CompositeKey, RunView, UserInfo, EntityInfo, RunViewResult, LogError, IMetadataProvider } from "@memberjunction/core";
import { MJVectorDatabaseEntity } from "@memberjunction/core-entities";
import { UUIDsEqual } from "@memberjunction/global";
import { PageRecordsParams } from "../generic/VectorCore.types";
import { MJAIModelEntityExtended } from "@memberjunction/ai-core-plus";

export class VectorBase {
    _runView: RunView;
    _metadata: Metadata;
    _currentUser: UserInfo;
    private _provider: IMetadataProvider | null = null;

    constructor() {
        this._runView = new RunView();
        this._metadata = (this._provider as unknown as Metadata) ?? new Metadata();
        this._currentUser = this._metadata.CurrentUser;
    }

    public get Metadata(): Metadata { return this._metadata; }
    public get RunView(): RunView { return this._runView; }
    public get CurrentUser(): UserInfo { return this._currentUser; }
    public set CurrentUser(user: UserInfo) { this._currentUser = user; }

    /**
     * Optional metadata provider override. Callers should set
     * `instance.Provider = providerToUse` before invoking helper methods
     * in multi-provider contexts. Falls back to the global default provider when unset.
     */
    public get Provider(): IMetadataProvider {
        return this._provider ?? (this._metadata as unknown as IMetadataProvider);
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
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

        const rvResult: RunViewResult<T> = await this._runView.RunView<T>({
            EntityName: entity.Name,
            ResultType: params.ResultType,
            MaxRows: params.PageSize,
            StartRow: Math.max(0, (params.PageNumber - 1) * params.PageSize),
            ExtraFilter: params.Filter
        }, this.CurrentUser);
    
        if (!rvResult.Success) {
          throw new Error(rvResult.ErrorMessage);
        }
    
        return rvResult.Results;
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