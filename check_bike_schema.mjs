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
    
    // Get columns for Bike table
    const columns = await sql.query`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'MJ_Biking_App' AND TABLE_NAME = 'Bike'
      ORDER BY ORDINAL_POSITION
    `;
    
    console.log('\n=== Bike Table Columns ===');
    console.log(JSON.stringify(columns.recordset, null, 2));
    
    // Get some sample data
    const samples = await sql.query`
      SELECT TOP 5 * FROM [MJ_Biking_App].[Bike]
    `;
    
    console.log('\n=== Sample Bike Data ===');
    console.log(JSON.stringify(samples.recordset, null, 2));
    
    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
