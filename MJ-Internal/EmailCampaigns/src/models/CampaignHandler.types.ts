import { UserInfo } from "@memberjunction/core";
import { ListEntity } from "@memberjunction/core-entities";

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
    RecommendationRunID: string,
    /**
     * The UserInfo object to use
     */
    CurrentUser: UserInfo
};

export type GetListRecordsParams = {
    List: ListEntity,
    ListBatchSize: number,
    Offset: number,
    CurrentUser?: UserInfo
}