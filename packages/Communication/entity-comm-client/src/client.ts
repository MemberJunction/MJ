import { LogError, Metadata, RunViewParams } from "@memberjunction/core";
import { EntityCommunicationsEngineBase } from "@memberjunction/entity-communications-base";
import { Message } from "@memberjunction/communication-types";
import { GraphQLDataProvider } from "@memberjunction/graphql-dataprovider";
 

export class EntityCommunicationsEngineClient extends EntityCommunicationsEngineBase {
    /**
     * Executes a given message request against a view of records for a given entity
     * @param entityID 
     * @param runViewParams 
     * @param providerName 
     * @param providerMessageTypeName 
     * @param message 
     */
    public async RunEntityCommunication(entityID: number, runViewParams: RunViewParams, providerName: string, providerMessageTypeName: string, message: Message): Promise<{Success: boolean, ErrorMessage: string}> {
        try {
            const gql = `query RunEntityCommunicationByViewID($entityID: Int!, $runViewByIDInput: RunViewByIDInput!, $providerName: String!, $providerMessageTypeName: String!, $message: CommunicationMessageInput!) {
            RunEntityCommunicationByViewID(entityID: $entityID, runViewByIDInput: $runViewByIDInput, providerName: $providerName, providerMessageTypeName: $providerMessageTypeName, message: $message) {
                Success
                ErrorMessage
            }
            }`
            const result = await GraphQLDataProvider.ExecuteGQL(gql, { 
                entityID: entityID, 
                runViewByIDInput: runViewParams, 
                providerName: providerName, 
                providerMessageTypeName: providerMessageTypeName, 
                message: message
            });
    
            return result?.RunEntityCommunicationByViewID;
        }
        catch (err) {
            LogError('Error executing RunEntityCommunication query', undefined, err);          
        }
    }
}