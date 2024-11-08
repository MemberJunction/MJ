import { UserInfo } from "@memberjunction/core"

export type GetDataParams = {
    RecordID: string,
    SourceRecordEntityName: string,
    RecommendationRunID: string,
    CurrentUser?: UserInfo
};