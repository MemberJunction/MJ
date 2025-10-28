import { RunViewParams } from "@memberjunction/core";

export type EntitySyncConfig = {
    /**
     * The ID of the entity document to use
     */
    EntityDocumentID: string;
    /**
     * The time, in seconds, inbetween each run
     */
    Interval: number;
    /**
     * The parameters to use when running the dynamic view.
     * Note that the EntityName property will be overriden
     * and set to the value of the Entity Document's Type field
     * */
    RunViewParams: RunViewParams,
    /**
     * If the given entity should be included in the sync
     */
    IncludeInSync: boolean,
    /**
     * The last time the sync was run for this entitiy
     * format is Month day, year hour:minute:second
     * e.g. August 19, 1975 23:15:30
     */
    LastRunDate: string,
    /**
     * The ID of the vector index to use
     */
    VectorIndexID: number,
    /**
     * The ID of the vector databse to use
     */
    VectorID: number
}