export type PageRecordsParams = {
    EntityID: string | number;
    PageNumber: number;
    PageSize: number;
    ResultType: "entity_object" | "simple" | "count_only"
};