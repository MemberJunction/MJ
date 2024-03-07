import { IndexModel, Pinecone, IndexList, Index, RecordMetadata, 
    PineconeRecord, UpdateOptions, FetchResponse, CreateIndexOptions } from '@pinecone-database/pinecone';
import { pineconeDefaultIndex } from '../config';
import { IVectorDatabase, IVectorIndex } from '@memberjunction/vectors';
import { error } from 'console';
import { RegisterClass } from '@memberjunction/global'
import { FetchResponse, Index, Pinecone, PineconeRecord, QueryOptions } from '@pinecone-database/pinecone';
import { BaseRequestParams, BaseResponse, CreateIndexParams, EditIndexParams, IndexDescription, IndexList, QueryResponse, RecordMetadata, VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';

@RegisterClass(PineconeDatabase)
export class PineconeDatabase implements IVectorDatabase, IVectorDatabase {

    static _pinecone: Pinecone;
    
    constructor(apiKey: string){
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

    public async getIndexDescription(indexName: string): Promise<IndexModel> {
        const description: IndexModel = await this.pinecone.describeIndex(indexName);
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

    public async listIndexes(): Promise<IndexList> {
        const indexes: IndexList = await this.pinecone.listIndexes();
        return indexes;
    }

    /**
     * If an indexName is not provided, this will use the default index name
     * defined in the environment variables instead.
     */
    public getIndex<T extends RecordMetadata>(indexName?: string): Index<T> {
        const name: string = indexName || pineconeDefaultIndex;
        return this.pinecone.Index<T>(name);
    }

    /**
     * @example
     * The minimum required configuration to create an index is the index `name`, `dimension`, and `spec`.
     * ```js
     * await pinecone.createIndex({ name: 'my-index', dimension: 128, spec: { serverless: { cloud: 'aws', region: 'us-west-2' }}})
     * ```
     */
    public async createIndex(options: CreateIndexOptions): Promise<void> {
        await this.pinecone.createIndex(options);
    }

    public async deleteIndex(indexName: string): Promise<void> {
        await this.pinecone.deleteIndex(indexName);
    }

    public async editIndex(indexID: any, options?: any): Promise<void> {
       throw new error("Method not implemented");
    }

    public async createRecord(params: VectorRecord): Promise<BaseResponse> {
        let records: VectorRecord[] = [params];
        let result = await this.createRecords(records);

        return this.wrapResponse(result);
    }

    public async createRecords<T extends RecordMetadata>(records: PineconeRecord<T>[], options?: any): Promise<void> {
        const index = this.getIndex<T>();
        await index.upsert(records);
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

    public async queryRecords(params: QueryOptions): Promise<BaseResponse> {
        let index: Index = this.getIndex().data;
        let result = await index.query(params);
        return this.wrapResponse(result);
    }

    private wrapResponse(data: any): BaseResponse {
        return {
            success: true,
            message: null,
            data: data
        }
    };
}