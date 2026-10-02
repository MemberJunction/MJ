/**
 * Runs a pipeline job through the REAL running MJAPI — no in-process registration, no stubs.
 *
 * This is the test my in-process harness structurally could not perform: the harness registers the
 * stages itself, so it cannot detect their absence in a server. Here the server must have loaded
 * them through its own class-registration manifest and startup sink, or nothing works.
 *
 *   API=http://localhost:4411 KEY=... node scripts/api-job.mjs
 */
import http from 'node:http';

const API = process.env.API ?? 'http://localhost:4411';
const KEY = process.env.KEY ?? 'cp-e2e-local-key';

/** One GraphQL call against the running server. */
async function gql(query, variables = {}) {
    const response = await fetch(`${API}/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mj-api-key': KEY },
        body: JSON.stringify({ query, variables }),
    });
    const body = await response.json();
    if (body.errors) {
        throw new Error(`GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    return body.data;
}

// Serve three documents the pipeline will really fetch.
const PAGES = {
    '/one.html': '<html><head><title>Governance Policy</title></head><body><p>Governance expectations for member organizations, covering compliance, reporting and oversight responsibilities across the network.</p></body></html>',
    '/two.html': '<html><head><title>Renewal Guide</title></head><body><p>Renewal notices issue ninety days before expiry. Members renewing within the window retain continuous benefits and member pricing.</p></body></html>',
};
const server = http.createServer((req, res) => {
    const body = PAGES[req.url ?? ''];
    if (!body) return void res.writeHead(404).end('not found');
    res.writeHead(200, { 'content-type': 'text/html' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
console.log(`serving ${Object.keys(PAGES).length} documents at ${base}`);

// 1. Confirm the server is answering and knows our entities.
const probe = await gql(`query { __typename }`);
console.log(`1. API responding: ${JSON.stringify(probe)}`);

// 2. Ask the server to run the Record Process. If the work type was never registered in THIS
//    process, this fails with "unsupported WorkType" — which is exactly the bug booting found.
const recordProcessID = process.env.RECORD_PROCESS_ID;
if (!recordProcessID) {
    console.log('\nSet RECORD_PROCESS_ID to the Discover process created by the seeding step.');
    server.close();
    process.exit(2);
}

console.log(`2. calling RecordProcess.RunNow for ${recordProcessID} …`);
const result = await gql(
    `mutation Run($input: ExecuteRemoteOperationInput!) {
        ExecuteRemoteOperation(input: $input) { success resultCode errorMessage outputJSON handle }
    }`,
    {
        input: {
            operationKey: 'RecordProcess.RunNow',
            inputJSON: JSON.stringify({ recordProcessID }),
            invokeMode: 'Sync',
        },
    },
);

const run = result.ExecuteRemoteOperation;
console.log(`3. success=${run.success} resultCode=${run.resultCode ?? '-'} handle=${run.handle ?? '-'}`);
if (run.errorMessage) console.log(`   error: ${run.errorMessage}`);
if (run.outputJSON) console.log(`   output: ${run.outputJSON.slice(0, 500)}`);

server.close();
process.exit(run.success ? 0 : 1);
