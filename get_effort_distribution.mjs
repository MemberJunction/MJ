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
    await sql.connect(config);
    
    // Get effort_rating distribution from Rider_Stats
    const result = await sql.query`
      SELECT effort_rating, COUNT(*) as count 
      FROM [MJ_Biking_App].[Rider_Stats] 
      GROUP BY effort_rating 
      ORDER BY effort_rating
    `;
    
    console.log('=== Effort Rating Distribution from Rider_Stats ===');
    console.log(JSON.stringify(result.recordset, null, 2));
    
    // Also get total count
    const total = await sql.query`
      SELECT COUNT(*) as total FROM [MJ_Biking_App].[Rider_Stats]
    `;
    console.log('\nTotal records:', total.recordset[0].total);
    
    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
