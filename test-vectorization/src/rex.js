import { EntityVectorSyncer } from '@memberjunction/ai-vector-sync';
import { AIEngine } from '@memberjunction/aiengine';
import { RexRecommendationsProvider, LoadRexRecommendationsProvider } from '@memberjunction/rex-recommendations';
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
LoadRexRecommendationsProvider();

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

let rex = new RexRecommendationsProvider();

const request = {
    ListID: '8E59846B-9298-EF11-88CF-002248306D26', 
    CurrentUser: systemUser,
    Options: {
        type: 'person',
        filters: [{
            type: "course",
            max_results: 5
        },
        {
            type: "person",
            max_results: 5
        }], 
        EntityDocumentID: '38D60434-948D-EF11-8473-002248306CAC'
    }
};

const recommendations = await rex.GetRecommendations(request);

console.log('Done');
process.exit('0');
