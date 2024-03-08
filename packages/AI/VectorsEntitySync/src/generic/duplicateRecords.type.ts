import { PrimaryKeyValue } from "@memberjunction/core";

export type DuplicateRecordSearchParams = {
    entityDocumentID: number,
    PrimaryKeyValues: PrimaryKeyValue[]
    recordID: number;
    entityID?: number;
    entityName?: string;
    storedProcedureName?: string;
    options?: any;
    limit?: number;
    range?: number;
}

export type DuplicateRecordSearchResult = {
    entityID: number;
    duplicates: PotentialDuplicate[]
}

export type PotentialDuplicate = {
    PrimaryKeyValues: PrimaryKeyValue[]
    ProbabilityScore: number
}

