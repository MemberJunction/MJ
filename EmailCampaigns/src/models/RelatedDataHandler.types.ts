import { UserInfo } from "@memberjunction/core"

export type GetDataParams = {
    RecordID: string,
    SourceRecordEntityName: string,
    RecommendationRunIDs: string[],
    CurrentUser?: UserInfo
};