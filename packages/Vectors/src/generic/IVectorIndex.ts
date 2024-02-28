export interface IVectorIndex {
    createRecord(record: any, options?: any): any;
    createRecords(records: any[], options?: any): any;
    getRecord(recordID: any, options?: any): any;
    getRecords(recordIDs: any[], options?: any): any;
    updateRecord(record: any, options?: any): any;
    updateRecords(records: any[], options?: any): any;
    deleteRecord(recordID: any, options?: any): any;
    deleteRecords(recordIDs: any[], options?: any): any;
}