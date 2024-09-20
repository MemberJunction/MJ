export type PageRecordsParams = {
    /**
     * The ID of the entitiy to get the records from
     */
    EntityID: string | number;
    /**
     * Number of records to offset. This number will be multiplied by the PageSize to get the actual offset
     */
    PageNumber: number;
    /**
     * Number of records returned per page
     */
    PageSize: number;
    /**
     * The type of result to return
     */
    ResultType: "entity_object" | "simple" | "count_only",
    /**
     * Filter to apply to the query
     */
    Filter?: string;
};