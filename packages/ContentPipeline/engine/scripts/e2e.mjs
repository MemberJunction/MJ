/**
 * Full end-to-end run: Discover → Extract → Tag → Segment → Embed, against a real database.
 *
 *   DB_HOST=localhost DB_PORT=1455 DB_DATABASE=MJ_6_2_CLEAN_contentpipeline \
 *   DB_USERNAME=sa DB_PASSWORD='...' node scripts/e2e.mjs
 *
 * Serves three documents over real HTTP, so every fetch, parse and chunk is genuine. Prints what
 * landed in the database at each step, and leaves it all there to inspect.
 */
import http from 'node:http';
import { SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import { Metadata, RunView } from '@memberjunction/core';
import sql from 'mssql';

import {
    LoadContentPipelineStages,
    LoadContentPipelineReaders,
    PipelineRecordProcessRunner,
    RegisterPipelineWorkType,
    PIPELINE_STAGE_WORK_TYPE,
} from '../dist/index.js';
import { RecordingVectorWriter } from './e2e-drivers.mjs';

LoadContentPipelineStages();
LoadContentPipelineReaders();
RegisterPipelineWorkType();

const PAGES = {
    '/alpha.html': '<html><head><title>Governance Policy Overview</title></head><body><h1>Governance</h1><p>This policy describes governance expectations for member organizations. Governance reviews occur annually and cover compliance, reporting and oversight responsibilities.</p></body></html>',
    '/beta.html': '<html><head><title>Membership Renewal Guide</title></head><body><p>Renewal notices are issued ninety days before expiry. Members renewing within the window retain continuous benefits, including access to education programs and member pricing.</p></body></html>',
    '/gamma.html': '<html><head><title>Annual Conference Summary</title></head><body><p>The annual conference convened delegates across education, advocacy and research streams. Sessions covered emerging standards, workforce development and regional collaboration.</p></body></html>',
    // Expands into three child items, the way a zip or a CSV of links does.
    '/bundle.html': '<html><head><title>Standards Bundle</title></head><body>' +
        '<article id="standard-a"><h2>Standard A — Safety</h2><p>Safety standard covering equipment inspection, incident reporting and corrective action tracking across member facilities.</p></article>' +
        '<article id="standard-b"><h2>Standard B — Training</h2><p>Training standard describing required competencies, refresher intervals and documentation expectations for certified personnel.</p></article>' +
        '<article id="standard-c"><h2>Standard C — Audit</h2><p>Audit standard setting out sampling methodology, evidence retention and escalation thresholds for nonconformance.</p></article>' +
        '</body></html>',
};

const server = http.createServer((req, res) => {
    const body = PAGES[req.url ?? ''];
    if (!body) {
        res.writeHead(404).end('not found');
        return;
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
console.log(`serving ${Object.keys(PAGES).length} documents at ${base}\n`);

const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST, port: +process.env.DB_PORT, database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true }, requestTimeout: 120000,
}).connect();
await setupSQLServerClient(new SQLServerProviderConfigData(pool, '__mj'), { mode: 'task' });

const md = new Metadata();
const rv = new RunView();
const user = UserCache.Users[0];
const runner = new PipelineRecordProcessRunner();
const entityID = (name) => md.Entities.find((e) => e.Name === name).ID;

const save = async (entityName, fields, label) => {
    const obj = await md.GetEntityObject(entityName, user);
    obj.NewRecord();
    for (const [k, v] of Object.entries(fields)) obj.Set(k, v);
    if (!(await obj.Save())) throw new Error(`${label ?? entityName} failed: ${JSON.stringify(obj.LatestResult?.Errors)}`);
    return obj;
};
const firstOrCreate = async (entityName, fields) => {
    const found = await rv.RunView({ EntityName: entityName, MaxRows: 1, ResultType: 'entity_object' }, user);
    return found.Results?.length ? found.Results[0].Get('ID') : (await save(entityName, fields)).Get('ID');
};

// ── 1. A source serving our three documents ──────────────────────────────────────────────────
const models = await rv.RunView({ EntityName: 'MJ: AI Models', MaxRows: 1 }, user);
const contentTypeID = await firstOrCreate('MJ: Content Types', {
    Name: 'E2E Text', Description: 'seeded by the e2e run', AIModelID: models.Results[0].ID, MinTags: 1, MaxTags: 5,
});
// A dedicated source type declaring exactly what a source of this type must provide. Reusing an
// existing type would inherit its RequiredFields — and the validation would (correctly) reject us.
const typeName = 'E2E Source Type';
const existingType = await rv.RunView({
    EntityName: 'MJ: Content Source Types', ExtraFilter: `Name='${typeName}'`, ResultType: 'entity_object',
}, user);
const sourceTypeID = existingType.Results?.length
    ? existingType.Results[0].Get('ID')
    : (await save('MJ: Content Source Types', {
          Name: typeName,
          Description: 'seeded by the e2e run',
          Configuration: JSON.stringify({
              RequiredFields: [
                  { Key: 'DiscoverDriverKey', Label: 'Discover driver', Type: 'text', Required: true },
                  { Key: 'URLs', Label: 'URLs to discover', Type: 'text', Required: true },
              ],
          }),
      })).Get('ID');
// Named for the format it actually is. A source's declared file type is authoritative and beats
// the URL extension, so declaring something meaningless would (correctly) send every item to the
// plain-text fallback instead of the HTML reader.
const fileTypeName = 'html';
const existingFileType = await rv.RunView({
    EntityName: 'MJ: Content File Types', ExtraFilter: `Name='${fileTypeName}'`, ResultType: 'entity_object',
}, user);
const fileTypeID = existingFileType.Results?.length
    ? existingFileType.Results[0].Get('ID')
    : (await save('MJ: Content File Types', { Name: fileTypeName, Description: 'seeded by the e2e run' })).Get('ID');

const source = await save('MJ: Content Sources', {
    Name: `E2E source ${new Date().toISOString()}`,
    ContentTypeID: contentTypeID, ContentSourceTypeID: sourceTypeID, ContentFileTypeID: fileTypeID,
    URL: base,
    Configuration: JSON.stringify({
        SourceSpecificConfiguration: {
            DiscoverDriverKey: 'E2EList',
            URLs: Object.keys(PAGES).map((p) => base + p),
        },
    }),
}, 'Content Source');
const sourceID = source.Get('ID');
console.log(`1. Content Source  ${sourceID}`);

// ── 2. One Record Process per stage ───────────────────────────────────────────────────────────
const makeProcess = async (name, entityName, filter, configuration) =>
    (await save('MJ: Record Processes', {
        Name: `${name} — e2e ${Date.now()}`,
        EntityID: entityID(entityName),
        WorkType: PIPELINE_STAGE_WORK_TYPE,
        ScopeType: 'Filter',
        ScopeFilter: filter,
        Status: 'Active',
        BatchSize: 50,
        Configuration: JSON.stringify(configuration),
    }, name)).Get('ID');

const discoverRP = await makeProcess('Discover', 'MJ: Content Sources', `ID='${sourceID}'`, { Stages: ['Discover'] });
const extractRP  = await makeProcess('Extract', 'MJ: Content Items', `ContentSourceID='${sourceID}' AND ExtractionStatus='Pending'`,
    { Stages: ['Extract'], Options: { ContentTypeExtractorKey: 'E2EHtml' } });
const tagRP      = await makeProcess('Tag', 'MJ: Content Items', `ContentSourceID='${sourceID}' AND TaggingStatus='Pending'`,
    { Stages: ['Tag'], Options: { ClassifierKey: 'E2EKeyword' } });
const segmentRP  = await makeProcess('Segment', 'MJ: Content Items', `ContentSourceID='${sourceID}' AND SegmentationStatus='Pending'`,
    { Stages: ['Segment'] });
const embedRP    = await makeProcess('Embed', 'MJ: Content Item Chunks', `EmbeddingStatus='Pending'`,
    { Stages: ['Embed'], Options: { VectorWriterKey: 'E2ERecorder' } });
console.log(`2. Record Processes created for Discover, Extract, Tag, Segment, Embed\n`);

// ── 3. Run each stage in order ────────────────────────────────────────────────────────────────
const run = async (label, id) => {
    const r = await runner.RunByID(id, { ContextUser: user, TriggeredBy: 'Manual' });
    console.log(`3. ${label.padEnd(9)} status=${r.Status} processed=${r.Processed} ok=${r.Success} err=${r.Error} skipped=${r.Skipped}`);
    if (r.ErrorMessage) console.log(`             error: ${r.ErrorMessage}`);
    return r;
};
const runs = {
    discover: await run('Discover', discoverRP),
    extract:  await run('Extract', extractRP),
    tag:      await run('Tag', tagRP),
    segment:  await run('Segment', segmentRP),
    embed:    await run('Embed', embedRP),
};

// ── 3b. Re-run: unchanged content must be a no-op ─────────────────────────────────────────────
console.log(`\n3b. REPROCESSING — the same source again, nothing changed`);
const itemsBefore = await rv.RunView({ EntityName: 'MJ: Content Items', ExtraFilter: `ContentSourceID='${sourceID}'` }, user);
const rediscover = await runner.RunByID(discoverRP, { ContextUser: user, TriggeredBy: 'Manual' });
const itemsAfter = await rv.RunView({ EntityName: 'MJ: Content Items', ExtraFilter: `ContentSourceID='${sourceID}'` }, user);
const stillComplete = itemsAfter.Results.filter((i) => i.ExtractionStatus === 'Complete').length;
console.log(`   re-discover: status=${rediscover.Status} ok=${rediscover.Success}`);
console.log(`   items before=${itemsBefore.Results.length} after=${itemsAfter.Results.length}  (no duplicates)`);
console.log(`   still Extraction=Complete: ${stillComplete}/${itemsAfter.Results.length}  (not reset for nothing)`);
const noOp = itemsAfter.Results.length === itemsBefore.Results.length;

// ── 4. What landed in the database ────────────────────────────────────────────────────────────
console.log(`\n4. CONTENT ITEMS`);
const items = await rv.RunView({
    EntityName: 'MJ: Content Items',
    ExtraFilter: `ContentSourceID='${sourceID}'`,
    OrderBy: 'URL',
}, user);
for (const i of items.Results) {
    console.log(`   ${i.Name}`);
    console.log(`     URL=${i.URL}`);
    console.log(`     Extraction=${i.ExtractionStatus} Tagging=${i.TaggingStatus} Segmentation=${i.SegmentationStatus}`);
    console.log(`     Text=${(i.Text ?? '').slice(0, 72)}…`);
    console.log(`     FieldConfidence=${i.FieldConfidence}`);
}

console.log(`\n4b. HIERARCHY — an item that expanded into child items`);
const parents = items.Results.filter((i) => items.Results.some((c) => c.ParentID === i.ID));
for (const parent of parents) {
    console.log(`   ${parent.Name}  (${parent.URL.split('/').pop()})`);
    for (const c of items.Results.filter((i) => i.ParentID === parent.ID)) {
        console.log(`     └─ ${c.Name}  ParentID=${c.ID === parent.ID ? '!' : 'set'}  ${c.URL.split('#').pop()}`);
    }
}
if (parents.length === 0) console.log('   (none)');

console.log(`\n5. CONTENT ITEM CHUNKS`);
const itemIDs = items.Results.map((i) => `'${i.ID}'`).join(',');
const chunks = itemIDs
    ? await rv.RunView({ EntityName: 'MJ: Content Item Chunks', ExtraFilter: `ContentItemID IN (${itemIDs})` }, user)
    : { Results: [] };
console.log(`   ${chunks.Results.length} chunk(s)`);
for (const c of chunks.Results.slice(0, 5)) {
    console.log(`     [${c.EmbeddingStatus}] ${(c.Text ?? '').slice(0, 64)}…`);
}

console.log(`\n6. EMBEDDINGS WRITTEN (via the recording writer)`);
console.log(`   ${RecordingVectorWriter.Upserted.length} vector(s) upserted in ${RecordingVectorWriter.Upserted.length ? 1 : 0} bulk call(s)`);

console.log(`\n7. AUDIT TRAIL`);
for (const [label, r] of Object.entries(runs)) {
    const details = await rv.RunView({
        EntityName: 'MJ: Process Run Details',
        ExtraFilter: `ProcessRunID='${r.ProcessRunID}'`,
    }, user);
    console.log(`   ${label.padEnd(9)} run=${r.ProcessRunID} details=${details.Results.length}`);
}

console.log(`\n--- inspect in SQL ---`);
console.log(`  SELECT Name, ExtractionStatus, TaggingStatus, SegmentationStatus, FieldConfidence`);
console.log(`    FROM __mj.vwContentItems WHERE ContentSourceID = '${sourceID}';`);
console.log(`  SELECT * FROM __mj.vwProcessRunDetails WHERE ProcessRunID IN (`);
console.log(`    ${Object.values(runs).map((r) => `'${r.ProcessRunID}'`).join(', ')});`);

const childCount = items.Results.filter((i) => i.ParentID).length;
const pass =
    noOp &&
    runs.discover.Success === 1 &&
    items.Results.length === 7 && // 4 discovered + 3 expanded from the bundle
    childCount === 3;
console.log(`\nE2E: ${pass ? 'PASS' : 'CHECK OUTPUT'}`);
server.close();
await pool.close();
process.exit(pass ? 0 : 1);
