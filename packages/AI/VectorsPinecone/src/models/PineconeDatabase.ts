import { pineconeDefaultIndex } from '../config';
import { error } from 'console';
import { RegisterClass } from '@memberjunction/global'
import { FetchResponse, Index, Pinecone, PineconeRecord, QueryOptions } from '@pinecone-database/pinecone';
import { BaseRequestParams, BaseResponse, CreateIndexParams, EditIndexParams, IndexDescription, IndexList, RecordMetadata, VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';

@RegisterClass(VectorDBBase, "PineconeDatabase", 1)
export class PineconeDatabase  extends VectorDBBase {

    static _pinecone: Pinecone;
    
    constructor(apiKey: string){
        super(apiKey);
        if(!PineconeDatabase._pinecone){
            PineconeDatabase._pinecone = new Pinecone({
                apiKey: apiKey
            });
        }
    }
    protected get apiKey(): string {
        throw new Error('Method not implemented.');
    }
    

    get pinecone(): Pinecone { return PineconeDatabase._pinecone; }

    public async getIndexDescription(params: BaseRequestParams): Promise<IndexDescription> {
        const description: IndexDescription = await this.pinecone.describeIndex(params.id);
        return description;
    }

    public async getDefaultIndex(): Promise<Index<RecordMetadata>> {
        if(pineconeDefaultIndex){
            let defaultIndex = this.pinecone.Index(pineconeDefaultIndex);
            if(defaultIndex){
                return defaultIndex;
            }
        }

        const indexList = await this.listIndexes();

        if(indexList && indexList.indexes && indexList.indexes.length > 0){
            const indexName: string = indexList.indexes[0].name;
            return this.pinecone.index(indexName);
        }
        return null;
    }


    // Begin IVectorDatabaseBase implementation

    public async listIndexes(): Promise<IndexList> {
        const indexes: IndexList = await this.pinecone.listIndexes();
        return indexes;
    }

    /**
     * If an indexName is not provided, this will use the default index name
     * defined in the environment variables instead.
     */
    public getIndex(params?: BaseRequestParams): BaseResponse {
        const name: string = params?.id || pineconeDefaultIndex;
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
    public async createIndex(options: CreateIndexParams): Promise<BaseResponse> {
        const result = await this.pinecone.createIndex({
            name: options.id,
            dimension: options.dimension,
            metric: options.metric,
            spec: options.additionalParams
        });

        return this.wrapResponse(result);
    }

    public async deleteIndex(params: BaseRequestParams): Promise<BaseResponse> {
        let result = await this.pinecone.deleteIndex(params.id);

        const res: BaseResponse = {
            message: "",
            success: true,
            data: result
        };

        return res;
    }

    public async editIndex(params: EditIndexParams): Promise<BaseResponse> {
       throw new error("Method not implemented");
    }

    public async queryIndex(params: QueryOptions): Promise<BaseResponse> {
        let index: Index = this.getIndex().data;
        let result = await index.query(params);
        return this.wrapResponse(result);
    }

    // End IVectorDatabaseBase implementation

    // Begin IVectorIndexBase implementation

    public async createRecord(params: VectorRecord): Promise<BaseResponse> {
        let records: VectorRecord[] = [params];
        let result = await this.createRecords(records);

        return this.wrapResponse(result);
    }

    public async createRecords(records: VectorRecord[]): Promise<BaseResponse> {
        const index: Index = await this.getIndex().data;
        let result = await index.upsert(records);

        return this.wrapResponse(result);
    }

    public async getRecord(params: BaseRequestParams): Promise<BaseResponse> {
        let result = await this.getRecords(params);

        return this.wrapResponse(result);
    }

    public async getRecords(params: BaseRequestParams): Promise<BaseResponse> {
        const index: Index = this.getIndex().data;
        const fetchResult: FetchResponse = await index.fetch(params.data);

        return this.wrapResponse(fetchResult);
    }

    public async updateRecord(params: BaseRequestParams): Promise<BaseResponse> {
        const index: Index = this.getIndex().data;
        let result = index.update(params.data);
        return this.wrapResponse(result);
    }

    public async updateRecords(params: BaseRequestParams): Promise<BaseResponse> {
        throw new Error("Method not implemented");
    }

    public async deleteRecord(record: VectorRecord): Promise<BaseResponse> {
        const index: Index = this.getIndex().data;
        let result = index.deleteOne(record.id);
        return this.wrapResponse(result);
    }

    public async deleteRecords(records: VectorRecord[]): Promise<BaseResponse> {
        const index: Index = this.getIndex().data;
        const IDMap: string[] = records.map((record: VectorRecord) => record.id);
        let result = index.deleteMany(IDMap);
        return this.wrapResponse(result);
    }

    public async deleteAllRecords(params: BaseRequestParams): Promise<BaseResponse> {
        const index: Index = this.getIndex().data;
        if(params?.data){
            await index.namespace(params?.data).deleteAll();
        }
        else{
            index.deleteAll();
        }
        return this.wrapResponse(null);
    }

    private wrapResponse(data: any): BaseResponse {
        return {
            success: true,
            message: null,
            data: data
        }
    };

    // End IVectorIndexBase implementation
}