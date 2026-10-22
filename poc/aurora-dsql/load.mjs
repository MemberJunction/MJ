// Applies the MJ PG baseline to DSQL one statement per autocommit transaction and
// records each statement's outcome to results.jsonl. Usage: node load.mjs <baseline.sql> <host>
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { splitStatements } from './split.mjs';

const requireFromRepo = createRequire(new URL('../../packages/PostgreSQLDataProvider/', import.meta.url));
const pg = requireFromRepo('pg');

const [baseline, host] = process.argv.slice(2);
if (!baseline || !host) throw new Error('usage: node load.mjs <baseline.sql> <host>');

const MAX_RECONNECTS = 10;
const MAX_OCC_RETRIES = 3;
const SAMPLE_PER_SKIPPED_KIND = 20;
// Grants target roles that don't exist here and comments are inert; sample them, don't run all.
const SAMPLED_KINDS = new Set(['GRANT', 'COMMENT ON COLUMN', 'COMMENT ON TABLE', 'COMMENT ON VIEW', 'COMMENT ON FUNCTION']);

function kindOf(stmt) {
    const m = /^(CREATE( OR REPLACE)?( UNIQUE)? [A-Z]+|ALTER [A-Z]+|COMMENT ON [A-Z]+|INSERT INTO|[A-Z]+)/.exec(stmt);
    return m ? m[1] : stmt.slice(0, 20);
}

function token() {
    return execFileSync('aws', ['dsql', 'generate-db-connect-admin-auth-token', '--profile', 'mj', '--region', 'us-east-1',
        '--hostname', host, '--expires-in', '3600'], { encoding: 'utf8' }).trim();
}

async function connect() {
    const client = new pg.Client({ host, port: 5432, user: 'admin', database: 'postgres', password: token(), ssl: { rejectUnauthorized: true } });
    client.on('error', (e) => console.error('client error:', e.message));
    await client.connect();
    return client;
}

const isOcc = (e) => e.code === '40001' || /^OC00/.test(e.code ?? '');
const isConnLost = (e) => !e.code || /^(08|57P)/.test(e.code) || /terminated|ECONNRESET|Connection/.test(e.message);

const statements = splitStatements(fs.readFileSync(baseline, 'utf8'));
const out = fs.createWriteStream('results.jsonl');
const sampled = new Map();
let client = await connect();
let reconnects = 0;
async function execute(stmt, i) {
    let result;
    for (let attempt = 0; attempt <= MAX_OCC_RETRIES; attempt++) {
        try {
            await client.query(stmt);
            return { ok: true };
        } catch (e) {
            result = { ok: false, code: e.code, msg: e.message.split('\n')[0] };
            if (isConnLost(e)) {
                if (++reconnects > MAX_RECONNECTS) throw new Error(`gave up after ${MAX_RECONNECTS} reconnects at stmt ${i}: ${e.message}`);
                await client.end().catch((endErr) => console.error('end failed:', endErr.message));
                client = await connect();
                continue;
            }
            if (!isOcc(e)) return result;
        }
    }
    return result;
}

// Missing-dependency failures (object defined later in the file) get re-run in later rounds.
const MAX_RETRY_ROUNDS = 8;
const isMissingDep = (r) => !r.ok && ['42P01', '42883', '42704'].includes(r.code);

let pending = [];
for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const kind = kindOf(stmt);
    if (SAMPLED_KINDS.has(kind)) {
        const seen = sampled.get(kind) ?? 0;
        sampled.set(kind, seen + 1);
        if (seen >= SAMPLE_PER_SKIPPED_KIND) continue;
    }
    const t0 = Date.now();
    const result = await execute(stmt, i);
    out.write(JSON.stringify({ i, round: 0, kind, ms: Date.now() - t0, ...result, head: stmt.slice(0, 160) }) + '\n');
    if (isMissingDep(result)) pending.push(i);
    if (i % 250 === 0) console.log(`${i}/${statements.length}`);
}

for (let round = 1; round <= MAX_RETRY_ROUNDS && pending.length > 0; round++) {
    const still = [];
    for (const i of pending) {
        const result = await execute(statements[i], i);
        out.write(JSON.stringify({ i, round, kind: kindOf(statements[i]), ...result, head: statements[i].slice(0, 160) }) + '\n');
        if (isMissingDep(result)) still.push(i);
    }
    console.log(`retry round ${round}: ${pending.length - still.length} recovered, ${still.length} still missing deps`);
    pending = still;
}

await client.end();
out.end();
console.log('done', statements.length, 'reconnects', reconnects);
