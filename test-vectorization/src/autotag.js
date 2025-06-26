import { AutotagLocalFileSystem } from '@memberjunction/content-autotagging'
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

const md = new Metadata();
const systemUser = new UserInfo(sqlServerDataProvider, {
  ID: SYSTEM_USER_ID,
  Name: 'Nico Ortiz de Zárate',
  Email: 'nico@memberjunction.com',
  UserRoles: [
    { UserID: SYSTEM_USER_ID, RoleName: 'UI', RoleID: 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' }, 
    { UserID: SYSTEM_USER_ID, RoleName: 'Developer', RoleID: 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' },
    { UserID: SYSTEM_USER_ID, RoleName: 'Integration', RoleID: 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' }
  ],
});

await AIEngine.Instance.Config(false, systemUser);

let autotagger = new AutotagLocalFileSystem()

await autotagger.Autotag(systemUser)