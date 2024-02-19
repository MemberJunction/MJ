import { OpenAIEmbedding } from '@memberjunction/vectors';
import { IndexModel, Pinecone, IndexList, Index, RecordMetadata, PineconeRecord, UpdateOptions, FetchResponse, CreateIndexOptions } from '@pinecone-database/pinecone';
import { pineconeAPIKey, pineconeDefaultIndex } from '../config';
import { Customer } from '../Types/Customer';
import * as fs from 'fs';
import { Account } from '../Types/Accounts';

export class PineconeDatabse extends OpenAIEmbedding {

    static _pinecone: Pinecone;
    static _indexCache: Map<string, Index<RecordMetadata>>;

    constructor(){
        super();
        if(!PineconeDatabse._pinecone){
            PineconeDatabse._pinecone = new Pinecone({
                apiKey: pineconeAPIKey
            });
        }
    }

    get pinecone(): Pinecone { return PineconeDatabse._pinecone; }
    get indexCache(): Map<string, Index<RecordMetadata>> {return PineconeDatabse._indexCache }

    public async getIndexDescription(indexName: string): Promise<IndexModel> {
        const description: IndexModel = await this.pinecone.describeIndex(indexName);
        return description;
    }

    public async getDefaultIndex(): Promise<Index<RecordMetadata>> {
        if(pineconeDefaultIndex){
            return this.pinecone.Index(pineconeDefaultIndex);
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

    public async UpsertRecord<T extends RecordMetadata>(record: PineconeRecord<T>): Promise<void> {
        let records: PineconeRecord<T>[] = [record];
        await this.UpsertRecords(records);
    }

    public async UpsertRecords<T extends RecordMetadata>(records: PineconeRecord<T>[]): Promise<void> {
        const index = this.getIndex<T>();
        await index.upsert(records);
    }

    public async UpdateRecord<T extends RecordMetadata>(data: UpdateOptions<T>): Promise<void> {
        const index = this.getIndex();
        index.update(data)
    }

    public async fetchRecord<T extends RecordMetadata>(id: string) {
        return await this.fetchRecords<T>([id]);
    }

    public async fetchRecords<T extends RecordMetadata>(Ids: string[]) {
        const index = this.getIndex<T>();
        const fetchResult: FetchResponse<T> = await index.fetch(Ids);
        return fetchResult;
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

    public async createIndexFromIndex(newIndexName: string, existingIndex: string, options?: CreateIndexOptions): Promise<void> {
        const description: IndexModel = await this.getIndexDescription(existingIndex);

        if(!description){
            console.log("PineconeDatabse.createIndexFromIndex: No index return for name", existingIndex);
            return;
        }

        const config: CreateIndexOptions = {
            name: newIndexName,
            dimension: options?.dimension || description.dimension,
            spec: options?.spec || description.spec,
            metric: options?.metric || description.metric,
            waitUntilReady: options?.waitUntilReady || false,
            suppressConflicts: options?.suppressConflicts || false,
        };

        await this.createIndex(config);
    }

    public async deleteIndex(indexName: string): Promise<void> {
        await this.pinecone.deleteIndex(indexName);
    }

    public getCustomerJSONData(): Customer[] {
        const sampleData: Customer[] = JSON.parse(fs.readFileSync("./SampleData/Customers.json", "utf-8"));
        return sampleData;
    }

    public getAccountJSONData(): Account[] {
        const sampleData: Account[] = JSON.parse(fs.readFileSync("./SampleData/Accounts.json", "utf-8"));
        return sampleData;
    }
}