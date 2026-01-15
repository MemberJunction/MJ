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
    
    // Query biker_stats for effort_rating distribution
    const result = await sql.query`
      SELECT effort_rating, COUNT(*) as count 
      FROM biker_stats 
      GROUP BY effort_rating 
      ORDER BY effort_rating
    `;
    
    console.log('\n=== Effort Rating Distribution ===');
    console.log(JSON.stringify(result.recordset, null, 2));
    
    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
