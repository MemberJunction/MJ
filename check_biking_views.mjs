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

    // Check for views with "Rider" or "Bike" in the name
    const viewQuery = `
      SELECT
        TABLE_SCHEMA,
        TABLE_NAME
      FROM INFORMATION_SCHEMA.VIEWS
      WHERE TABLE_NAME LIKE '%Rider%'
         OR TABLE_NAME LIKE '%Bike%'
         OR TABLE_NAME LIKE '%Location%'
         OR TABLE_NAME LIKE '%Weather%'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `;

    const viewResult = await sql.query(viewQuery);

    console.log('=== Views related to Biking App ===');
    if (viewResult.recordset.length > 0) {
      console.log(JSON.stringify(viewResult.recordset, null, 2));
    } else {
      console.log('No views found');
    }

    // Also check Entity table for biking entities
    console.log('\n=== Checking Entity table ===');
    const entityQuery = `
      SELECT ID, Name, SchemaName, BaseTable, BaseView
      FROM [${process.env.DB_SCHEMA || 'dbo'}].Entity
      WHERE Name LIKE '%Rider%'
         OR Name LIKE '%Bike%'
         OR Name LIKE '%Location%'
         OR Name LIKE '%Weather%'
         OR SchemaName = 'MJ_Biking_App'
      ORDER BY Name
    `;

    const entityResult = await sql.query(entityQuery);
    if (entityResult.recordset.length > 0) {
      console.log(JSON.stringify(entityResult.recordset, null, 2));
    } else {
      console.log('No entities found in Entity table');
    }

    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
