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

async function checkColumns() {
    try {
        const pool = await sql.connect(config);

        console.log('📊 Current columns in APIKey table:\n');

        const result = await pool.request().query(`
            SELECT
                COLUMN_NAME,
                DATA_TYPE,
                CHARACTER_MAXIMUM_LENGTH,
                COLUMN_DEFAULT,
                IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = '__mj'
              AND TABLE_NAME = 'APIKey'
            ORDER BY ORDINAL_POSITION
        `);

        console.table(result.recordset);

        console.log(`\nTotal columns: ${result.recordset.length}`);

        // Check if rate limit columns exist
        const hasRateLimitRequests = result.recordset.some(c => c.COLUMN_NAME === 'RateLimitRequests');
        const hasRateLimitWindowSeconds = result.recordset.some(c => c.COLUMN_NAME === 'RateLimitWindowSeconds');

        console.log('\n📋 Rate Limiting Columns:');
        console.log(`   RateLimitRequests: ${hasRateLimitRequests ? '✅ EXISTS' : '❌ MISSING'}`);
        console.log(`   RateLimitWindowSeconds: ${hasRateLimitWindowSeconds ? '✅ EXISTS' : '❌ MISSING'}`);

        await pool.close();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkColumns();
