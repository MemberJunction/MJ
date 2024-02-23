export interface IEmbeddingBase {
    createEmbedding(text: string, options?: any): any;
    createBatchEmbedding(text: string[], options?: any): any;
}