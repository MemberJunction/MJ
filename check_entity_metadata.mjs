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

    // First find the correct schema for Entity table
    const schemaQuery = `
      SELECT DISTINCT SCHEMA_NAME(schema_id) AS SchemaName
      FROM sys.tables
      WHERE name = 'Entity'
    `;

    const schemaResult = await sql.query(schemaQuery);
    console.log('Schemas with Entity table:', JSON.stringify(schemaResult.recordset, null, 2));

    if (schemaResult.recordset.length > 0) {
      const schema = schemaResult.recordset[0].SchemaName;
      console.log(`\nUsing schema: ${schema}`);

      // Now check for biking entities
      const entityQuery = `
        SELECT ID, Name, SchemaName, BaseTable, BaseView
        FROM [${schema}].Entity
        WHERE Name LIKE '%Rider%'
           OR Name LIKE '%Bike%'
           OR Name LIKE '%Location%'
           OR Name LIKE '%Weather%'
           OR SchemaName = 'MJ_Biking_App'
        ORDER BY Name
      `;

      const entityResult = await sql.query(entityQuery);
      console.log('\n=== Biking App Entities ===');
      if (entityResult.recordset.length > 0) {
        console.log(JSON.stringify(entityResult.recordset, null, 2));
      } else {
        console.log('No entities found - CodeGen has not run yet');
      }
    }

    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
