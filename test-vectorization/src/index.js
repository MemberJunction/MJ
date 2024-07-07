import { EntityVectorSyncer } from '@memberjunction/ai-vector-sync';
import { AIEngine } from '@memberjunction/aiengine';
import { Metadata, UserInfo } from '@memberjunction/core';
import { SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { LoadGeneratedEntities } from 'mj_generatedentities';
import { AppDataSource } from './db.js';
// import { AIModelEntityExtended, EntityBehaviorEntityExtended, EntityBehaviorTypeEntity } from '@memberjunction/core-entities'
// import { BaseLLM, ChatParams, GetAIAPIKey } from "@memberjunction/ai";
import { LoadOpenAILLM } from '@memberjunction/ai-openai';
import { LoadPineconeVectorDB } from '@memberjunction/ai-vectors-pinecone';

const SYSTEM_USER_ID = 8;

const config = new SQLServerProviderConfigData(AppDataSource, '', '__mj', 5000);

await AppDataSource.initialize();
await setupSQLServerClient(config);

LoadGeneratedEntities();
LoadOpenAILLM();
LoadPineconeVectorDB();

const params = {
  EntityID: 25051002, // Contacts
  EntityDocumentID: 1,
};

const md = new Metadata();
const systemUser = new UserInfo(md, {
  ID: SYSTEM_USER_ID,
  Name: 'System User',
  Email: 'not.set@nowhere.com',
  UserRoles: [{ UserID: SYSTEM_USER_ID, RoleName: 'UI' }],
});

let vectorizer = new EntityVectorSyncer();
vectorizer.CurrentUser = systemUser;

await AIEngine.Instance.Config(false, systemUser);

let entityDocument = null;
if (params.EntityDocumentID) {
  entityDocument = await vectorizer.GetEntityDocument(params.EntityDocumentID);
} else {
  entityDocument = await vectorizer.GetFirstActiveEntityDocumentForEntity(params.EntityID);
  if (!entityDocument) {
    throw Error(`No active Entity Document found for entity ${params.EntityID}`);
  }
}

if (!entityDocument) {
  throw new Error(`No active Entity Document found for entity ${params.EntityID}`);
}

//for testing
/** @type {import('@memberjunction/ai-vector-sync').VectorSyncRequest} */
const request = {
  entityID: entityDocument.EntityID,
  entityDocumentID: entityDocument.ID,
  batchCount: 20,
  options: {},
};

console.log(request);

console.log('vectorizing entity...');
await vectorizer.VectorizeEntity(request, systemUser);

console.log('Done');
process.exit('0');
