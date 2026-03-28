/**
 * E2E Integration Test: Vector Duplicate Detection Pipeline
 *
 * Tests the full pipeline:
 * 1. MJ Metadata initialization
 * 2. Entity Document configuration validation
 * 3. Vectorization via EntityVectorSyncer (with real OpenAI embeddings + Pinecone)
 * 4. Duplicate detection via DuplicateRecordDetector.GetDuplicateRecords
 * 5. Single record duplicate check via CheckSingleRecord
 * 6. Progress callback verification
 * 7. Error handling for bad configurations
 *
 * Requires:
 *   - SQL Server with MJ_Workbench database on sql-claude:1433
 *   - AI_VENDOR_API_KEY__OpenAIEmbedding env var
 *   - AI_VENDOR_API_KEY__PineconeDatabase env var
 *   - PINECONE_DEFAULT_INDEX=mj-dupe-detection env var
 */

import sql from 'mssql';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import {
    Metadata,
    RunView,
    CompositeKey,
    LogStatus,
    LogError,
    PotentialDuplicateRequest,
} from '@memberjunction/core';
import type { UserInfo, DuplicateDetectionProgress } from '@memberjunction/core';

// Import server bootstrap class registrations to populate ClassFactory
import '@memberjunction/server-bootstrap/mj-class-registrations';

// Import the packages we're testing
import { EntityVectorSyncer, EntityDocumentTemplateParser } from '@memberjunction/ai-vector-sync';
import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';
import { AIEngine } from '@memberjunction/aiengine';
import { TemplateEngineServer } from '@memberjunction/templates';
import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai';
import { VectorDBBase } from '@memberjunction/ai-vectordb';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';

// Import server-side entity registrations (includes MJDuplicateRunEntityServer)
import '@memberjunction/core-entities-server';

/**
 * Subclass of DuplicateRecordDetector that skips the VectorizeSourceRecords step.
 * This is needed because EntityVectorSyncer.VectorizeEntity uses worker threads
 * that cannot access the ClassFactory registrations in their isolated V8 contexts.
 * Records have been pre-vectorized via the direct vectorization script.
 */
class TestDuplicateRecordDetector extends DuplicateRecordDetector {
    protected override async VectorizeSourceRecords(): Promise<void> {
        log('  [TestDetector] Skipping VectorizeSourceRecords (records already vectorized)');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Infrastructure
// ─────────────────────────────────────────────────────────────────────────────

interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
    details?: string;
}

const results: TestResult[] = [];
let pool: sql.ConnectionPool;
let contextUser: UserInfo;

function log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] ${msg}`);
}

async function runTest(name: string, fn: () => Promise<string | void>): Promise<void> {
    log(`\n${'='.repeat(60)}`);
    log(`TEST: ${name}`);
    log('='.repeat(60));
    const start = Date.now();
    try {
        const details = await fn();
        const duration = Date.now() - start;
        results.push({ name, passed: true, duration, details: details || undefined });
        log(`✅ PASSED (${duration}ms)${details ? ' — ' + details : ''}`);
    } catch (err: unknown) {
        const duration = Date.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : '';
        results.push({ name, passed: false, duration, error: errorMsg });
        log(`❌ FAILED (${duration}ms): ${errorMsg}`);
        if (stack) log(`   Stack: ${stack.split('\n').slice(1, 4).join('\n   ')}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

async function setup(): Promise<void> {
    log('Setting up database connection and metadata provider...');

    // Ensure env vars are set for the AI providers
    if (!process.env.AI_VENDOR_API_KEY__OpenAIEmbedding) {
        process.env.AI_VENDOR_API_KEY__OpenAIEmbedding = process.env.AI_VENDOR_API_KEY__OpenAILLM || '';
    }
    if (!process.env.AI_VENDOR_API_KEY__PineconeDatabase) {
        process.env.AI_VENDOR_API_KEY__PineconeDatabase = process.env.PINECONE_API_KEY || '';
    }
    if (!process.env.PINECONE_DEFAULT_INDEX) {
        process.env.PINECONE_DEFAULT_INDEX = 'mj-dupe-detection';
    }

    const poolConfig: sql.config = {
        server: process.env.DB_HOST || 'sql-claude',
        port: parseInt(process.env.DB_PORT || '1433'),
        database: process.env.DB_DATABASE || 'MJ_Workbench',
        user: process.env.DB_USERNAME || 'sa',
        password: process.env.DB_PASSWORD || 'Claude2Sql99',
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
        },
    };

    pool = new sql.ConnectionPool(poolConfig);
    await pool.connect();
    log('Connected to SQL Server');

    const providerConfig = new SQLServerProviderConfigData(pool, '__mj');
    await setupSQLServerClient(providerConfig);
    log('MJ Metadata provider initialized');

    contextUser = UserCache.Instance.GetSystemUser();
    if (!contextUser) {
        const users = UserCache.Instance.Users;
        contextUser = users.find((u: UserInfo) => u.IsActive) as UserInfo;
    }
    log(`Using context user: ${contextUser?.Name || 'UNKNOWN'} (${contextUser?.ID || 'no ID'})`);

    // Initialize AIEngine and TemplateEngine
    await AIEngine.Instance.Config(false, contextUser);
    log(`AIEngine loaded: ${AIEngine.Instance.Models.length} models, ${AIEngine.Instance.VectorDatabases.length} vector DBs`);

    await TemplateEngineServer.Instance.Config(false, contextUser);
    log(`TemplateEngine loaded: ${TemplateEngineServer.Instance.Templates.length} templates`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Validate Entity Document Configuration
// ─────────────────────────────────────────────────────────────────────────────

async function testEntityDocumentConfiguration(): Promise<string> {
    const syncer = new EntityVectorSyncer();
    syncer.CurrentUser = contextUser;
    await syncer.Config(true, contextUser);

    const activeDocuments = await syncer.GetActiveEntityDocuments();
    log(`Found ${activeDocuments.length} active entity documents`);

    if (activeDocuments.length === 0) {
        throw new Error('No active entity documents found');
    }

    for (const doc of activeDocuments) {
        log(`  - ${doc.Name} (Entity: ${doc.Entity}, Status: ${doc.Status})`);
        log(`    VectorDB ID: ${doc.VectorDatabaseID}, AI Model ID: ${doc.AIModelID}`);
        log(`    Template ID: ${doc.TemplateID}`);
        log(`    Potential Match Threshold: ${doc.PotentialMatchThreshold}`);
        log(`    Absolute Match Threshold: ${doc.AbsoluteMatchThreshold}`);
    }

    return `${activeDocuments.length} entity documents configured`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Validate AIEngine Models and Vector DBs
// ─────────────────────────────────────────────────────────────────────────────

async function testAIEngineConfiguration(): Promise<string> {
    const models = AIEngine.Instance.Models;
    const embeddingModels = models.filter(m => m.AIModelType === 'Embeddings');
    const vectorDBs = AIEngine.Instance.VectorDatabases;

    log(`Total AI Models: ${models.length}`);
    log(`Embedding Models: ${embeddingModels.length}`);
    for (const m of embeddingModels) {
        log(`  - ${m.Name} (ID: ${m.ID})`);
        if (m.ModelVendors?.length > 0) {
            for (const mv of m.ModelVendors) {
                log(`    Vendor: DriverClass=${mv.DriverClass}, Status=${mv.Status}`);
            }
        }
    }

    log(`Vector Databases: ${vectorDBs.length}`);
    for (const vdb of vectorDBs) {
        log(`  - ${vdb.Name} (ClassKey: ${vdb.ClassKey})`);
    }

    if (embeddingModels.length === 0) throw new Error('No embedding models found');
    if (vectorDBs.length === 0) throw new Error('No vector databases found');

    return `${embeddingModels.length} embedding models, ${vectorDBs.length} vector DBs`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Template Parsing
// ─────────────────────────────────────────────────────────────────────────────

async function testTemplateParsing(): Promise<string> {
    const syncer = new EntityVectorSyncer();
    syncer.CurrentUser = contextUser;

    const activeDocuments = await syncer.GetActiveEntityDocuments(['Members']);
    if (activeDocuments.length === 0) throw new Error('No entity document for Members');

    const entityDoc = activeDocuments[0];
    log(`Using entity document: ${entityDoc.Name}`);

    // Load a sample record
    const rv = new RunView();
    const recordResult = await rv.RunView({
        EntityName: 'Members',
        ExtraFilter: '',
        MaxRows: 1,
        ResultType: 'entity_object',
    }, contextUser);

    if (!recordResult.Success || recordResult.Results.length === 0) {
        throw new Error('Failed to load sample member record');
    }

    const sampleRecord = recordResult.Results[0];
    log(`Sample record: ${sampleRecord.Get('FirstName')} ${sampleRecord.Get('LastName')} (${sampleRecord.Get('Email')})`);

    // Parse the template
    const parser = EntityDocumentTemplateParser.CreateInstance();
    const templateText = await parser.Parse(
        entityDoc.TemplateID,
        entityDoc.EntityID,
        sampleRecord,
        contextUser
    );

    log(`Template output (${templateText.length} chars): ${templateText.substring(0, 200)}...`);

    if (!templateText || templateText.trim().length === 0) {
        throw new Error('Template parsing returned empty string');
    }

    return `Template parsed successfully (${templateText.length} chars)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Vectorize a Small Subset of Members
// ─────────────────────────────────────────────────────────────────────────────

async function testVectorization(): Promise<string> {
    const syncer = new EntityVectorSyncer();
    syncer.CurrentUser = contextUser;
    await syncer.Config(true, contextUser);

    const activeDocuments = await syncer.GetActiveEntityDocuments(['Members']);
    if (activeDocuments.length === 0) throw new Error('No entity document for Members');
    const entityDoc = activeDocuments[0];

    log(`Checking vectorization for Members entity document: ${entityDoc.Name}`);
    log(`Entity ID: ${entityDoc.EntityID}, Doc ID: ${entityDoc.ID}`);

    // Verify Entity Record Documents exist (from prior direct vectorization)
    const rv = new RunView();
    const erdResult = await rv.RunView({
        EntityName: 'MJ: Entity Record Documents',
        ExtraFilter: `EntityDocumentID = '${entityDoc.ID}'`,
        Fields: ['ID', 'RecordID', 'VectorIndexID'],
        ResultType: 'simple',
        MaxRows: 100,
    }, contextUser);

    const erdCount = erdResult.Success ? erdResult.Results.length : 0;
    log(`Entity Record Documents found: ${erdCount}`);

    if (erdCount === 0) {
        throw new Error('No Entity Record Documents found — run vectorize-members-direct.ts first');
    }

    // Test direct embedding (this is what DuplicateRecordDetector uses)
    const aiModel = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, entityDoc.AIModelID));
    const vectorDB = AIEngine.Instance.VectorDatabases.find(vd => UUIDsEqual(vd.ID, entityDoc.VectorDatabaseID));
    if (!aiModel || !vectorDB) throw new Error('Model or VectorDB not found');

    const embeddingVendor = aiModel.ModelVendors.find(mv => mv.DriverClass);
    if (!embeddingVendor) throw new Error('No vendor with DriverClass');

    const embeddingAPIKey = GetAIAPIKey(embeddingVendor.DriverClass);
    const vectorDBAPIKey = GetAIAPIKey(vectorDB.ClassKey);

    const embedding = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
        BaseEmbeddings, embeddingVendor.DriverClass, embeddingAPIKey
    );
    const vectorDBInstance = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
        VectorDBBase, vectorDB.ClassKey, vectorDBAPIKey
    );

    if (!embedding) throw new Error('Failed to create embedding instance');
    if (!vectorDBInstance) throw new Error('Failed to create vector DB instance');

    // Test embedding a single text
    const testText = 'John Smith john.smith@test.com Engineer Technology';
    const embedResult = await embedding.EmbedTexts({ texts: [testText], model: null });
    log(`Test embedding: ${embedResult.vectors.length} vectors, dim=${embedResult.vectors[0]?.length}`);

    // Test querying Pinecone
    const queryResult = await vectorDBInstance.queryIndex({
        vector: embedResult.vectors[0],
        topK: 3,
        includeMetadata: true,
        includeValues: false,
    });

    log(`Pinecone query result: success=${queryResult.success}`);
    if (queryResult.data?.matches) {
        log(`  Matches: ${queryResult.data.matches.length}`);
        for (const match of queryResult.data.matches.slice(0, 3)) {
            log(`    - ID: ${match.id}, Score: ${match.score?.toFixed(4)}, RecordID: ${match.metadata?.RecordID}`);
        }
    }

    return `${erdCount} ERDs in DB, embedding works (dim=${embedResult.vectors[0]?.length}), Pinecone query returned ${queryResult.data?.matches?.length || 0} matches`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Full Duplicate Detection Pipeline (GetDuplicateRecords)
// ─────────────────────────────────────────────────────────────────────────────

async function testDuplicateDetection(): Promise<string> {
    const md = new Metadata();
    const rv = new RunView();

    // Get the entity document for Members
    const syncer = new EntityVectorSyncer();
    syncer.CurrentUser = contextUser;
    const activeDocuments = await syncer.GetActiveEntityDocuments(['Members']);
    if (activeDocuments.length === 0) throw new Error('No entity document for Members');
    const entityDoc = activeDocuments[0];
    log(`Entity Document: ${entityDoc.Name} (ID: ${entityDoc.ID})`);

    // Step 1: Create a List with some member records to check for duplicates
    log('Creating test list with 10 member records...');

    // Get the entity info for Members
    const memberEntityInfo = md.EntityByName('Members');
    if (!memberEntityInfo) throw new Error('Members entity not found in metadata');

    // Create a new list
    const listEntity = await md.GetEntityObject('MJ: Lists', contextUser) as { [key: string]: unknown } & { NewRecord: () => void; Save: () => Promise<boolean>; ID: string; LatestResult: { Message: string } };
    listEntity.NewRecord();
    listEntity.Set('Name', `E2E Dupe Test List ${Date.now()}`);
    listEntity.Set('Description', 'Temporary list for E2E duplicate detection testing');
    listEntity.Set('EntityID', memberEntityInfo.ID);
    listEntity.Set('UserID', contextUser.ID);
    const listSaved = await listEntity.Save();
    if (!listSaved) throw new Error(`Failed to save list: ${listEntity.LatestResult?.Message}`);
    log(`Created list: ${listEntity.Get('Name')} (ID: ${listEntity.ID})`);

    // Load some member records to add to the list
    const membersResult = await rv.RunView({
        EntityName: 'Members',
        ExtraFilter: '',
        MaxRows: 10,
        ResultType: 'entity_object',
        OrderBy: 'FirstName',
    }, contextUser);

    if (!membersResult.Success || membersResult.Results.length === 0) {
        throw new Error('Failed to load member records');
    }

    log(`Loaded ${membersResult.Results.length} member records to add to list`);

    // Add members to the list as list details
    for (const member of membersResult.Results) {
        const listDetail = await md.GetEntityObject('MJ: List Details', contextUser) as { [key: string]: unknown } & { NewRecord: () => void; Save: () => Promise<boolean>; ID: string };
        listDetail.NewRecord();
        listDetail.Set('ListID', listEntity.ID);
        listDetail.Set('RecordID', member.PrimaryKey.Values());
        listDetail.Set('Sequence', 0);
        const detailSaved = await listDetail.Save();
        if (!detailSaved) {
            log(`  WARNING: Failed to save list detail for member ${member.Get('FirstName')} ${member.Get('LastName')}`);
        }
    }
    log(`Added ${membersResult.Results.length} members to list`);

    // Step 2: Create a Duplicate Run
    log('Creating Duplicate Run...');
    const dupeRun = await md.GetEntityObject('MJ: Duplicate Runs', contextUser) as { [key: string]: unknown } & { NewRecord: () => void; Save: () => Promise<boolean>; ID: string; LatestResult: { Message: string; CompleteMessage: string } };
    dupeRun.NewRecord();
    dupeRun.Set('EntityID', memberEntityInfo.ID);
    dupeRun.Set('SourceListID', listEntity.ID);
    dupeRun.Set('StartedAt', new Date());
    dupeRun.Set('StartedByUserID', contextUser.ID);
    dupeRun.Set('ProcessingStatus', 'In Progress');
    dupeRun.Set('ApprovalStatus', 'Pending');
    // Set EndedAt to a value to prevent MJDuplicateRunEntityServer from auto-triggering detection
    // (It only triggers if EndedAt is null on save)
    dupeRun.Set('EndedAt', new Date());

    const runSaved = await dupeRun.Save();
    if (!runSaved) throw new Error(`Failed to save duplicate run: ${dupeRun.LatestResult?.Message || dupeRun.LatestResult?.CompleteMessage}`);
    log(`Created Duplicate Run: ${dupeRun.ID}`);

    // Step 3: Run duplicate detection directly (using TestDetector that skips vectorization)
    log('Running TestDuplicateRecordDetector.GetDuplicateRecords...');
    const detector = new TestDuplicateRecordDetector();
    const request = new PotentialDuplicateRequest();
    request.EntityID = memberEntityInfo.ID;
    request.EntityDocumentID = entityDoc.ID;
    request.ListID = listEntity.ID;

    const progressEvents: DuplicateDetectionProgress[] = [];
    request.Options = {
        DuplicateRunID: dupeRun.ID,
        TopK: 5,
        OnProgress: (progress: DuplicateDetectionProgress) => {
            progressEvents.push({ ...progress });
            log(`  Progress: Phase=${progress.Phase}, Processed=${progress.ProcessedRecords}/${progress.TotalRecords}, Matches=${progress.MatchesFound}, Elapsed=${progress.ElapsedMs}ms`);
        },
    };

    const startTime = Date.now();
    const response = await detector.GetDuplicateRecords(request, contextUser);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    log(`Detection completed in ${elapsed}s`);
    log(`Status: ${response.Status}`);
    log(`Error: ${response.ErrorMessage || 'none'}`);
    log(`Results: ${response.PotentialDuplicateResult.length} records checked`);

    let totalMatches = 0;
    for (const result of response.PotentialDuplicateResult) {
        const matchCount = result.Duplicates.length;
        totalMatches += matchCount;
        if (matchCount > 0) {
            log(`  Record ${result.RecordCompositeKey.ToString()}: ${matchCount} potential duplicates`);
            for (const dupe of result.Duplicates) {
                log(`    - ${dupe.ToString()} (score: ${dupe.ProbabilityScore.toFixed(4)})`);
            }
        }
    }

    log(`Total potential duplicate matches: ${totalMatches}`);
    log(`Progress events captured: ${progressEvents.length}`);

    // Verify DB records
    const runDetailsResult = await rv.RunView({
        EntityName: 'MJ: Duplicate Run Details',
        ExtraFilter: `DuplicateRunID = '${dupeRun.ID}'`,
        Fields: ['ID', 'RecordID', 'MatchStatus'],
        ResultType: 'simple',
    }, contextUser);

    const detailCount = runDetailsResult.Success ? runDetailsResult.Results.length : 0;
    log(`Duplicate Run Details in DB: ${detailCount}`);

    const matchesResult = await rv.RunView({
        EntityName: 'MJ: Duplicate Run Detail Matches',
        ExtraFilter: `DuplicateRunDetailID IN (SELECT ID FROM __mj.vwDuplicateRunDetails WHERE DuplicateRunID = '${dupeRun.ID}')`,
        Fields: ['ID', 'MatchRecordID', 'MatchProbability', 'ApprovalStatus'],
        ResultType: 'simple',
    }, contextUser);

    const matchCount = matchesResult.Success ? matchesResult.Results.length : 0;
    log(`Duplicate Run Detail Matches in DB: ${matchCount}`);

    if (response.Status !== 'Success') {
        throw new Error(`Detection failed: ${response.ErrorMessage}`);
    }

    return `${elapsed}s, ${response.PotentialDuplicateResult.length} records checked, ${totalMatches} matches found, ${progressEvents.length} progress events, ${detailCount} run details, ${matchCount} match records in DB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: CheckSingleRecord
// ─────────────────────────────────────────────────────────────────────────────

async function testCheckSingleRecord(): Promise<string> {
    const md = new Metadata();
    const rv = new RunView();

    const syncer = new EntityVectorSyncer();
    syncer.CurrentUser = contextUser;
    const activeDocuments = await syncer.GetActiveEntityDocuments(['Members']);
    if (activeDocuments.length === 0) throw new Error('No entity document for Members');
    const entityDoc = activeDocuments[0];

    // Load a single member
    const membersResult = await rv.RunView({
        EntityName: 'Members',
        ExtraFilter: '',
        MaxRows: 1,
        ResultType: 'entity_object',
    }, contextUser);

    if (!membersResult.Success || membersResult.Results.length === 0) {
        throw new Error('Failed to load a member record');
    }

    const member = membersResult.Results[0];
    log(`Checking single record: ${member.Get('FirstName')} ${member.Get('LastName')} (${member.Get('Email')})`);

    const detector = new DuplicateRecordDetector();
    const startTime = Date.now();

    const result = await detector.CheckSingleRecord(
        entityDoc.ID,
        member.PrimaryKey,
        { TopK: 5 },
        contextUser
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Single record check completed in ${elapsed}s`);
    log(`Duplicates found: ${result.Duplicates.length}`);

    for (const dupe of result.Duplicates) {
        log(`  - ${dupe.ToString()} (score: ${dupe.ProbabilityScore.toFixed(4)})`);
    }

    return `${elapsed}s, ${result.Duplicates.length} duplicates found for ${member.Get('FirstName')} ${member.Get('LastName')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Different TopK Values
// ─────────────────────────────────────────────────────────────────────────────

async function testDifferentTopKValues(): Promise<string> {
    const rv = new RunView();
    const syncer = new EntityVectorSyncer();
    syncer.CurrentUser = contextUser;
    const activeDocuments = await syncer.GetActiveEntityDocuments(['Members']);
    if (activeDocuments.length === 0) throw new Error('No entity document for Members');
    const entityDoc = activeDocuments[0];

    const membersResult = await rv.RunView({
        EntityName: 'Members',
        ExtraFilter: '',
        MaxRows: 1,
        ResultType: 'entity_object',
    }, contextUser);

    if (!membersResult.Success || membersResult.Results.length === 0) {
        throw new Error('Failed to load a member record');
    }

    const member = membersResult.Results[0];
    const detector = new DuplicateRecordDetector();
    const topKValues = [3, 5, 10];
    const resultCounts: string[] = [];

    for (const topK of topKValues) {
        const result = await detector.CheckSingleRecord(
            entityDoc.ID,
            member.PrimaryKey,
            { TopK: topK },
            contextUser
        );
        const matchCount = result.Duplicates.length;
        resultCounts.push(`TopK=${topK}: ${matchCount} matches`);
        log(`  TopK=${topK}: ${matchCount} matches`);
    }

    return resultCounts.join(', ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Error Handling - Bad Entity Document ID
// ─────────────────────────────────────────────────────────────────────────────

async function testErrorHandlingBadEntityDoc(): Promise<string> {
    const detector = new DuplicateRecordDetector();
    const request = new PotentialDuplicateRequest();
    request.EntityDocumentID = '00000000-0000-0000-0000-000000000000';
    request.ListID = '00000000-0000-0000-0000-000000000000';
    request.EntityID = '00000000-0000-0000-0000-000000000000';

    const response = await detector.GetDuplicateRecords(request, contextUser);

    if (response.Status === 'Error') {
        log(`Expected error received: ${response.ErrorMessage}`);
        return `Error correctly returned: ${response.ErrorMessage}`;
    }

    throw new Error('Expected an error response but got success');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Error Handling - Bad Record ID in CheckSingleRecord
// ─────────────────────────────────────────────────────────────────────────────

async function testErrorHandlingBadRecordID(): Promise<string> {
    const syncer = new EntityVectorSyncer();
    syncer.CurrentUser = contextUser;
    const activeDocuments = await syncer.GetActiveEntityDocuments(['Members']);
    if (activeDocuments.length === 0) throw new Error('No entity document for Members');
    const entityDoc = activeDocuments[0];

    const detector = new DuplicateRecordDetector();
    const fakeKey = new CompositeKey([{ FieldName: 'ID', Value: '00000000-0000-0000-0000-000000000000' }]);

    try {
        await detector.CheckSingleRecord(entityDoc.ID, fakeKey, {}, contextUser);
        throw new Error('Expected an error but CheckSingleRecord succeeded');
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found') || msg.includes('Record') || msg.includes('No records')) {
            log(`Expected error received: ${msg}`);
            return `Error correctly thrown: ${msg}`;
        }
        // Re-throw if it's not the expected error
        throw err;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: ParseVectorMatches Unit-Level Validation
// ─────────────────────────────────────────────────────────────────────────────

async function testParseVectorMatches(): Promise<string> {
    const detector = new DuplicateRecordDetector();

    // Test with valid match data
    const mockResponse = {
        success: true,
        message: 'ok',
        data: {
            matches: [
                { id: 'vec1', score: 0.95, metadata: { RecordID: 'ID|abc-123', Entity: 'Members', TemplateID: 'tmpl-1' } },
                { id: 'vec2', score: 0.82, metadata: { RecordID: 'ID|def-456', Entity: 'Members', TemplateID: 'tmpl-1' } },
                { id: 'vec3', score: 0.71, metadata: { RecordID: 'ID|ghi-789', Entity: 'Members', TemplateID: 'tmpl-1' } },
                { id: 'vec4', score: 0.60, metadata: null }, // Should be skipped
                { id: '', score: 0.50, metadata: { RecordID: 'ID|jkl-012', Entity: 'Members', TemplateID: 'tmpl-1' } }, // Empty ID - skipped
            ],
        },
    };

    const result = detector.ParseVectorMatches(mockResponse);
    log(`Parsed ${result.Duplicates.length} matches from 5 raw entries (2 invalid)`);

    if (result.Duplicates.length !== 3) {
        throw new Error(`Expected 3 matches but got ${result.Duplicates.length}`);
    }

    // Verify scores
    if (result.Duplicates[0].ProbabilityScore !== 0.95) {
        throw new Error(`Expected first match score 0.95, got ${result.Duplicates[0].ProbabilityScore}`);
    }

    // Test with empty response
    const emptyResult = detector.ParseVectorMatches({ success: true, message: 'ok', data: null });
    if (emptyResult.Duplicates.length !== 0) {
        throw new Error(`Expected 0 matches for empty response, got ${emptyResult.Duplicates.length}`);
    }

    return `Correctly parsed 3/5 matches, handled empty response`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    log('╔══════════════════════════════════════════════════════════════╗');
    log('║  E2E Vector Duplicate Detection Pipeline Test Suite         ║');
    log('╚══════════════════════════════════════════════════════════════╝');
    log('');

    try {
        await setup();
        log('\nSetup complete. Running tests...\n');

        // Run tests in order (some depend on prior tests)
        await runTest('1. Entity Document Configuration', testEntityDocumentConfiguration);
        await runTest('2. AIEngine Configuration', testAIEngineConfiguration);
        await runTest('3. Template Parsing', testTemplateParsing);
        await runTest('4. Vectorization Pipeline (OpenAI + Pinecone)', testVectorization);
        await runTest('5. Duplicate Detection (GetDuplicateRecords)', testDuplicateDetection);
        await runTest('6. CheckSingleRecord', testCheckSingleRecord);
        await runTest('7. Different TopK Values', testDifferentTopKValues);
        await runTest('8. Error Handling - Bad Entity Document', testErrorHandlingBadEntityDoc);
        await runTest('9. Error Handling - Bad Record ID', testErrorHandlingBadRecordID);
        await runTest('10. ParseVectorMatches Validation', testParseVectorMatches);

    } catch (err) {
        log(`\nFATAL ERROR during setup: ${err instanceof Error ? err.message : String(err)}`);
        if (err instanceof Error) log(err.stack || '');
    }

    // Print summary
    log('\n');
    log('╔══════════════════════════════════════════════════════════════╗');
    log('║  TEST RESULTS SUMMARY                                      ║');
    log('╚══════════════════════════════════════════════════════════════╝');

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    for (const r of results) {
        const icon = r.passed ? '✅' : '❌';
        const durationStr = `${(r.duration / 1000).toFixed(1)}s`;
        log(`${icon} ${r.name} (${durationStr})${r.details ? ' — ' + r.details : ''}${r.error ? ' — ERROR: ' + r.error : ''}`);
    }

    log('');
    log(`Total: ${passed} passed, ${failed} failed out of ${results.length} tests`);
    log(`Total duration: ${(totalDuration / 1000).toFixed(1)}s`);

    // Cleanup
    if (pool?.connected) {
        await pool.close();
        log('Database connection closed');
    }

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
