#!/usr/bin/env node
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

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
    console.log('🔄 Running Rate Limiting Migration...\n');

    try {
        const pool = await sql.connect(config);
        console.log('✅ Connected to database\n');

        // Execute each statement individually with error handling
        console.log('Step 1: Adding columns...');
        await pool.request().query(`
            ALTER TABLE [__mj].APIKey
            ADD
                RateLimitRequests INT NULL,
                RateLimitWindowSeconds INT NULL;
        `);
        console.log('   ✅ Columns added\n');

        console.log('Step 2: Setting default values for existing records...');
        const updateResult = await pool.request().query(`
            UPDATE [__mj].APIKey
            SET
                RateLimitRequests = 1000,
                RateLimitWindowSeconds = 3600
            WHERE
                RateLimitRequests IS NULL
                OR RateLimitWindowSeconds IS NULL;
        `);
        console.log(`   ✅ Updated ${updateResult.rowsAffected[0]} existing records\n`);

        console.log('Step 3: Adding default constraints...');
        await pool.request().query(`
            ALTER TABLE [__mj].APIKey
            ADD CONSTRAINT DF_APIKey_RateLimitRequests DEFAULT 1000 FOR RateLimitRequests;
        `);
        console.log('   ✅ Default constraint for RateLimitRequests added');

        await pool.request().query(`
            ALTER TABLE [__mj].APIKey
            ADD CONSTRAINT DF_APIKey_RateLimitWindowSeconds DEFAULT 3600 FOR RateLimitWindowSeconds;
        `);
        console.log('   ✅ Default constraint for RateLimitWindowSeconds added\n');

        console.log('Step 4: Adding extended properties (documentation)...');
        await pool.request().query(`
            EXEC sp_addextendedproperty
                @name = N'MS_Description',
                @value = N'Maximum number of requests allowed within the rate limit window. Default: 1000 requests per hour.',
                @level0type = N'SCHEMA', @level0name = N'__mj',
                @level1type = N'TABLE',  @level1name = N'APIKey',
                @level2type = N'COLUMN', @level2name = N'RateLimitRequests';
        `);
        console.log('   ✅ Description for RateLimitRequests added');

        await pool.request().query(`
            EXEC sp_addextendedproperty
                @name = N'MS_Description',
                @value = N'Time window in seconds for rate limiting. Default: 3600 (1 hour). Common values: 60 (1 min), 300 (5 min), 3600 (1 hour), 86400 (1 day).',
                @level0type = N'SCHEMA', @level0name = N'__mj',
                @level1type = N'TABLE',  @level1name = N'APIKey',
                @level2type = N'COLUMN', @level2name = N'RateLimitWindowSeconds';
        `);
        console.log('   ✅ Description for RateLimitWindowSeconds added\n');

        console.log('Step 5: Adding check constraints...');
        await pool.request().query(`
            ALTER TABLE [__mj].APIKey
            ADD CONSTRAINT CK_APIKey_RateLimitRequests CHECK (RateLimitRequests > 0);
        `);
        console.log('   ✅ Check constraint for RateLimitRequests added');

        await pool.request().query(`
            ALTER TABLE [__mj].APIKey
            ADD CONSTRAINT CK_APIKey_RateLimitWindowSeconds CHECK (RateLimitWindowSeconds > 0);
        `);
        console.log('   ✅ Check constraint for RateLimitWindowSeconds added\n');

        console.log('═'.repeat(70));
        console.log('✅ Migration completed successfully!');
        console.log('═'.repeat(70));
        console.log('\nDefault rate limit: 1000 requests per 3600 seconds (1 hour)\n');

        // Verify
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

        console.log('📊 Verification:\n');
        console.table(verification.recordset);

        await pool.close();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Migration failed!');
        console.error('Error:', error.message);

        if (error.number) {
            console.error('SQL Error Number:', error.number);

            // Common error codes
            if (error.number === 2705) {
                console.error('\n💡 Hint: Columns already exist. Migration may have been run before.');
            } else if (error.number === 1781) {
                console.error('\n💡 Hint: Constraint already exists.');
            }
        }

        if (error.lineNumber) {
            console.error('Line Number:', error.lineNumber);
        }

        console.error('\nFull error:', error);
        process.exit(1);
    }
}

runMigration();
