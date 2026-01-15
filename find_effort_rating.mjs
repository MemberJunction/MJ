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
    
    // Find any column named effort_rating
    const columns = await sql.query`
      SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE COLUMN_NAME LIKE '%effort%' OR COLUMN_NAME LIKE '%rating%'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `;
    
    console.log('\n=== Columns with effort or rating ===');
    console.log(JSON.stringify(columns.recordset, null, 2));
    
    // List all tables in MJ_Biking_App schema
    const bikingTables = await sql.query`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'MJ_Biking_App' AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `;
    
    console.log('\n=== All Tables in MJ_Biking_App ===');
    console.log(JSON.stringify(bikingTables.recordset, null, 2));
    
    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
