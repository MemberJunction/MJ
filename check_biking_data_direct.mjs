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

    // Check if MJ_Biking_App schema exists
    const schemaCheck = await sql.query`
      SELECT SCHEMA_NAME
      FROM INFORMATION_SCHEMA.SCHEMATA
      WHERE SCHEMA_NAME = 'MJ_Biking_App'
    `;

    if (schemaCheck.recordset.length === 0) {
      console.log('❌ MJ_Biking_App schema does not exist');
      await sql.close();
      return;
    }

    console.log('✓ MJ_Biking_App schema exists\n');

    // Check each table
    const tables = ['Rider', 'Bike', 'Location', 'Weather', 'Rider_Stats'];

    for (const table of tables) {
      console.log(`--- Checking MJ_Biking_App.${table} ---`);

      try {
        const countQuery = `SELECT COUNT(*) as count FROM [MJ_Biking_App].[${table}]`;
        const countResult = await sql.query(countQuery);
        const count = countResult.recordset[0].count;

        console.log(`✓ Found ${count} records`);

        if (count > 0) {
          const sampleQuery = `SELECT TOP 3 * FROM [MJ_Biking_App].[${table}]`;
          const sampleResult = await sql.query(sampleQuery);
          console.log('Sample records:');
          console.log(JSON.stringify(sampleResult.recordset, null, 2));
        }
        console.log('');
      } catch (err) {
        console.log(`✗ Error: ${err.message}\n`);
      }
    }

    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
