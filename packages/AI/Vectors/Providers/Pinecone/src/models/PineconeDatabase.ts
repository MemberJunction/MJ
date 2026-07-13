import { pineconeDefaultIndex } from '../config';
import { error } from 'console';
import { RegisterClass } from '@memberjunction/global'
import { FetchResponse, Index, Pinecone, QueryOptions } from '@pinecone-database/pinecone';
import { BaseRequestParams, BaseResponse, CreateIndexParams, EditIndexParams, IndexDescription, IndexList, ListVectorIDsParams, ListVectorIDsResult, QueryResponse, RecordMetadata, VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';


export type BaseMetadata = {
    RecordID: string
    Entity: string,
    TemplateID: string,
}

@RegisterClass(VectorDBBase, "PineconeDatabase")
export class PineconeDatabase extends VectorDBBase {

    private _pinecone: Pinecone;
    private _defaultIndex: Index<RecordMetadata> = null;

    constructor(apiKey: string){
        super(apiKey);
        this._pinecone = new Pinecone({
            apiKey: apiKey
        });
    }

    protected get ApiKey(): string {
        throw new Error('Method not implemented.');
    }

    get pinecone(): Pinecone { return this._pinecone; }

    public async GetIndexDescription(params: BaseRequestParams): Promise<IndexDescription> {
        const description: IndexDescription = await this.pinecone.describeIndex(params.id);
        return description;
    }

    public async GetDefaultIndex(): Promise<Index<RecordMetadata>> {
        if(this._defaultIndex){
            return this._defaultIndex;
        }

        if(pineconeDefaultIndex){
            let defaultIndex = this.pinecone.Index(pineconeDefaultIndex);
            if(defaultIndex){
                this._defaultIndex = defaultIndex;
                return defaultIndex;
            }
        }

        const indexList = await this.ListIndexes();
        if(indexList && indexList.indexes && indexList.indexes.length > 0){
            const indexName: string = indexList.indexes[0].name;
            this._defaultIndex = this.pinecone.index(indexName);
            return this._defaultIndex;
        }

        LogStatus("Attempted to fetch default index but none were found");
        return null;
    }

    public async ListIndexes(): Promise<IndexList> {
        const indexes: IndexList = await this.pinecone.listIndexes();
        return indexes;
    }

    /**
     * If an indexName is not provided, this will use the default index name
     * defined in the environment variables instead.
     */
    public GetIndex(params?: BaseRequestParams): BaseResponse {
        const name: string = params?.id || pineconeDefaultIndex;
        if(!name){
            throw new Error("id not found in params and PINECONE_DEFAULT_INDEX not found in env variables");
        }

        const result: BaseResponse = {
            message: "",
            success: true,
            data: this.pinecone.Index(name)
        };

        return result;
    }

    /**
     * @example
     * The minimum required configuration to create an index is the index `name`, `dimension`, and `spec`.
     * ```js
     * await pinecone.createIndex({ name: 'my-index', dimension: 128, spec: { serverless: { cloud: 'aws', region: 'us-west-2' }}})
     * ```
     */
    public async CreateIndex(options: CreateIndexParams): Promise<BaseResponse> {
        try{
            const result = await this.pinecone.createIndex({
                name: options.id,
                dimension: options.dimension,
                metric: options.metric,
                spec: options.additionalParams
            });

            return this.wrapSuccessResponse(result);
        }
        catch(ex){
            LogError("Error creating index", undefined, ex);
            return this.wrapFailureResponse();
        }
    }

    public async DeleteIndex(params: BaseRequestParams): Promise<BaseResponse> {
        try{
            await this.pinecone.deleteIndex(params.id);
            return this.wrapSuccessResponse(null);
        }
        catch(ex){
            LogError("Error deleting index", undefined, ex);
            return this.wrapFailureResponse();
        }
    }

    public async EditIndex(params: EditIndexParams): Promise<BaseResponse> {
       throw new error("Method not implemented");
    }

    // Pinecone authenticates via its own API key, so contextUser is unused here.
    // Accepting the parameter keeps the override compatible with the abstract
    // signature added in @memberjunction/ai-vectordb v5.30+.
    public async QueryIndex(params: QueryOptions, _contextUser?: UserInfo): Promise<BaseResponse> {
        try{
            // Use index name from params.id if available (for multi-index support)
            // But strip 'id' before passing to Pinecone query() since Pinecone treats
            // 'id' as "query by record ID" which is mutually exclusive with 'vector'
            const indexId = 'id' in params ? (params as { id: string }).id : undefined;
            let index: Index = this.GetIndex(indexId ? { id: indexId } : undefined).data;
            const queryParams = { ...params };
            if (indexId && 'vector' in queryParams) {
                delete (queryParams as Record<string, unknown>)['id'];
            }
            let result: QueryResponse = await index.query(queryParams);
            return this.wrapSuccessResponse(result);
        }
        catch(ex){
            LogError("Error querying index", undefined, ex);
            return this.wrapFailureResponse();
        }
    }

    public async CreateRecord(params: VectorRecord): Promise<BaseResponse> {
        try{
            let records: VectorRecord[] = [params];
            let result = await this.CreateRecords(records);
            return this.wrapSuccessResponse(result);
        }
        catch(ex){
            LogError("Error creating record", undefined, ex);
            return this.wrapFailureResponse();
        }
    }

    public async CreateRecords(records: VectorRecord[], indexName?: string): Promise<BaseResponse> {
        try{
            const index: Index = await this.GetIndex(indexName ? { id: indexName } : undefined).data;
            let result = await index.upsert(records);
            return this.wrapSuccessResponse(result);
        }
        catch(ex){
            // Return a FAILURE response — never a success with null data. Reporting success here
            // silently swallows real upsert errors (e.g. "Vector dimension 1536 does not match the
            // dimension of the index 512"), making the whole vectorization pipeline claim it worked.
            LogError("Error creating records", undefined, ex);
            return this.wrapFailureResponse(ex instanceof Error ? ex.message : String(ex));
        }
    }

    public async GetRecord(params: BaseRequestParams): Promise<BaseResponse> {
        try{
            let result = await this.GetRecords(params);
            return this.wrapSuccessResponse(result);
        }
        catch(ex){
            LogError("Error getting record", undefined, ex);
            return this.wrapFailureResponse();
        }
    }

    public async GetRecords(params: BaseRequestParams): Promise<BaseResponse> {
        try{
            const index: Index = this.GetIndex(params).data;
            const fetchResult: FetchResponse = await index.fetch(params.data);
            return this.wrapSuccessResponse(fetchResult);
        }
        catch(ex){
            // Failure must report failure — returning a success response with null data swallows
            // the fetch error and makes callers believe the records were retrieved.
            LogError("Error getting records", undefined, ex);
            return this.wrapFailureResponse(ex instanceof Error ? ex.message : String(ex));
        }
    }

    public async UpdateRecord(params: BaseRequestParams): Promise<BaseResponse> {
        try{
            const index: Index = this.GetIndex().data;
            let result = index.update(params.data);
            return this.wrapSuccessResponse(result);
        }
        catch(ex){
            LogError("Error updating record", undefined, ex);
            return this.wrapFailureResponse();
        }
    }

    public async UpdateRecords(params: BaseRequestParams): Promise<BaseResponse> {
        throw new Error("Method not implemented");
    }

    public async DeleteRecord(record: VectorRecord, indexName?: string): Promise<BaseResponse> {
        try{
            const index: Index = this.GetIndex(indexName ? { id: indexName } : undefined).data;
            let result = index.deleteOne(record.id);
            return this.wrapSuccessResponse(result);
        }
        catch(ex){
            LogError("Error deleting record", undefined, ex);
            return this.wrapFailureResponse();
        }
    }

    public async DeleteRecords(records: VectorRecord[], indexName?: string): Promise<BaseResponse> {
        try{
            const index: Index = this.GetIndex(indexName ? { id: indexName } : undefined).data;
            const IDMap: string[] = records.map((record: VectorRecord) => record.id);
            let result = index.deleteMany(IDMap);
            return this.wrapSuccessResponse(result);
        }
        catch(ex){
            return this.wrapFailureResponse();
        }
    }

    public async DeleteAllRecords(indexName: string, namespace?: string): Promise<BaseResponse> {
        try {
            const index: Index = this.GetIndex({ id: indexName }).data;
            if (namespace) {
                await index.namespace(namespace).deleteAll();
            } else {
                await index.deleteAll();
            }
            return this.wrapSuccessResponse(null);
        }
        catch(ex){
            LogError("Error deleting all records", undefined, ex);
            return this.wrapFailureResponse();
        }
    }

    public async ListVectorIDs(params: ListVectorIDsParams): Promise<ListVectorIDsResult> {
        try {
            const index = this.GetIndex({ id: params.IndexName }).data;
            const ns = params.Namespace ? index.namespace(params.Namespace) : index;

            const listParams: Record<string, unknown> = {
                limit: params.Limit ?? 100,
            };
            if (params.PaginationToken) {
                listParams['paginationToken'] = params.PaginationToken;
            }
            if (params.Prefix) {
                listParams['prefix'] = params.Prefix;
            }

            const result = await ns.listPaginated(listParams);
            const ids = (result.vectors ?? []).map((v: { id: string }) => v.id);

            return {
                IDs: ids,
                NextPaginationToken: result.pagination?.next,
            };
        } catch (ex) {
            LogError("Error listing vector IDs", undefined, ex);
            return { IDs: [] };
        }
    }

}
