export interface IVectorDatabase {
    listIndexes(options?: any): any;
    createIndex(options: any): any;
    deleteIndex(indexID: any, options?: any): any;
    editIndex(indexID: any, options?: any): any;
}