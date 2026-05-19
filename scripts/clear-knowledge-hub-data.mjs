#!/usr/bin/env node
/**
 * Clears all Knowledge Hub content data from the database and Pinecone.
 * Deletes in proper FK order, then wipes the Pinecone vector index.
 *
 * Usage: node scripts/clear-knowledge-hub-data.mjs
 * Requires: .env with DB_* and AI_VENDOR_API_KEY__PineconeDatabase
 */
import 'dotenv/config';
import sql from 'mssql';
import { Pinecone } from '@pinecone-database/pinecone';

const DB_CONFIG = {
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true }
};

const PINECONE_API_KEY = process.env.AI_VENDOR_API_KEY__PineconeDatabase || process.env.PINECONE_API_KEY;

// Tables to clear, in FK-safe order (children first).
// ContentItem has FK → EntityRecordDocument, so ContentItem must be deleted first.
// ContentProcessRun tracks last-run timestamps — must be cleared or providers think items are "already processed".
const TABLES_TO_CLEAR = [
    'TagCoOccurrence',
    'TaggedItem',
    'ContentItemTag',
    'ContentItemAttribute',
    'ContentItem',
    'EntityRecordDocument',
    'ContentProcessRun',
    'Tag',
];

async function clearDatabase() {
    console.log(`\n=== Clearing database: ${DB_CONFIG.database} ===\n`);
    const pool = await sql.connect(DB_CONFIG);

    for (const table of TABLES_TO_CLEAR) {
        try {
            const countResult = await pool.request().query(`SELECT COUNT(*) as c FROM __mj.${table}`);
            const count = countResult.recordset[0].c;
            if (count === 0) {
                console.log(`  ${table}: already empty`);
                continue;
            }
            await pool.request().query(`DELETE FROM __mj.${table}`);
            console.log(`  ${table}: deleted ${count} rows`);
        } catch (err) {
            console.error(`  ${table}: ERROR — ${err.message}`);
        }
    }

    await pool.close();
    console.log('\nDatabase cleared.');
}

async function clearPinecone() {
    if (!PINECONE_API_KEY) {
        console.log('\n⚠ No Pinecone API key found — skipping vector cleanup.');
        return;
    }

    console.log('\n=== Clearing Pinecone vectors ===\n');
    const pc = new Pinecone({ apiKey: PINECONE_API_KEY });

    // Get index name from DB (or fall back to default)
    let indexName = 'mj-knowledge-index';
    try {
        const pool = await sql.connect(DB_CONFIG);
        const result = await pool.request().query(`SELECT TOP 1 Name FROM __mj.VectorIndex`);
        if (result.recordset.length > 0) {
            indexName = result.recordset[0].Name;
        }
        await pool.close();
    } catch { /* use default */ }

    try {
        const index = pc.index(indexName);
        // Delete all vectors in the default namespace
        await index.namespace('').deleteAll();
        console.log(`  Deleted all vectors from index "${indexName}" (default namespace)`);

        // Also try listing and clearing named namespaces
        try {
            const stats = await index.describeIndexStats();
            const namespaces = Object.keys(stats.namespaces || {});
            for (const ns of namespaces) {
                if (ns === '') continue; // already cleared
                await index.namespace(ns).deleteAll();
                console.log(`  Deleted all vectors from namespace "${ns}"`);
            }
        } catch (nsErr) {
            console.log(`  Could not enumerate namespaces: ${nsErr.message}`);
        }
    } catch (err) {
        console.error(`  Pinecone error: ${err.message}`);
    }

    console.log('\nPinecone cleared.');
}

async function main() {
    console.log('Knowledge Hub Data Cleanup');
    console.log('='.repeat(40));

    await clearDatabase();
    await clearPinecone();

    console.log('\nDone.');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
