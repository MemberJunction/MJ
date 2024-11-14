import { UserInfo } from "@memberjunction/core";
import { ListEntity, TemplateContentEntity, TemplateEntity, TemplateParamEntity } from "@memberjunction/core-entities";

export type SendEmailsParams = {
    /**
     * The ID of the list to process.
     */
    ListID: string,
    /**
     * The number of records to process in a single batch.
     */
    ListBatchSize?: number,
    /**
     * The total number of list records to process. Mostly for testing purposes.
     */
    MaxListRecords?: number,
    /**
     * The ID of the recommendation run that contains all of the 
     * recommendations and recommendation items to use
     */
    RecommendationRunIDs: string[],
    /**
     * The UserInfo object to use
     */
    CurrentUser: UserInfo

    /**
     * The email address to use for testing. If this is set, the emails will be sent to this address
     */
    TestEmail?: string,
};

export type GetListRecordsParams = {
    List: ListEntity,
    ListBatchSize: number,
    Offset: number,
    CurrentUser?: UserInfo
}

export type GetRecommendationsParams = {
    ListID: string,
    ContextData?: Record<string, any>,
    CurrentUser: UserInfo,
    CreateErrorList?: boolean
}

export type CreateEntityDocumentTemplateParams = {
    TemplateName: string,
    TemplateDescription?: string,
    TemplateType?: string,
    EntityName: string,
    TemplateParamName?: string,
    IncludeNullableFields?: boolean,
    Fields?: string[],
    CurrentUser: UserInfo
}

export type CreateEntityDocumentTemplateResults = {
    Template: TemplateEntity,
    TemplateContent: TemplateContentEntity,
    TemplateParam: TemplateParamEntity
}

export type CreateEntityDocumentParams = {
    EntityDocumentName: string,
    EntityName: string,
    TemplateID: string,
    VectorDatabaseName?: string,
    AIModelName?: string,
    CurrentUser: UserInfo
}

export type CreateListParams = {
    ListName: string,
    ListDescription?: string,
    EntityName: string,
    Filter?: string,
    CurrentUser: UserInfo
};