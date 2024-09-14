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
import { LoadMistralEmbedding } from '@memberjunction/ai-mistral';
import { RecommendationEngineBase } from "@memberjunction/ai-recommendations";
import { LoadRexRecommendationsProvider } from "@memberjunction/ai-recommendations-rex"

const SYSTEM_USER_ID = "860AFD90-F76A-EF11-BDFD-00224877C022";

const config = new SQLServerProviderConfigData(AppDataSource, '', '__mj', 5000);

const dataSource = await AppDataSource.initialize();
const sqlServerDataProvider = await setupSQLServerClient(config);

LoadGeneratedEntities();
LoadOpenAILLM();
LoadMistralEmbedding();
LoadPineconeVectorDB();
LoadRexRecommendationsProvider();

const params = {
  EntityID: "D8A2B7F5-FB71-EF11-BDFD-000D3AF6A893",
  EntityDocumentID: "002B5E3E-1E71-EF11-BDFD-000D3AF6A893",
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
  listID: 'D8A2B7F5-FB71-EF11-BDFD-000D3AF6A893',
  batchCount: 25,
  options: {},
};

console.log(request);

console.log('vectorizing entity...');
//await vectorizer.VectorizeEntity(request, systemUser);
//await vectorizer.CreateTemplateForEntityDocument(entityDocument);
await vectorizer.GetRecommendations();

console.log('Done');
process.exit('0');
