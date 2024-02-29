import { BaseRequestParams, BaseResponse, CreateIndexParams, EditIndexParams, IndexList, RecordMetadata, UpdateOptions, VectorRecord } from "./record";
import { QueryOptions, QueryResponse } from "./query";

export abstract class VectorDBBase {
    private _apiKey: string;
    /**
     * Only sub-classes can access the API key
     */
    protected get apiKey(): string {
        return this._apiKey;
    }

    constructor (apiKey: string) {
        if (!apiKey || apiKey.trim().length === 0)
            throw new Error('API key cannot be empty');

        this._apiKey = apiKey;
    }

    //Union types to allow the sub class implementing the functions to mark them as async or not
    abstract listIndexes(): IndexList | Promise<IndexList>;
    abstract getIndex(params: BaseRequestParams): BaseResponse | Promise<BaseResponse>;
    abstract createIndex(params: CreateIndexParams): BaseResponse  | Promise<BaseResponse>;
    abstract deleteIndex(params: BaseRequestParams): BaseResponse  | Promise<BaseResponse>;
    abstract editIndex(params: EditIndexParams): BaseResponse  | Promise<BaseResponse>;
    abstract queryIndex(params: QueryOptions): BaseResponse | Promise<BaseResponse>;

    abstract createRecord(record: VectorRecord): BaseResponse  | Promise<BaseResponse>;
    abstract createRecords(record: VectorRecord[]): BaseResponse  | Promise<BaseResponse>;
    abstract getRecord(param: BaseRequestParams): BaseResponse  | Promise<BaseResponse>;
    abstract getRecords(params: BaseRequestParams): BaseResponse  | Promise<BaseResponse>;
    abstract updateRecord(record: UpdateOptions): BaseResponse  | Promise<BaseResponse>;
    abstract updateRecords(records: UpdateOptions): BaseResponse  | Promise<BaseResponse>;
    abstract deleteRecord(record: VectorRecord): BaseResponse  | Promise<BaseResponse>;
    abstract deleteRecords(records: VectorRecord[]): BaseResponse  | Promise<BaseResponse>;
}