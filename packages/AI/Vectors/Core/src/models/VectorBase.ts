import { AIEngine } from "@memberjunction/aiengine";
import { BaseEntity, LogError, Metadata, CompositeKey, RunView, UserInfo } from "@memberjunction/core";
import { AIModelEntityExtended, VectorDatabaseEntity } from "@memberjunction/core-entities";

export class VectorBase {
    _runView: RunView;
    _metadata: Metadata;
    _currentUser: UserInfo;

    constructor() {
        this._runView = new RunView();
        this._metadata = new Metadata();
        this._currentUser = this._metadata.CurrentUser;
    }

    public get Metadata(): Metadata { return this._metadata; }
    public get RunView(): RunView { return this._runView; }
    public get CurrentUser(): UserInfo { return this._currentUser; }
    public set CurrentUser(user: UserInfo) { this._currentUser = user; }

    protected async getRecordsByEntityID(entityID: string, recordIDs?: CompositeKey[]): Promise<BaseEntity[]> {
        const md = new Metadata();
        const entity = md.Entities.find(e => e.ID === entityID);
        if (!entity){
            throw new Error(`Entity with ID ${entityID} not found.`);
        }

        const rvResult = await this._runView.RunView<BaseEntity>({
            EntityName: entity.Name,
            ExtraFilter: recordIDs ? this.buildExtraFilter(recordIDs): undefined,
            ResultType: 'entity_object',
            IgnoreMaxRows: true
        }, this.CurrentUser);

        if(!rvResult.Success){
            throw new Error(rvResult.ErrorMessage);
        }

        return rvResult.Results;
    }

    protected buildExtraFilter(CompositeKey: CompositeKey[]): string {
        return CompositeKey.map((keyValue) => {
            return keyValue.KeyValuePairs.map((keys) => {
                return `${keys.FieldName} = '${keys.Value}'`;
            }).join(" AND ");
        }).join("\n OR ");
    }

    protected getAIModel(id?: string): AIModelEntityExtended {
        let model: AIModelEntityExtended;
        if(id){
            model = AIEngine.Models.find(m => m.AIModelType === "Embeddings" && m.ID === id);
        }
        else{
            model = AIEngine.Models.find(m => m.AIModelType === "Embeddings");
        }

        if(!model){
            throw new Error("No AI Model Entity found");
        }
        return model;
    }

    protected getVectorDatabase(id?: number): VectorDatabaseEntity {
        if(AIEngine.VectorDatabases.length > 0){
            if(id){
                let vectorDB = AIEngine.VectorDatabases.find(vd => vd.ID === id);
                if(vectorDB){
                    return vectorDB;
                }
            }
            else{
                return AIEngine.VectorDatabases[0];
            }
        }

        throw new Error("No Vector Database Entity found");
    }

    protected async runViewForSingleValue<T extends BaseEntity>(entityName: string, extraFilter: string): Promise<T | null> {
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