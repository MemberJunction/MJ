#!/usr/bin/env node
/**
 * Quick script to run the rate limiting migration
 * Usage: node run-migration.mjs
 */

import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '.env') });

// SQL Server configuration
const config = {
    server: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: true,
        enableArithAbort: true,
        trustServerCertificate: true
    }
};

async function runMigration() {
    console.log('🔄 Connecting to database...');
    console.log(`   Server: ${config.server}`);
    console.log(`   Database: ${config.database}`);
    console.log('');

    try {
        // Connect to database
        const pool = await sql.connect(config);
        console.log('✅ Connected!\n');

        // Read migration file
        const migrationPath = path.join(__dirname, 'migrations/v2/V202601152000__v2.5.x_APIKey_RateLimits_MANUAL.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log('📄 Running migration: V202601152000__v2.5.x_APIKey_RateLimits_MANUAL.sql\n');

        // Split by GO statements and execute each batch
        const batches = migrationSQL
            .split(/\r?\nGO\r?\n/gi)
            .filter(batch => batch.trim().length > 0);

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i].trim();
            if (batch && !batch.startsWith('--') && !batch.startsWith('/*')) {
                console.log(`   Executing batch ${i + 1}/${batches.length}...`);
                const result = await pool.request().query(batch);

                // Show PRINT messages
                if (result.recordset && result.recordset.length > 0) {
                    console.log('   Output:', result.recordset);
                }
            }
        }

        console.log('\n✅ Migration completed successfully!\n');

        // Verify columns were added
        console.log('🔍 Verifying columns were added...\n');
        const verification = await pool.request().query(`
            SELECT
                COLUMN_NAME,
                DATA_TYPE,
                COLUMN_DEFAULT,
                IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = '__mj'
              AND TABLE_NAME = 'APIKey'
              AND COLUMN_NAME IN ('RateLimitRequests', 'RateLimitWindowSeconds')
            ORDER BY COLUMN_NAME
        `);

        if (verification.recordset.length === 2) {
            console.log('✅ Verified: Both columns added successfully!\n');
            console.table(verification.recordset);
        } else {
            console.log('⚠️  Warning: Expected 2 columns, found:', verification.recordset.length);
        }

        await pool.close();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Migration failed!');
        console.error('Error:', error.message);

        if (error.number) {
            console.error('SQL Error Number:', error.number);
        }
        if (error.lineNumber) {
            console.error('Line Number:', error.lineNumber);
        }

        process.exit(1);
    }
}

// Run migration
runMigration();
