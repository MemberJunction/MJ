import { EntityVectorSyncer } from '@memberjunction/ai-vector-sync';
import { AIEngine } from '@memberjunction/aiengine';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { SQLServerProviderConfigData, setupSQLServerClient, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { LoadGeneratedEntities } from 'mj_generatedentities';
import { AppDataSource } from './db.js';
import { currentUserEmail } from './config.js';
// import { AIModelEntityExtended, EntityBehaviorEntityExtended, EntityBehaviorTypeEntity } from '@memberjunction/core-entities'
// import { BaseLLM, ChatParams, GetAIAPIKey } from "@memberjunction/ai";
import { LoadOpenAILLM } from '@memberjunction/ai-openai';
import { LoadPineconeVectorDB } from '@memberjunction/ai-vectors-pinecone';
import { LoadMistralEmbedding } from '@memberjunction/ai-mistral';
import { LoadRexRecommendationsProvider } from "@memberjunction/ai-recommendations-rex"
import { LoadProvider } from "@memberjunction/communication-sendgrid";

LoadGeneratedEntities();
LoadOpenAILLM();
LoadMistralEmbedding();
LoadPineconeVectorDB();
LoadRexRecommendationsProvider();
LoadSendGridProvider();

const config = new SQLServerProviderConfigData(AppDataSource, '', '__mj', 5000);

const dataSource = await AppDataSource.initialize();
const sqlServerDataProvider = await setupSQLServerClient(config);
const currentUser = UserCache.Users.find(u => u.Email === currentUserEmail);
console.log(currentUser, UserCache.Users.length, currentUserEmail);


let vectorizer = new EntityVectorSyncer();
await vectorizer.Config(false, currentUser);

vectorizer.CurrentUser = currentUser;
await AIEngine.Instance.Config(false, systemUser);


await vectorizer.SendEmails().then(() => {
  console.log('Done');
});