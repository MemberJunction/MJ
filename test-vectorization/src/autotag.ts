import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AutotagAzureBlob, AutotagBaseEngine } from '@memberjunction/content-autotagging';
import { Metadata, UserInfo, RunView } from '@memberjunction/core';
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

async function main(): Promise<void> {
    try {
        console.log('🚀 Starting ContentAutotagging test...');
        
        // Database setup
        console.log('📊 Setting up database connection...');
        await pool.connect();
        const config = new SQLServerProviderConfigData(pool, '__mj', 5000);
        const sqlServerDataProvider = await setupSQLServerClient(config);

        // Load required modules
        console.log('🔧 Loading AI modules...');
        LoadGeneratedEntities();
        LoadOpenAILLM();
        LoadMistralEmbedding();
        LoadPineconeVectorDB();

        // Create system user
        console.log('👤 Setting up system user...');
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
        console.log('🤖 Configuring AI Engine...');
        await AIEngineBase.Instance.Config(false, systemUser);

        // Initialize autotagger
        console.log('🏷️ Initializing autotagger...');
        const connectionString = 'BlobEndpoint=https://mstaautotagstorage.blob.core.windows.net/;QueueEndpoint=https://mstaautotagstorage.queue.core.windows.net/;FileEndpoint=https://mstaautotagstorage.file.core.windows.net/;TableEndpoint=https://mstaautotagstorage.table.core.windows.net/;SharedAccessSignature=sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2025-12-31T06:04:13Z&st=2025-09-12T20:49:13Z&spr=https&sig=gwS%2Bjr0i%2FBt0KlTN%2BU1GQAOnEKBLixwatfbtmD6bges%3D';
        const containerName = 'small-autotag';
        const autotagger = new AutotagAzureBlob(connectionString, containerName);

        // Option 1: Full discovery and processing pipeline
        // await fullPipelineExample(autotagger, systemUser);
        
        // Option 2: Direct re-tagging of specific items
        const filter = `ID='363EA74E-234B-495F-9623-DB3DAEC282BE'`
        await retagItemsByFilter(autotagger, systemUser, filter, true);

        console.log('✅ All processing completed successfully!');
        
    } catch (error) {
        console.error('❌ Processing failed:', error);
        throw error;
    } finally {
        // Give a moment for any pending operations to complete, then exit
        setTimeout(() => {
            console.log('🔄 Shutting down...');
            process.exit(0);
        }, 2000);
    }
}

async function fullPipelineExample(autotagger: AutotagAzureBlob, systemUser: UserInfo): Promise<void> {
    console.log('\\n🔍 === FULL PIPELINE EXAMPLE ===');
    
    // Get content sources and discover items using the engine directly
    const engine = AutotagBaseEngine.Instance;
    const contentSourceTypeID = await engine.setSubclassContentSourceType('Azure Blob Storage', systemUser);
    const contentSources = await engine.getAllContentSources(systemUser, contentSourceTypeID);
    console.log(`Found ${contentSources.length} Azure Blob content sources`);

    if (contentSources.length === 0) {
        console.log('No content sources found. Skipping pipeline example.');
        return;
    }

    // Discover what needs processing
    const discoveredItems = await autotagger.DiscoverContentToProcess(contentSources, systemUser);
    console.log(`Discovered ${discoveredItems.length} items to process`);

    if (discoveredItems.length === 0) {
        console.log('No items discovered for processing.');
        return;
    }

    // Phase 2: Create/update ContentItems with parsed text
    console.log('\\n📝 Creating ContentItems with parsed text...');
    const contentItems: ContentItemEntity[] = [];

    for (const [index, discoveryResult] of discoveredItems.entries()) {
        try {
            console.log(`Processing item ${index + 1}/${discoveredItems.length}: ${discoveryResult.identifier}`);
            const contentItem = await autotagger.SetSingleContentItem(discoveryResult, systemUser);
            contentItems.push(contentItem);
        } catch (error) {
            console.error(`Error processing item ${discoveryResult.identifier}:`, (error as Error).message);
            // Continue with other items
        }
    }

    console.log(`Successfully processed ${contentItems.length} ContentItems`);

    // Phase 3: Apply LLM processing to extract tags
    console.log('\\n🤖 Applying LLM processing...');
    for (const contentItem of contentItems) {
        try {
            console.log(`Tagging item: ${contentItem.Name}`);
            await autotagger.TagSingleContentItem(contentItem, systemUser);
        } catch (error) {
            console.error(`Error tagging item ${contentItem.Name}:`, (error as Error).message);
        }
    }
}

async function retagSpecificItems(autotagger: AutotagAzureBlob, systemUser: UserInfo): Promise<void> {
    console.log('\\n🏷️ === RETAG SPECIFIC ITEMS EXAMPLE ===');
    
    // Get specific ContentItems you want to retag
    const rv = new RunView();
    const results = await rv.RunView<ContentItemEntity>({
        EntityName: 'Content Items',
        ExtraFilter: `ID='C077E761-FCB0-4E36-8657-8B8E9AA31870'`, // Specific item
        // ExtraFilter: `ContentSourceID='your-content-source-id'`, // All items from a source
        // ExtraFilter: `Description LIKE '%MSTA Salary%'`, // Items matching criteria
        ResultType: 'entity_object'
    }, systemUser);
    
    if (!results.Success) {
        console.error('Failed to fetch ContentItems:', results.ErrorMessage);
        return;
    }

    const contentItems = results.Results;
    console.log(`Found ${contentItems.length} ContentItems to retag`);

    if (contentItems.length === 0) {
        console.log('No items found matching the criteria.');
        return;
    }

    // Re-tag them directly (this will use improved prompts)
    for (const contentItem of contentItems) {
        try {
            console.log(`Re-tagging item: ${contentItem.ID} - ${contentItem.Name}`);
            await autotagger.TagSingleContentItem(contentItem, systemUser);
            console.log(`✅ Successfully re-tagged: ${contentItem.Name}`);
        } catch (error) {
            console.error(`❌ Error re-tagging ${contentItem.Name}:`, (error as Error).message);
        }
    }
}

// Utility function for bulk retagging with filters
async function retagItemsByFilter(
    autotagger: AutotagAzureBlob, 
    systemUser: UserInfo, 
    filter: string, 
    reparse: boolean = false
): Promise<void> {
    console.log(`\\n🔄 === BULK RETAG: ${filter} ===`);
    
    const rv = new RunView();
    const result = await rv.RunView<ContentItemEntity>({
        EntityName: 'Content Items',
        ExtraFilter: filter,
        ResultType: 'entity_object'
    }, systemUser);

    if (!result.Success) {
        console.error('Failed to fetch ContentItems:', result.ErrorMessage);
        return;
    }

    const contentItems = result.Results;
    console.log(`Found ${contentItems.length} ContentItems to ${reparse ? 'reprocess' : 'retag'}`);

    if (reparse) {
        // Full reprocessing (re-parse + re-tag)
        const discoveries = contentItems.map(item => ({
            identifier: item.URL,
            contentSourceId: item.ContentSourceID,
            lastModified: new Date(),
            action: 'update' as const,
            sourceType: 'AzureBlob',
            metadata: {
                existingContentItemId: item.ID,
                forceReprocess: true
            }
        }));

        for (const discovery of discoveries) {
            try {
                const contentItem = await autotagger.SetSingleContentItem(discovery, systemUser);
                await autotagger.TagSingleContentItem(contentItem, systemUser);
                console.log(`✅ Fully reprocessed: ${discovery.identifier}`);
            } catch (error) {
                console.error(`❌ Error reprocessing ${discovery.identifier}:`, (error as Error).message);
            }
        }
    } else {
        // Just re-tag (faster)
        for (const contentItem of contentItems) {
            try {
                await autotagger.TagSingleContentItem(contentItem, systemUser);
                console.log(`✅ Re-tagged: ${contentItem.Name}`);
            } catch (error) {
                console.error(`❌ Error re-tagging ${contentItem.Name}:`, (error as Error).message);
            }
        }
    }
}

// Run the main function
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});