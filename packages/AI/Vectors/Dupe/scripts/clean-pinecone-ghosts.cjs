/**
 * clean-pinecone-ghosts.cjs — remove orphaned ("ghost") Events vectors from the
 * shared Pinecone index.
 *
 * WHY: vectors are keyed by SHA-1(entityDocumentID + recordCompositeKey). When the
 * Events records were re-seeded with new primary keys, their old embeddings were left
 * behind in Pinecone. A nearest-neighbour query then returns those ghosts — often a
 * record's own former vector (identical name, ~0.98 score) — which looks like a record
 * matching itself. The detector now filters these at query time, but this script
 * physically removes them so the index reflects reality.
 *
 * SAFETY:
 *   - Scans the shared index but ONLY ever considers vectors whose metadata.Entity
 *     === the target entity name (default "Events"). Vectors for every other entity
 *     are never touched.
 *   - Of those, it deletes ONLY vectors whose RecordID no longer exists in the live
 *     table. Current records' vectors are kept.
 *   - DRY RUN by default. Pass --apply to actually delete.
 *
 * Reads DB + Pinecone creds from the repo-root .env (no secrets in this file).
 *
 * USAGE (from repo root):
 *   node packages/AI/Vectors/Dupe/scripts/clean-pinecone-ghosts.cjs            # dry run
 *   node packages/AI/Vectors/Dupe/scripts/clean-pinecone-ghosts.cjs --apply    # delete ghosts
 *   node packages/AI/Vectors/Dupe/scripts/clean-pinecone-ghosts.cjs --entity="Events" --apply
 */
const { Pinecone } = require('@pinecone-database/pinecone');
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const INDEX_NAME = 'mj-knowledge-index';
const EVENTS_BASE_VIEW = 'AssociationDemo.vwEvents';
const FETCH_BATCH = 100;   // Pinecone fetch() id cap per call
const DELETE_BATCH = 250;

function env(key) {
    // This file lives at packages/AI/Vectors/Dupe/scripts/ — repo root is five levels up.
    const txt = fs.readFileSync(path.resolve(__dirname, '../../../../../.env'), 'utf8');
    const m = txt.match(new RegExp('^\\s*' + key + '\\s*=\\s*(.+)$', 'm'));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : undefined;
}

const norm = (v) => String(v ?? '').trim().toLowerCase();

/** Retry a Pinecone call a few times — the API occasionally returns transient network errors. */
async function withRetry(label, fn, attempts = 5) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        }
    }
    throw new Error(`${label} failed after ${attempts} attempts: ${lastErr?.message ?? lastErr}`);
}

/** Parse the UUID out of a "ID|<uuid>" (or bare uuid) RecordID metadata string. */
function recordIdToUuid(recordId) {
    if (!recordId) return '';
    const parts = String(recordId).split('|');
    return norm(parts[parts.length - 1]);
}

async function getCurrentEventIDs(pool) {
    const r = await pool.request().query(`SELECT ID FROM ${EVENTS_BASE_VIEW}`);
    return new Set(r.recordset.map((row) => norm(row.ID)));
}

async function listAllVectorIDs(index) {
    const ids = [];
    let paginationToken;
    do {
        const token = paginationToken;
        const res = await withRetry('listPaginated', () =>
            index.listPaginated(token ? { limit: 100, paginationToken: token } : { limit: 100 }));
        for (const v of res.vectors ?? []) {
            if (v.id) ids.push(v.id);
        }
        paginationToken = res.pagination?.next;
    } while (paginationToken);
    return ids;
}

async function main() {
    const apply = process.argv.includes('--apply');
    const entityArg = process.argv.find((a) => a.startsWith('--entity='));
    const targetEntity = norm(entityArg ? entityArg.split('=')[1] : 'Events');

    const apiKey = env('AI_VENDOR_API_KEY__PineconeDatabase');
    if (!apiKey) throw new Error('Pinecone API key (AI_VENDOR_API_KEY__PineconeDatabase) not found in .env');

    const pool = await sql.connect({
        server: env('DB_HOST'), port: parseInt(env('DB_PORT'), 10),
        user: env('DB_USERNAME'), password: env('DB_PASSWORD'), database: env('DB_DATABASE'),
        options: { trustServerCertificate: true, encrypt: false }, requestTimeout: 120000,
    });
    const currentIDs = await getCurrentEventIDs(pool);
    console.log(`Live "${targetEntity}" records in DB: ${currentIDs.size}`);
    await pool.close();

    const pc = new Pinecone({ apiKey });
    const index = pc.index(INDEX_NAME);

    console.log(`Listing all vector IDs in "${INDEX_NAME}"...`);
    const allIDs = await listAllVectorIDs(index);
    console.log(`Total vectors in index: ${allIDs.length}`);

    let entityVectors = 0;
    let kept = 0;
    const ghosts = [];

    for (let i = 0; i < allIDs.length; i += FETCH_BATCH) {
        const batch = allIDs.slice(i, i + FETCH_BATCH);
        const res = await withRetry('fetch', () => index.fetch(batch));
        const records = res.records ?? res.vectors ?? {};
        for (const id of Object.keys(records)) {
            const meta = records[id].metadata ?? {};
            if (norm(meta.Entity) !== targetEntity) continue; // never touch other entities
            entityVectors++;
            const uuid = recordIdToUuid(meta.RecordID);
            if (currentIDs.has(uuid)) {
                kept++;
            } else {
                ghosts.push({ id, recordId: meta.RecordID, name: meta.Name });
            }
        }
    }

    console.log(`\n"${targetEntity}" vectors in index: ${entityVectors}`);
    console.log(`  kept (record exists):  ${kept}`);
    console.log(`  ghosts (orphaned):     ${ghosts.length}`);
    if (ghosts.length) {
        console.log('\nSample ghosts:');
        for (const g of ghosts.slice(0, 10)) {
            console.log(`  ${g.id}  ${g.recordId}  "${g.name ?? ''}"`);
        }
    }

    if (!apply) {
        console.log(`\nDRY RUN — nothing deleted. Re-run with --apply to delete ${ghosts.length} ghost vector(s).`);
        return;
    }
    if (ghosts.length === 0) {
        console.log('\nNothing to delete.');
        return;
    }

    console.log(`\nDeleting ${ghosts.length} ghost vector(s)...`);
    const ghostIDs = ghosts.map((g) => g.id);
    for (let i = 0; i < ghostIDs.length; i += DELETE_BATCH) {
        await index.deleteMany(ghostIDs.slice(i, i + DELETE_BATCH));
        console.log(`  deleted ${Math.min(i + DELETE_BATCH, ghostIDs.length)}/${ghostIDs.length}`);
    }
    console.log('Done.');
}

main().catch((err) => { console.error('ERROR:', err?.message ?? err); process.exit(1); });
