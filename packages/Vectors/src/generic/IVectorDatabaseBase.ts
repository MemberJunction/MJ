//The idea here is to create an abstraction layer that will wrap
// many of the common things you do in a vector DB, for example, 
//enumerate indexes and add indexes, operations we’ll need to be able 
//to do programmatically
export interface IVectorDatabaseBase {
    listIndexes(options?: any): any;
    getIndex(indexName: string, options?: any): any;
    createIndex(options: any): any;
    deleteIndex(indexID: any, options?: any): any;
    editIndex(indexID: any, options?: any): any;
}