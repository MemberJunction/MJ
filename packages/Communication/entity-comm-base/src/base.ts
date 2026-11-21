import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, IMetadataProvider, IRunViewProvider, RunViewParams, UserInfo } from "@memberjunction/core";
import { MJEntityCommunicationFieldEntity, MJEntityCommunicationMessageTypeEntity } from "@memberjunction/core-entities";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { Message, ProcessedMessage, CommunicationEngineBase } from '@memberjunction/communication-types';

@RegisterClass(BaseEntity, 'MJ: Entity Communication Message Types')
export class MJEntityCommunicationMessageTypeEntityExtended extends MJEntityCommunicationMessageTypeEntity {
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
    /**
     * The user the communication runs as. Required on the server: every recipient and related-entity
     * read runs as this user, so row-level security, entity permissions and field-level security all
     * apply, and no field this user cannot read is merged into a message or returned. The server
     * engine refuses a request without it. Clients leave it unset; the API sets it from the
     * authenticated caller.
     */
    ContextUser?: UserInfo
    /**
     * The provider of the request the communication serves; every metadata lookup and read uses
     * it. The API sets it from the request. An in-process caller that leaves it unset gets the
     * process's default provider.
     */
    Provider?: IMetadataProvider & IRunViewProvider
}
export class EntityCommunicationResultItem {
    RecipientData: any
    Message: ProcessedMessage
    /**
     * True when nothing was sent (or previewed) for this recipient. {@link SkipReason} says why, without
     * revealing any value the sender may not read; {@link Message} is unset.
     */
    Skipped?: boolean
    /** Why this recipient was skipped, when {@link Skipped} is true. */
    SkipReason?: string
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

    private _metadata: {
        EntityCommunicationMessageTypes: MJEntityCommunicationMessageTypeEntityExtended[],
        EntityCommunicationFields: MJEntityCommunicationFieldEntity[]
    } = {EntityCommunicationMessageTypes: [], EntityCommunicationFields: []};

    public get EntityCommunicationMessageTypes(): MJEntityCommunicationMessageTypeEntityExtended[] {
        return this._metadata.EntityCommunicationMessageTypes;
    }
    public get EntityCommunicationFields(): MJEntityCommunicationFieldEntity[] {
        return this._metadata.EntityCommunicationFields;
    }

    protected async AdditionalLoading(contextUser?: UserInfo): Promise<void> {

        if(!CommunicationEngineBase.Instance.Metadata.EntityCommunicationFields){
            await CommunicationEngineBase.Instance.Config(false, contextUser);
        }

        // post-process the fields to be linked to the message types they're part of 
        this._metadata.EntityCommunicationFields = CommunicationEngineBase.Instance.Metadata.EntityCommunicationFields || [];
        this._metadata.EntityCommunicationMessageTypes = <MJEntityCommunicationMessageTypeEntityExtended[]>CommunicationEngineBase.Instance.Metadata.EntityCommunicationMessageTypes || [];
        this.EntityCommunicationMessageTypes.forEach(m => {
            m.CommunicationFields = this.EntityCommunicationFields.filter(f => UUIDsEqual(f.EntityCommunicationMessageTypeID, m.ID));
        });
    }

    /**
     * Returns a list of communication message types for the given entity
     * @param entityID 
     * @returns 
     */
    public GetEntityCommunicationMessageTypes(entityID: string): MJEntityCommunicationMessageTypeEntityExtended[] {
        this.TryThrowIfNotLoaded();
        return this.EntityCommunicationMessageTypes.filter(m => UUIDsEqual(m.EntityID, entityID));
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