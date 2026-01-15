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

async function listUsers() {
  try {
    console.log('🔄 Connecting to database...');
    await sql.connect(config);
    console.log('✅ Connected!\n');

    const schema = process.env.DB_SCHEMA || '__mj';

    const query = `
      SELECT TOP 10
        ID,
        Email,
        Name,
        FirstName,
        LastName,
        IsActive
      FROM [${schema}].[User]
      WHERE IsActive = 1
      ORDER BY Email
    `;

    const result = await sql.query(query);

    if (result.recordset.length === 0) {
      console.log('❌ No active users found\n');
      process.exit(1);
    }

    console.log(`📋 First 10 active users:\n`);

    for (const user of result.recordset) {
      console.log(`  • ${user.Email.padEnd(40)} (${user.FirstName} ${user.LastName})`);
    }

    console.log(`\nUse one of these emails to generate an API key.\n`);

    await sql.close();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

listUsers();
