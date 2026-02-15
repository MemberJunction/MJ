import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, IMetadataProvider, RunViewParams, UserInfo } from "@memberjunction/core";
import { MJEntityCommunicationFieldEntity, MJEntityCommunicationMessageTypeEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { Message, ProcessedMessage, CommunicationEngineBase } from '@memberjunction/communication-types';

@RegisterClass(BaseEntity, 'MJ: Entity Communication Message Types')
export class EntityCommunicationMessageTypeExtended extends MJEntityCommunicationMessageTypeEntity {
    public CommunicationFields: MJEntityCommunicationFieldEntity[] = [];
}


export class EntityCommunicationParams {
    EntityID: string;
    RunViewParams: RunViewParams
    ProviderName: string
    ProviderMessageTypeName: string
    Message: Message
    PreviewOnly?: boolean = false
    IncludeProcessedMessages?: boolean = false
}
export class EntityCommunicationResultItem {
    RecipientData: any
    Message: ProcessedMessage
}
export class EntityCommunicationResult {
    Success: boolean
    ErrorMessage?: string
    Results?: EntityCommunicationResultItem[]    
}

export abstract class EntityCommunicationsEngineBase extends BaseEngine<EntityCommunicationsEngineBase> {
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        // just rely on the metadata from the base engine, can do extra loading here down the road as needed
        // it is faster to use the base engine's metadata than to load it again here even though the metadata
        // is cached we still have to check to see if the dataset is up to date and that takes time
        await CommunicationEngineBase.Instance.Config(forceRefresh, contextUser);
        await this.Load([], provider, forceRefresh, contextUser); // even though we have NO configs, we need to call Load so that the lifecycle of this object is properly managed where the Loaded flag is set and AdditionalLoading is called
    }
 

    public static get Instance(): EntityCommunicationsEngineBase {
        return super.getInstance<EntityCommunicationsEngineBase>();
    }

    private _Metadata: {
        EntityCommunicationMessageTypes: EntityCommunicationMessageTypeExtended[],
        EntityCommunicationFields: MJEntityCommunicationFieldEntity[]
    } = {EntityCommunicationMessageTypes: [], EntityCommunicationFields: []};

    public get EntityCommunicationMessageTypes(): EntityCommunicationMessageTypeExtended[] {
        return this._Metadata.EntityCommunicationMessageTypes;
    }
    public get EntityCommunicationFields(): MJEntityCommunicationFieldEntity[] {
        return this._Metadata.EntityCommunicationFields;
    }

    protected async AdditionalLoading(contextUser?: UserInfo): Promise<void> {

        if(!CommunicationEngineBase.Instance.Metadata.EntityCommunicationFields){
            await CommunicationEngineBase.Instance.Config(false, contextUser);
        }

        // post-process the fields to be linked to the message types they're part of 
        this._Metadata.EntityCommunicationFields = CommunicationEngineBase.Instance.Metadata.EntityCommunicationFields || [];
        this._Metadata.EntityCommunicationMessageTypes = <EntityCommunicationMessageTypeExtended[]>CommunicationEngineBase.Instance.Metadata.EntityCommunicationMessageTypes || [];
        this.EntityCommunicationMessageTypes.forEach(m => {
            m.CommunicationFields = this.EntityCommunicationFields.filter(f => f.EntityCommunicationMessageTypeID === m.ID);
        });
    }

    /**
     * Returns a list of communication message types for the given entity
     * @param entityID 
     * @returns 
     */
    public GetEntityCommunicationMessageTypes(entityID: string): EntityCommunicationMessageTypeExtended[] {
        this.TryThrowIfNotLoaded();
        return this.EntityCommunicationMessageTypes.filter(m => m.EntityID === entityID);
    }

    /**
     * Returns true if the specified entity has any communication message types 
     * @param entityID 
     */
    public EntitySupportsCommunication(entityID: string): boolean {
        this.TryThrowIfNotLoaded();
        return this.GetEntityCommunicationMessageTypes(entityID).length > 0;
    }

    /*
        Need to do the following for entity level communiciaton 
        * Enable running a template against a view
        * Enable running a non-template (e.g. user provided subject, body, htmlbody, etc) against a view of records 
        * validate that the given entity supports communication
        * validate that the given entity supports the given message type
     */

    /**
     * Executes a given message request against a view of records for a given entity
     * @param params
     */
    public abstract RunEntityCommunication(params: EntityCommunicationParams): Promise<EntityCommunicationResult>  

}