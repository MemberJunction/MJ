import { pineconeDefaultIndex } from '../config';
import { error } from 'console';
import { RegisterClass } from '@memberjunction/global'
import { Index, Pinecone } from '@pinecone-database/pinecone';
import { BaseRequestParams, BaseResponse, CreateIndexParams, EditIndexParams, IndexDescription, IndexList, RecordMetadata, VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';

@RegisterClass(VectorDBBase, "PineconeDatabase", 1)
export class PineconeDatabase  implements VectorDBBase {

    static _pinecone: Pinecone;
    
    constructor(apiKey: string){
        if(!PineconeDatabase._pinecone){
            PineconeDatabase._pinecone = new Pinecone({
                apiKey: apiKey
            });
        }
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
    public getIndex(params: BaseRequestParams): BaseResponse {
        const name: string = params.id || pineconeDefaultIndex;
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
    public async createIndex<T>(options: CreateIndexParams): Promise<BaseResponse> {
        const result = await this.pinecone.createIndex({
            name: options.id,
            dimension: options.dimension,
            metric: options.metric,
            spec: options.additionalParams
        });

        const res: BaseResponse = {
            message: "",
            success: true,
            data: result
        };

        return res;
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

    // End IVectorDatabaseBase implementation

    // Begin IVectorIndexBase implementation

    public async createRecord(record: VectorRecord): Promise<BaseResponse> {
        let records: VectorRecord[] = [record];
        let result = await this.createRecords(records);

        const res: BaseResponse = {
            message: "",
            success: true,
            data: result
        };

        return res;
    }

    public async createRecords(records: VectorRecord[]): Promise<void> {
        const index = await this.getDefaultIndex();
        let result = await index.upsert(records);

        const res: BaseResponse = {
            message: "",
            success: true,
            data: result
        };

        return res;
    }

    public async getRecord<T extends RecordMetadata>(id: string, options?: any) {
        return await this.getRecords<T>([id]);
    }

    public async getRecords<T extends RecordMetadata>(Ids: string[], options?: any) {
        const index = this.getIndex<T>();
        const fetchResult: FetchResponse<T> = await index.fetch(Ids);
        return fetchResult;
    }

    public async updateRecord<T extends RecordMetadata>(data: UpdateOptions<T>, options?: any): Promise<void> {
        const index = this.getIndex();
        index.update(data)
    }

    public async updateRecords<T extends RecordMetadata>(data: UpdateOptions<T>[], options?: any): Promise<void> {
        throw new Error("Method not implemented");
    }

    public async deleteRecord<T extends RecordMetadata>(id: string, options?: any): Promise<void> {
        const index = this.getIndex<T>();
        index.deleteOne(id);
    }

    public async deleteRecords<T extends RecordMetadata>(ids?: string[], options?: any): Promise<void> {
        const index = this.getIndex<T>();
        if(ids){
            await index.deleteMany(ids);
        }
        else if(options){
            index.deleteMany(options);
        }
    }

    public async deleteAllRecords<T extends RecordMetadata>(options?: any): Promise<void> {
        const index = this.getIndex<T>();
        if(options?.namespace){
            await index.namespace(options.namespace).deleteAll();
        }
        else{
            index.deleteAll();
        }
    }

    // End IVectorIndexBase implementation
}