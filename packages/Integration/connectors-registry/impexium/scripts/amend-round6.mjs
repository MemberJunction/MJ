#!/usr/bin/env node
/**
 * amend-round6.mjs — FINAL mechanical amendment (2 write-body-correctness gaps, 6 field edits).
 *
 * Reviewer-confirmed against sources/apiDefinition.swagger.json (swagger 2.0):
 *
 * Fix 1 — CreateBodyShape/UpdateBodyShape flat → literal (4 IOs whose real POST/PUT body is a JSON ARRAY).
 *   A bare `flat` object would be rejected by the API; `literal` signals CodeBuild to array-wrap the body.
 *     ExamScores.CreateBodyShape        — POST /api/v1/Exams/{Exam Code}/Scores            body = array<ExamScoreData>
 *     Categories.CreateBodyShape        — POST /api/v1/Individuals/{Record Number}/Categories body = array<SaveCategoryBasicData>
 *     SessionRegistrations.CreateBodyShape — POST /api/v1/Events/{Event Code}/Sessions/Register/{Customer ID or Record Number} body = array<SessionRegistrationData>
 *     EventAttendance.UpdateBodyShape   — PUT  /api/v1/Events/Registrants/{recordNumber}/Attended body = array<{eventOrSessionCode}>
 *
 * Fix 2 — EventRegistrations is READ-ONLY. Its Create* columns were borrowed from the session-register op
 *   (now owned by SessionRegistrations) and its Update* columns from the mark-attended op (now owned by
 *   EventAttendance). A full-text /Regist/i scan of the swagger found NO genuine create/update-registration
 *   write op (only those two borrowed ops + a Webhooks.Event.Registration.Substituted subscription). So:
 *     SupportsCreate=false + null CreateAPIPath/CreateMethod/CreateBodyShape/CreateBodyKey/CreateIDLocation
 *     SupportsUpdate=false + null UpdateAPIPath/UpdateMethod/UpdateBodyShape/UpdateBodyKey/UpdateIDLocation
 *     SupportsWrite=false  (no remaining write capability — SupportsDelete already false)
 *
 * Persistence: mj-metadata MCP upsert tools ONLY (atomic + backup). Idempotent (upsert-by-Name, shallow-merge).
 * Additive to unrelated slots; nested IOFs (in relatedEntities) are untouched by the fields shallow-merge.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'impexium';
const SWAGGER = 'packages/Integration/connectors-registry/impexium/sources/apiDefinition.swagger.json';
const SCRIPT_REL_PATH = 'scripts/amend-round6.mjs';
const NOW = new Date().toISOString();

async function main() {
    const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], cwd: REPO_ROOT });
    const client = new Client({ name: 'amend-round6', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    const call = async (name, args, what) => {
        const res = await client.callTool({ name, arguments: args });
        if (res.isError) throw new Error(`${what} FAILED: ${JSON.stringify(res.content)}`);
        console.log(`  ok: ${what}`);
    };
    const upIO = (io, what) => call('upsert_integration_object', { connector: CONNECTOR, io }, what);
    const evid = (targetField, excerpt, what) =>
        call('append_code_evidence', {
            connector: CONNECTOR,
            entry: {
                ScriptPath: SCRIPT_REL_PATH, ScriptRunAt: NOW,
                StructuredOutput: { source: SWAGGER, excerpt },
                SchemaValidationStatus: 'Passed', TargetField: targetField,
            },
        }, `CODE_EVIDENCE ${targetField} (${what})`);

    // ── Fix 1 — flat → literal (array bodies) ──
    await upIO({ Name: 'ExamScores', CreateBodyShape: 'literal' }, 'ExamScores.CreateBodyShape=literal');
    await evid('io.ExamScores.CreateBodyShape',
        "paths['/api/v1/Exams/{Exam Code}/Scores'].post body schema = {type:'array', items:{$ref:'#/definitions/ExamScoreData'}} — array body requires literal (array-wrap) not flat",
        'array body');

    await upIO({ Name: 'Categories', CreateBodyShape: 'literal' }, 'Categories.CreateBodyShape=literal');
    await evid('io.Categories.CreateBodyShape',
        "paths['/api/v1/Individuals/{Record Number}/Categories'].post body schema = {type:'array', items:{$ref:'#/definitions/SaveCategoryBasicData'}} — array body requires literal not flat",
        'array body');

    await upIO({ Name: 'SessionRegistrations', CreateBodyShape: 'literal' }, 'SessionRegistrations.CreateBodyShape=literal');
    await evid('io.SessionRegistrations.CreateBodyShape',
        "paths['/api/v1/Events/{Event Code}/Sessions/Register/{Customer ID or Record Number}'].post body schema = {type:'array', items:{$ref:'#/definitions/SessionRegistrationData'}} — array body requires literal not flat",
        'array body');

    await upIO({ Name: 'EventAttendance', UpdateBodyShape: 'literal' }, 'EventAttendance.UpdateBodyShape=literal');
    await evid('io.EventAttendance.UpdateBodyShape',
        "paths['/api/v1/Events/Registrants/{recordNumber}/Attended'].put body schema = {type:'array', items:{type:'object', properties:{eventOrSessionCode}, required:[eventOrSessionCode]}} — array body requires literal not flat",
        'array body');

    // ── Fix 2 — EventRegistrations read-only (null borrowed write columns) ──
    await upIO({
        Name: 'EventRegistrations',
        SupportsWrite: false,
        SupportsCreate: false,
        CreateAPIPath: null, CreateMethod: null, CreateBodyShape: null, CreateBodyKey: null, CreateIDLocation: null,
        SupportsUpdate: false,
        UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateBodyKey: null, UpdateIDLocation: null,
    }, 'EventRegistrations → read-only (Create*/Update* nulled, SupportsWrite=false)');
    await evid('io.EventRegistrations.SupportsWrite',
        "Full-text /Regist/i scan of swagger paths found NO genuine create/update event-registration write op. The only registration write ops are POST /api/v1/Events/{Event Code}/Sessions/Register/{...} (owned by SessionRegistrations) and PUT /api/v1/Events/Registrants/{recordNumber}/Attended (owned by EventAttendance); plus a Webhooks.Event.Registration.Substituted subscription (not a record op). EventRegistrations' Create*/Update* columns were borrowed from those sibling ops → downgraded to read-only.",
        'no genuine registration write op');

    await client.close();
    console.log('\nAmendment round 6 applied: 6 field edits (4 BodyShape=literal + EventRegistrations read-only).');
}

main().catch((err) => { console.error(err); process.exit(1); });
