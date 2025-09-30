// Temporary workaround version that bypasses TypeScript checking
import { AutotagAzureBlob } from '@memberjunction/content-autotagging';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { UserInfo, RunView } from '@memberjunction/core';
import { ContentItemEntity } from '@memberjunction/core-entities';
import { SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { LoadGeneratedEntities } from 'mj_generatedentities';
import { LoadOpenAILLM } from '@memberjunction/ai-openai';
import { LoadPineconeVectorDB } from '@memberjunction/ai-vectors-pinecone';
import { LoadMistralEmbedding } from '@memberjunction/ai-mistral';
import { pool } from './db.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SYSTEM_USER_ID = "EDAFCCEC-6A37-EF11-86D4-000D3A4E707E";

async function workingRetag(): Promise<void> {
    try {
        console.log('🚀 Starting re-tagging with working version...');
        
        // Database setup
        await pool.connect();
        const config = new SQLServerProviderConfigData(pool, '__mj', 5000);
        const sqlServerDataProvider = await setupSQLServerClient(config);

        // Load required modules
        LoadGeneratedEntities();
        LoadOpenAILLM();
        LoadMistralEmbedding();
        LoadPineconeVectorDB();

        // Create system user
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

        // Configure AI Engine
        await AIEngineBase.Instance.Config(false, systemUser);

        // Initialize autotagger
        const connectionString = 'BlobEndpoint=https://mstaautotagstorage.blob.core.windows.net/;QueueEndpoint=https://mstaautotagstorage.queue.core.windows.net/;FileEndpoint=https://mstaautotagstorage.file.core.windows.net/;TableEndpoint=https://mstaautotagstorage.table.core.windows.net/;SharedAccessSignature=sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2025-12-31T06:04:13Z&st=2025-09-12T20:49:13Z&spr=https&sig=gwS%2Bjr0i%2FBt0KlTN%2BU1GQAOnEKBLixwatfbtmD6bges%3D';
        const containerName = 'autotag-test';
        const autotagger = new AutotagAzureBlob(connectionString, containerName);

        // Cast to any to bypass TypeScript checking temporarily
        const autotaggerAny = autotagger as any;

        // Get specific ContentItem to retag
        console.log('🔍 Finding ContentItem to retag...');
        const rv = new RunView();
        const results = await rv.RunView<ContentItemEntity>({
            EntityName: 'Content Items',
            ExtraFilter: `ID='286EEFB4-1AEE-48FF-978A-C5F1B9793FC0'`,
            ResultType: 'entity_object'
        }, systemUser);
        
        if (!results.Success) {
            throw new Error(`Failed to fetch ContentItem: ${results.ErrorMessage}`);
        }

        const contentItems = results.Results;
        console.log(`Found ${contentItems.length} ContentItems to retag`);

        if (contentItems.length === 0) {
            console.log('No items found matching the criteria.');
            return;
        }

        // Re-tag the items directly using the new method
        for (const contentItem of contentItems) {
            try {
                console.log(`🏷️ Re-tagging item: ${contentItem.ID} - ${contentItem.Name}`);
    
                await autotagger.TagSingleContentItem(contentItem, systemUser, ['DistrictName']);
                console.log(`✅ Successfully re-tagged: ${contentItem.Name}`);
                
            } catch (error) {
                console.error(`❌ Error re-tagging ${contentItem.Name}:`, (error as Error).message);
            }
        }

        console.log('✅ Re-tagging completed successfully!');
        
    } catch (error) {
        console.error('❌ Re-tagging failed:', error);
        throw error;
    } finally {
        // Give a moment for any pending operations to complete, then exit
        setTimeout(() => {
            console.log('🔄 Shutting down...');
            process.exit(0);
        }, 2000);
    }
}

// Run the function
workingRetag().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});