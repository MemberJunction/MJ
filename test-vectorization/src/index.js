import { EntityVectorSyncer } from '@memberjunction/ai-vector-sync';
import { AIEngine } from '@memberjunction/aiengine';
import { Metadata, UserInfo } from '@memberjunction/core';
import { SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { LoadGeneratedEntities } from 'mj_generatedentities';
import { pool } from './db.js';
// import { AIModelEntityExtended, EntityBehaviorEntityExtended, EntityBehaviorTypeEntity } from '@memberjunction/core-entities'
// import { BaseLLM, ChatParams, GetAIAPIKey } from "@memberjunction/ai";
import { LoadOpenAILLM } from '@memberjunction/ai-openai';
import { LoadPineconeVectorDB } from '@memberjunction/ai-vectors-pinecone';
import { LoadMistralEmbedding } from '@memberjunction/ai-mistral';

const SYSTEM_USER_ID = "EDAFCCEC-6A37-EF11-86D4-000D3A4E707E";

await pool.connect();
const config = new SQLServerProviderConfigData(pool, '', '__mj', 5000);
const sqlServerDataProvider = await setupSQLServerClient(config);

LoadGeneratedEntities();
LoadOpenAILLM();
LoadMistralEmbedding();
LoadPineconeVectorDB();

const params = {
  EntityID: "5F248F34-2837-EF11-86D4-6045BDEE16E6", // Accounts
  EntityDocumentID: "A4AECCEC-6A37-EF11-86D4-000D3A4E707E",
};

const md = new Metadata();
const systemUser = new UserInfo(sqlServerDataProvider, {
  ID: SYSTEM_USER_ID,
  Name: 'Jonathan Stfelix',
  Email: 'jonathan.stfelix@bluecypress.io',
  UserRoles: [
    { UserID: SYSTEM_USER_ID, RoleName: 'UI', RoleID: 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' }, 
    { UserID: SYSTEM_USER_ID, RoleName: 'Developer', RoleID: 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' },
    { UserID: SYSTEM_USER_ID, RoleName: 'Integration', RoleID: 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' }
  ],
});

let vectorizer = new EntityVectorSyncer();
//await vectorizer.Config(false, systemUser);

vectorizer.CurrentUser = systemUser;
await AIEngine.Instance.Config(false, systemUser);

let entityDocument = await vectorizer.GetEntityDocument(params.EntityDocumentID);
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
//await vectorizer.CreateTemplateForEntityDocument(entityDocument);

console.log('Done');
process.exit('0');

