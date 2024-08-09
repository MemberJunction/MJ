export class ProcessRunParams {
    sourceID: number;
    startTime: Date;
    endTime: Date;
    numItemsProcessed: number;
}

export interface JsonObject {
    [key: string]: any;
}