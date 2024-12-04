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

const SYSTEM_USER_ID = "ECAFCCEC-6A37-EF11-86D4-000D3A4E707E";

const config = new SQLServerProviderConfigData(AppDataSource, '', '__mj', 5000);

const dataSource = await AppDataSource.initialize();
const sqlServerDataProvider = await setupSQLServerClient(config);

LoadGeneratedEntities();
LoadOpenAILLM();
LoadMistralEmbedding();
LoadPineconeVectorDB();

const params = {  
  EntityID: "168AF8CE-BEEF-4B9E-892C-71D69DED7A09",    
  EntityDocumentID: "8FD31D21-19A2-EF11-88CD-6045BD325BD0"
};

const md = new Metadata();
const systemUser = new UserInfo(sqlServerDataProvider, {  
  ID: SYSTEM_USER_ID,  
  Name: 'Nico Ortiz de Zarate',  
  Email: 'nico@memberjunction.com',  
  UserRoles: [    
    { UserID: SYSTEM_USER_ID, 
      RoleName: 'UI', 
      RoleID: 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' },     
      { UserID: SYSTEM_USER_ID, 
        RoleName: 'Developer', 
        RoleID: 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' },    
        { UserID: SYSTEM_USER_ID, 
          RoleName: 'Integration', 
          RoleID: 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' }  
        ]
      });

let vectorizer = new EntityVectorSyncer();
//await vectorizer.Config(false, systemUser);

vectorizer.CurrentUser = systemUser;
await AIEngine.Instance.Config(false, systemUser);

let entityDocument = await vectorizer.GetEntityDocument(params.EntityDocumentID);
if (!entityDocument) {
  throw new Error(`No active Entity Document found for entity ${params.EntityID}`);
}

/** @type {import('@memberjunction/ai-vector-sync').VectorSyncRequest} */
const request = {  
  entityID: entityDocument.EntityID,
  entityDocumentID: entityDocument.ID,  
  listID: 'DC530117-C4B1-EF11-88D0-002248450A5B', 
  // CHEST product list  
  batchCount: 20,
  options: {}
  };

console.log(request);

console.log('vectorizing entity...');
await vectorizer.VectorizeEntity(request, systemUser);
//await vectorizer.CreateTemplateForEntityDocument(entityDocument);

console.log('Done');
process.exit('0');

