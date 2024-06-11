import { LogError, Metadata, RunViewParams } from "@memberjunction/core";
import { EntityCommunicationsEngineBase } from "@memberjunction/entity-communications-base";
import { Message } from "@memberjunction/communication-types";
import { GraphQLDataProvider } from "@memberjunction/graphql-dataprovider";
import { TemplateEntityExtended } from "@memberjunction/templates-base-types";
import { CommunicationProviderMessageTypeEntity } from "@memberjunction/core-entities";
 

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
                runViewByIDInput: {
                    ViewID: runViewParams.ViewID,
                    ExtraFilter: runViewParams.ExtraFilter,
                    OrderBy: runViewParams.OrderBy,
                    Fields: runViewParams.Fields,
                    UserSearchString: runViewParams.UserSearchString,
                    ExcludeUserViewRunID: runViewParams.ExcludeUserViewRunID,
                    OverrideExcludeFilter: runViewParams.OverrideExcludeFilter,
                    SaveViewResults: runViewParams.SaveViewResults,
                    ExcludeDataFromAllPriorViewRuns: runViewParams.ExcludeDataFromAllPriorViewRuns,
                    IgnoreMaxRows: runViewParams.IgnoreMaxRows,
                    MaxRows: runViewParams.MaxRows,
                    ForceAuditLog: runViewParams.ForceAuditLog,
                    AuditLogDescription: runViewParams.AuditLogDescription,
                    ResultType: runViewParams.ResultType
                }, 
                providerName: providerName, 
                providerMessageTypeName: providerMessageTypeName, 
                message: {
                    MessageType: this.getMessageTypeValues(message.MessageType),
                    From: message.From ? message.From : "",
                    To: message.To ? message.To : "",
                    Body: message.Body,
                    BodyTemplate: this.getTemplateValues(message.BodyTemplate),
                    HTMLBody: message.HTMLBody,
                    HTMLBodyTemplate: this.getTemplateValues(message.HTMLBodyTemplate),
                    Subject: message.Subject,
                    SubjectTemplate: this.getTemplateValues(message.SubjectTemplate),
                    ContextData: message.ContextData
                }
            });
    
            return result?.RunEntityCommunicationByViewID;
        }
        catch (err) {
            LogError('Error executing RunEntityCommunication query', undefined, err);          
        }
    }

    protected getMessageTypeValues(messageType: CommunicationProviderMessageTypeEntity) {
        if (!messageType)
            return undefined;

        return {
            ID: messageType.ID,
            CommunicationProviderID: messageType.CommunicationProviderID,
            CommunicationBaseMessageTypeID: messageType.CommunicationBaseMessageTypeID,
            Name: messageType.Name,
            Status: messageType.Status,
            AdditionalAttributes: messageType.AdditionalAttributes ? messageType.AdditionalAttributes : '',
            CreatedAt: messageType.CreatedAt,
            UpdatedAt: messageType.UpdatedAt,
            CommunicationProvider: messageType.CommunicationProvider,
            CommunicationBaseMessageType: messageType.CommunicationBaseMessageType
        }
    }

    protected getTemplateValues(template: TemplateEntityExtended) {
        if (!template)
            return undefined;

        return {
            ID: template.ID,
            Name: template.Name,
            Description: template.Description ? template.Description : '',
            UserPrompt: template.UserPrompt ? template.UserPrompt : '',
            CategoryID: template.CategoryID,
            UserID: template.UserID,
            ActiveAt: template.ActiveAt,
            DisabledAt: template.DisabledAt,
            IsActive: template.IsActive,
            CreatedAt: template.CreatedAt,
            UpdatedAt: template.UpdatedAt,
            Category: template.Category ? template.Category : '',
            User: template.User
        }
    }
}

type Scalar = string | number | boolean | null | undefined;

