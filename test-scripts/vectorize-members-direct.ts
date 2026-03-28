/**
 * Direct Vectorization Script (bypasses worker threads)
 *
 * Vectorizes Members records by:
 * 1. Loading records in batches
 * 2. Rendering templates via TemplateEngineServer
 * 3. Embedding via OpenAI (directly, no worker threads)
 * 4. Upserting to Pinecone
 * 5. Saving Entity Record Documents
 *
 * This avoids the worker_thread ClassFactory registration issue.
 */

import sql from 'mssql';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { Metadata, RunView, LogStatus, LogError } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';

import '@memberjunction/server-bootstrap/mj-class-registrations';
import '@memberjunction/core-entities-server';

import { EntityVectorSyncer } from '@memberjunction/ai-vector-sync';
import { AIEngine } from '@memberjunction/aiengine';
import { TemplateEngineServer } from '@memberjunction/templates';
import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai';
import { VectorDBBase } from '@memberjunction/ai-vectordb';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import type { MJEntityDocumentEntity, MJTemplateEntityExtended, MJTemplateContentEntity, MJVectorIndexEntity } from '@memberjunction/core-entities';

function log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] ${msg}`);
}

async function main(): Promise<void> {
    log('Direct Vectorization Script for Members');
    log('========================================');

    // Setup env vars
    if (!process.env.AI_VENDOR_API_KEY__OpenAIEmbedding) {
        process.env.AI_VENDOR_API_KEY__OpenAIEmbedding = process.env.AI_VENDOR_API_KEY__OpenAILLM || '';
    }
    if (!process.env.AI_VENDOR_API_KEY__PineconeDatabase) {
        process.env.AI_VENDOR_API_KEY__PineconeDatabase = process.env.PINECONE_API_KEY || '';
    }
    if (!process.env.PINECONE_DEFAULT_INDEX) {
        process.env.PINECONE_DEFAULT_INDEX = 'mj-dupe-detection';
    }

    // Connect to DB
    const poolConfig: sql.config = {
        server: process.env.DB_HOST || 'sql-claude',
        port: parseInt(process.env.DB_PORT || '1433'),
        database: process.env.DB_DATABASE || 'MJ_Workbench',
        user: process.env.DB_USERNAME || 'sa',
        password: process.env.DB_PASSWORD || 'Claude2Sql99',
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    };

    const pool = new sql.ConnectionPool(poolConfig);
    await pool.connect();
    log('Connected to SQL Server');

    const providerConfig = new SQLServerProviderConfigData(pool, '__mj');
    await setupSQLServerClient(providerConfig);
    const contextUser = UserCache.Instance.GetSystemUser();
    log(`Using user: ${contextUser.Name}`);

    await AIEngine.Instance.Config(false, contextUser);
    await TemplateEngineServer.Instance.Config(false, contextUser);

    // Get entity document for Members
    const syncer = new EntityVectorSyncer();
    syncer.CurrentUser = contextUser;
    await syncer.Config(true, contextUser);

    const activeDocuments = await syncer.GetActiveEntityDocuments(['Members']);
    if (activeDocuments.length === 0) throw new Error('No entity document for Members');
    const entityDoc = activeDocuments[0];
    log(`Entity Document: ${entityDoc.Name}`);

    // Get AI model and vector DB info
    const aiModel = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, entityDoc.AIModelID));
    if (!aiModel) throw new Error('AI Model not found');

    const vectorDB = AIEngine.Instance.VectorDatabases.find(vd => UUIDsEqual(vd.ID, entityDoc.VectorDatabaseID));
    if (!vectorDB) throw new Error('Vector DB not found');

    // Get driver classes from model vendors
    const embeddingVendor = aiModel.ModelVendors.find(mv => mv.DriverClass);
    if (!embeddingVendor) throw new Error('No vendor with DriverClass found for embedding model');

    const embeddingDriverClass = embeddingVendor.DriverClass;
    const embeddingAPIKey = GetAIAPIKey(embeddingDriverClass);
    const vectorDBAPIKey = GetAIAPIKey(vectorDB.ClassKey);

    log(`Embedding: ${embeddingDriverClass}, VectorDB: ${vectorDB.ClassKey}`);

    // Create instances directly
    const embedding = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
        BaseEmbeddings, embeddingDriverClass, embeddingAPIKey
    );
    const vectorDBInstance = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
        VectorDBBase, vectorDB.ClassKey, vectorDBAPIKey
    );

    if (!embedding) throw new Error('Failed to create embedding instance');
    if (!vectorDBInstance) throw new Error('Failed to create vector DB instance');

    // Get or create vector index
    const rv = new RunView();
    const md = new Metadata();

    const viResult = await rv.RunView<MJVectorIndexEntity>({
        EntityName: 'MJ: Vector Indexes',
        ExtraFilter: `VectorDatabaseID = '${entityDoc.VectorDatabaseID}' AND EmbeddingModelID = '${entityDoc.AIModelID}'`,
        ResultType: 'entity_object',
    }, contextUser);

    let vectorIndex: MJVectorIndexEntity;
    if (viResult.Success && viResult.Results.length > 0) {
        vectorIndex = viResult.Results[0];
        log(`Using existing Vector Index: ${vectorIndex.ID}`);
    } else {
        throw new Error('No Vector Index found - run the full vectorization first to create one');
    }

    // Get template
    const template = TemplateEngineServer.Instance.Templates.find(
        (t: MJTemplateEntityExtended) => UUIDsEqual(t.ID, entityDoc.TemplateID)
    ) as MJTemplateEntityExtended;

    if (!template) throw new Error('Template not found');
    if (template.Content.length === 0) throw new Error('Template has no content');

    const templateContent = template.Content[0] as MJTemplateContentEntity;
    log(`Template: ${template.Name}, Content: "${templateContent.TemplateText.substring(0, 80)}..."`);

    // Load ALL member records in batches
    const BATCH_SIZE = 50;
    const EMBED_BATCH_SIZE = 50;
    let offset = 0;
    let totalProcessed = 0;
    let totalVectorized = 0;
    const memberEntity = md.EntityByName('Members');
    if (!memberEntity) throw new Error('Members entity not found');

    TemplateEngineServer.Instance.SetupNunjucks();

    while (true) {
        const batchResult = await rv.RunView({
            EntityName: 'Members',
            ExtraFilter: '',
            MaxRows: BATCH_SIZE,
            StartRow: offset,
            ResultType: 'simple',
        }, contextUser);

        if (!batchResult.Success || batchResult.Results.length === 0) break;

        const records = batchResult.Results;
        log(`Processing batch at offset ${offset}: ${records.length} records`);

        // Render templates
        const templateTexts: string[] = [];
        const recordIDs: string[] = [];
        const compositeKeys: string[] = [];

        for (const record of records) {
            const data: Record<string, unknown> = { Entity: record };
            const result = await TemplateEngineServer.Instance.RenderTemplate(
                template, templateContent, data, true
            );
            if (result.Success) {
                templateTexts.push(result.Output);
                recordIDs.push(String(record['ID']));
                compositeKeys.push(`ID|${record['ID']}`);
            } else {
                log(`  WARNING: Template render failed for record ${record['ID']}: ${result.Message}`);
            }
        }

        if (templateTexts.length === 0) {
            log(`  No templates rendered for this batch, skipping`);
            offset += BATCH_SIZE;
            continue;
        }

        // Embed in sub-batches
        for (let i = 0; i < templateTexts.length; i += EMBED_BATCH_SIZE) {
            const textBatch = templateTexts.slice(i, i + EMBED_BATCH_SIZE);
            const idBatch = recordIDs.slice(i, i + EMBED_BATCH_SIZE);
            const keyBatch = compositeKeys.slice(i, i + EMBED_BATCH_SIZE);

            const embedResult = await embedding.EmbedTexts({ texts: textBatch, model: null });

            if (!embedResult.vectors || embedResult.vectors.length === 0) {
                log(`  WARNING: Embedding returned no vectors`);
                continue;
            }

            // Upsert to Pinecone
            const vectorRecords = embedResult.vectors.map((vector: number[], idx: number) => ({
                id: keyBatch[idx],
                values: vector,
                metadata: {
                    RecordID: keyBatch[idx],
                    Entity: 'Members',
                    TemplateID: entityDoc.TemplateID,
                },
            }));

            const upsertResult = await vectorDBInstance.createRecords(vectorRecords);
            if (upsertResult.success) {
                totalVectorized += vectorRecords.length;
            } else {
                log(`  WARNING: Pinecone upsert failed: ${upsertResult.message}`);
            }

            // Save Entity Record Documents
            for (let j = 0; j < idBatch.length; j++) {
                const erdResult = await rv.RunView({
                    EntityName: 'MJ: Entity Record Documents',
                    ExtraFilter: `EntityID = '${memberEntity.ID}' AND EntityDocumentID = '${entityDoc.ID}' AND RecordID = '${idBatch[j]}'`,
                    ResultType: 'entity_object',
                    MaxRows: 1,
                }, contextUser);

                let erd;
                if (erdResult.Success && erdResult.Results.length > 0) {
                    erd = erdResult.Results[0];
                } else {
                    erd = await md.GetEntityObject('MJ: Entity Record Documents', contextUser);
                    erd.NewRecord();
                }

                erd.Set('EntityID', memberEntity.ID);
                erd.Set('RecordID', idBatch[j]);
                erd.Set('DocumentText', textBatch[j]);
                erd.Set('VectorID', keyBatch[j]);
                erd.Set('VectorJSON', JSON.stringify(embedResult.vectors[j].slice(0, 10))); // Just first 10 values
                erd.Set('VectorIndexID', vectorIndex.ID);
                erd.Set('EntityDocumentID', entityDoc.ID);
                erd.Set('EntityRecordUpdatedAt', new Date());
                erd.ContextCurrentUser = contextUser;

                const saved = await erd.Save();
                if (!saved) {
                    log(`  WARNING: Failed to save ERD for ${idBatch[j]}`);
                }
            }
        }

        totalProcessed += records.length;
        log(`  Batch complete: ${totalProcessed} total processed, ${totalVectorized} vectorized`);

        if (records.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
    }

    log(`\n========================================`);
    log(`Vectorization complete!`);
    log(`Total records processed: ${totalProcessed}`);
    log(`Total records vectorized: ${totalVectorized}`);

    await pool.close();
    log('Done!');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
