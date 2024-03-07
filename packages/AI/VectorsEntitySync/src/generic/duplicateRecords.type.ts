export type DuplicateRecordSearchParams = {
    entitiyDocumentID: number,
    recordID: number;
    entitiyID?: number;
    entityName?: string;
    storedProcedureName?: string;
    options?: any;
    limit?: number;
    range?: number;
}

export type DuplicateRecordSearchResult = {
    entityID: number;
    duplicates: DuplicateRecord[]
}

export type DuplicateRecord = {
    recordID: number;
    score: number
}

