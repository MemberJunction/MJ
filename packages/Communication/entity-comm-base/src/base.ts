import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, RunViewParams, UserInfo } from "@memberjunction/core";
import { EntityCommunicationFieldEntity, EntityCommunicationMessageTypeEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { Message } from '@memberjunction/communication-types';

@RegisterClass(BaseEntity, 'Entity Communication Message Types')
export class EntityCommunicationMessageTypeExtended extends EntityCommunicationMessageTypeEntity {
    public CommunicationFields: EntityCommunicationFieldEntity[] = [];
}

export abstract class EntityCommunicationsEngineBase extends BaseEngine<EntityCommunicationsEngineBase> {
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo) {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                EntityName: "Entity Communication Message Types",
                PropertyName: "_EntityCommunicationMessageTypes"
            },
            {
                EntityName: "Entity Communication Fields",
                PropertyName: "_EntityCommunicationFields"
            }            
        ];
        return await this.Load(c, forceRefresh, contextUser);
    }

    public static get Instance(): EntityCommunicationsEngineBase {
        return super.getInstance<EntityCommunicationsEngineBase>();
    }

    private _EntityCommunicationMessageTypes: EntityCommunicationMessageTypeExtended[] = [];
    private _EntityCommunicationFields: EntityCommunicationFieldEntity[] = [];
    public get EntityCommunicationMessageTypes(): EntityCommunicationMessageTypeExtended[] {
        return this._EntityCommunicationMessageTypes;
    }
    public get EntityCommunicationFields(): EntityCommunicationFieldEntity[] {
        return this._EntityCommunicationFields;
    }

    protected async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // post-process the fields to be linked to the message types they're part of 
        this.EntityCommunicationMessageTypes.forEach(m => {
            m.CommunicationFields = this.EntityCommunicationFields.filter(f => f.EntityCommunicationMessageTypeID === m.ID);
        });
    }

    /**
     * Returns a list of communication message types for the given entity
     * @param entityID 
     * @returns 
     */
    public GetEntityCommunicationMessageTypes(entityID: number): EntityCommunicationMessageTypeExtended[] {
        this.TryThrowIfNotLoaded();
        return this.EntityCommunicationMessageTypes.filter(m => m.EntityID === entityID);
    }

    /**
     * Returns true if the specified entity has any communication message types 
     * @param entityID 
     */
    public EntitySupportsCommunication(entityID: number): boolean {
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
     * @param entityID 
     * @param runViewParams 
     * @param providerName 
     * @param providerMessageTypeName 
     * @param message 
     */
    public abstract RunEntityCommunication(entityID: number, runViewParams: RunViewParams, providerName: string, providerMessageTypeName: string, message: Message): Promise<{Success: boolean, ErrorMessage: string}>  
}