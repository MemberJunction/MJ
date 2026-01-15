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
    console.log('Connected!');
    
    // Find tables with biker or bike in the name
    const result = await sql.query`
      SELECT TABLE_SCHEMA, TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME LIKE '%biker%' OR TABLE_NAME LIKE '%bike%' OR TABLE_NAME LIKE '%effort%'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `;
    
    console.log('\n=== Relevant Tables ===');
    console.log(JSON.stringify(result.recordset, null, 2));
    
    // Also check entities
    const entities = await sql.query`
      SELECT Name, SchemaName, BaseTable 
      FROM [__mj].Entity 
      WHERE Name LIKE '%biker%' OR Name LIKE '%bike%' OR Name LIKE '%effort%' OR BaseTable LIKE '%biker%' OR BaseTable LIKE '%bike%'
      ORDER BY Name
    `;
    
    console.log('\n=== Relevant Entities ===');
    console.log(JSON.stringify(entities.recordset, null, 2));
    
    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
