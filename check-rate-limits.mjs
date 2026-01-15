import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const config = {
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true }
};

const pool = await sql.connect(config);
const result = await pool.request().query(\`
    SELECT 
        Name,
        Status,
        RateLimitRequests,
        RateLimitWindowSeconds,
        CASE 
            WHEN RateLimitWindowSeconds = 60 THEN CONCAT(RateLimitRequests, ' req/min')
            WHEN RateLimitWindowSeconds = 3600 THEN CONCAT(RateLimitRequests, ' req/hour')
            WHEN RateLimitWindowSeconds = 86400 THEN CONCAT(RateLimitRequests, ' req/day')
            ELSE CONCAT(RateLimitRequests, ' req/', RateLimitWindowSeconds, 's')
        END AS RateLimit
    FROM [__mj].APIKey
    ORDER BY __mj_CreatedAt DESC
\`);

console.log('📊 API Key Rate Limits:\n');
console.table(result.recordset);
await pool.close();
