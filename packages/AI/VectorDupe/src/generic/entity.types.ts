export type EntityDocument = {
    ID: number,
    Name: string,
    EntityID: number,
    TypeID: number,
    Status: string,
    Template: string,
    CreatedAt: Date,
    UpdatedAt: Date,
    Type: string,
    VectorIndexID: number,
    VectorID: number
}

export type EntitiyRecordDocument = {
    ID: number,
    EntityID: number,
    RecordID: number,
    DocumentText: string,
    VectorIndexID: number,
    VectorID: number,
    VectorJSON: string,
    EntitiyRecordUpdatedAt: Date
}