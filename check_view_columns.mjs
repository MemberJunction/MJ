import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const config = {
  server: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 1433,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

async function main() {
  try {
    console.log('Connecting to database...');
    await sql.connect(config);
    console.log('Connected!\n');

    const views = ['vwRiders', 'vwBikes', 'vwLocations', 'vwWeathers', 'vwRider_Stats'];

    for (const view of views) {
      console.log(`\n=== Columns in MJ_Biking_App.${view} ===`);

      const columnQuery = `
        SELECT
          COLUMN_NAME,
          DATA_TYPE,
          IS_NULLABLE,
          CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'MJ_Biking_App'
          AND TABLE_NAME = '${view}'
        ORDER BY ORDINAL_POSITION
      `;

      const result = await sql.query(columnQuery);
      result.recordset.forEach(col => {
        const nullable = col.IS_NULLABLE === 'YES' ? '(nullable)' : '';
        const maxLen = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
        console.log(`  ${col.COLUMN_NAME}: ${col.DATA_TYPE}${maxLen} ${nullable}`);
      });
    }

    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
