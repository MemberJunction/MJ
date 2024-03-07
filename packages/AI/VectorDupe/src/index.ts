export * from './generic/duplicateRecords.type';
export * from './generic/entity.types';
export * from './generic/vectorSyncBase';
export * from './models/entitySyncConfig';
export * from './duplicateRecordDetector';

import { DuplicateRecordDetector } from './duplicateRecordDetector';

//const evs = new EntityVectorSyncer();
//evs.syncEntityDocuments();

/*
const drd = new DuplicateRecordDetector();
drd.getDuplicateRecords({ entitiyDocumentID: 1, recordID: 5400 }).then((results) => {
    console.log("Results: ", results);
    console.log("done");
});
*/