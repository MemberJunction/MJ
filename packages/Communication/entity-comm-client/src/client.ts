import { LogError, Metadata, RunViewParams } from "@memberjunction/core";
import { EntityCommunicationParams, EntityCommunicationResult, EntityCommunicationsEngineBase } from "@memberjunction/entity-communications-base";
import { Message } from "@memberjunction/communication-types";
import { GraphQLDataProvider } from "@memberjunction/graphql-dataprovider";
import { MJCommunicationProviderMessageTypeEntity, TemplateEntityExtended } from "@memberjunction/core-entities";

export class EntityCommunicationsEngineClient extends EntityCommunicationsEngineBase {
    /**
     * Get the singleton instance of EntityCommunicationsEngineClient
     */
    public static override get Instance(): EntityCommunicationsEngineClient {
        return super.getInstance<EntityCommunicationsEngineClient>();
    }

    /**
     * Configure the entity communications engine client.
     * This method is inherited from EntityCommunicationsEngineBase but needs to be explicitly
     * exposed to prevent tree-shaking in production builds from removing access to it.
     */
    public override async Config(forceRefresh?: boolean, contextUser?: import("@memberjunction/core").UserInfo, provider?: import("@memberjunction/core").IMetadataProvider): Promise<void> {
        return super.Config(forceRefresh, contextUser, provider);
    }

    /**
     * Executes a given message request against a view of records for a given entity
     * @param entityID
     * @param runViewParams
     * @param providerName
     * @param providerMessageTypeName
     * @param message
     */
    public async RunEntityCommunication(params: EntityCommunicationParams): Promise<EntityCommunicationResult> {
        try {
            const gql = `query RunEntityCommunicationByViewID($entityID: Int!, $runViewByIDInput: RunViewByIDInput!, $providerName: String!, $providerMessageTypeName: String!, $message: CommunicationMessageInput!, $previewOnly: Boolean!, $includeProcessedMessages: Boolean!) {
            RunEntityCommunicationByViewID(entityID: $entityID, runViewByIDInput: $runViewByIDInput, providerName: $providerName, providerMessageTypeName: $providerMessageTypeName, message: $message, previewOnly: $previewOnly, includeProcessedMessages: $includeProcessedMessages) {
                Success
                ErrorMessage
                Results
            }
            }`
            const result = await GraphQLDataProvider.ExecuteGQL(gql, { 
                entityID: params.EntityID, 
                previewOnly: params.PreviewOnly,
                includeProcessedMessages: params.IncludeProcessedMessages,
                runViewByIDInput: {
                    ViewID: params.RunViewParams.ViewID,
                    ExtraFilter: params.RunViewParams.ExtraFilter,
                    OrderBy: params.RunViewParams.OrderBy,
                    Fields: params.RunViewParams.Fields,
                    UserSearchString: params.RunViewParams.UserSearchString,
                    ExcludeUserViewRunID: params.RunViewParams.ExcludeUserViewRunID,
                    OverrideExcludeFilter: params.RunViewParams.OverrideExcludeFilter,
                    SaveViewResults: params.RunViewParams.SaveViewResults,
                    ExcludeDataFromAllPriorViewRuns: params.RunViewParams.ExcludeDataFromAllPriorViewRuns,
                    IgnoreMaxRows: params.RunViewParams.IgnoreMaxRows,
                    MaxRows: params.RunViewParams.MaxRows,
                    ForceAuditLog: params.RunViewParams.ForceAuditLog,
                    AuditLogDescription: params.RunViewParams.AuditLogDescription,
                    ResultType: params.RunViewParams.ResultType
                }, 
                providerName: params.ProviderName, 
                providerMessageTypeName: params.ProviderMessageTypeName, 
                message: {
                    MessageType: this.getMessageTypeValues(params.Message.MessageType),
                    From: params.Message.From ? params.Message.From : "",
                    To: params.Message.To ? params.Message.To : "",
                    Body: params.Message.Body,
                    BodyTemplate: this.getTemplateValues(params.Message.BodyTemplate),
                    HTMLBody: params.Message.HTMLBody,
                    HTMLBodyTemplate: this.getTemplateValues(params.Message.HTMLBodyTemplate),
                    Subject: params.Message.Subject,
                    SubjectTemplate: this.getTemplateValues(params.Message.SubjectTemplate),
                    ContextData: params.Message.ContextData
                }
            });
    
            if (result && result.RunEntityCommunicationByViewID) {
                const r = result.RunEntityCommunicationByViewID;
                return {
                    Success: r.Success,
                    ErrorMessage: r.ErrorMessage,
                    Results: r.Results?.Results // flatten out the Results, the Results property is an object that wraps the Results array
                };    
            }
        }
        catch (err) {
            LogError('Error executing RunEntityCommunication query', undefined, err);          
        }
    }

    protected getMessageTypeValues(messageType: MJCommunicationProviderMessageTypeEntity) {
        if (!messageType)
            return undefined;

        return {
          ID: messageType.ID,
          CommunicationProviderID: messageType.CommunicationProviderID,
          CommunicationBaseMessageTypeID: messageType.CommunicationBaseMessageTypeID,
          Name: messageType.Name,
          Status: messageType.Status,
          AdditionalAttributes: messageType.AdditionalAttributes ? messageType.AdditionalAttributes : '',
          _mj_CreatedAt: messageType.__mj_CreatedAt,
          _mj_UpdatedAt: messageType.__mj_UpdatedAt,
          CommunicationProvider: messageType.CommunicationProvider,
          CommunicationBaseMessageType: messageType.CommunicationBaseMessageType,
        };
    }

    protected getTemplateValues(template: TemplateEntityExtended) {
        if (!template){
            return undefined;
        }

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
          _mj_CreatedAt: template.__mj_CreatedAt,
          _mj_UpdatedAt: template.__mj_UpdatedAt,
          Category: template.Category ? template.Category : '',
          User: template.User,
        };
    }
}

type Scalar = string | number | boolean | null | undefined;

