import { AutotagLocalFileSystem } from '../../packages/ContentAutotagging/dist/src/LocalFileSystem/index.js';
import { AutotagAzureBlob } from '../../packages/ContentAutotagging/dist/src/CloudStorage/index.js';
import { AIEngine } from '@memberjunction/aiengine';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
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
const config = new SQLServerProviderConfigData(pool, '__mj', 5000);
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

await AIEngineBase.Instance.Config(false, systemUser);

// let autotagger = new AutotagLocalFileSystem()
const connectionString = 'BlobEndpoint=https://mstaautotagstorage.blob.core.windows.net/;QueueEndpoint=https://mstaautotagstorage.queue.core.windows.net/;FileEndpoint=https://mstaautotagstorage.file.core.windows.net/;TableEndpoint=https://mstaautotagstorage.table.core.windows.net/;SharedAccessSignature=sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2025-12-31T06:04:13Z&st=2025-09-12T20:49:13Z&spr=https&sig=gwS%2Bjr0i%2FBt0KlTN%2BU1GQAOnEKBLixwatfbtmD6bges%3D'
const containerName = 'autotag-test';
let autotagger = new AutotagAzureBlob(connectionString, containerName);

const contentSourceTypeID = await autotagger.engine.setSubclassContentSourceType('Azure Blob Storage', systemUser);
const contentSources = await autotagger.engine.getAllContentSources(systemUser, contentSourceTypeID)
const discoveredItems = await autotagger.DiscoverContentToProcess(contentSources, systemUser);
const contentItems = [];

for (const [item, discoveryResult] of discoveredItems.entries()) {
  try {
    console.log(`Processing item: ${item.ID} - ${item.Name}`);
    const contentItem = await autotagger.SetSingleContentItem(discoveryResult, systemUser);
    contentItems.push(contentItem);

  } catch (error) {
    console.error(`Error processing item ${item.ID}:`, error);
  }
}

for (const contentItem of contentItems) {
  console.log(`Tagging item: ${contentItem.ID} - ${contentItem.Name}`);
  await autotagger.TagSingleContentItem(contentItem, systemUser);
}

console.log('All items processed.');