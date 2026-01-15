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

async function listKeys() {
  try {
    console.log('🔄 Connecting to database...');
    await sql.connect(config);
    console.log('✅ Connected!\n');

    const schema = process.env.DB_SCHEMA || '__mj';

    // Get all API keys with user information
    const query = `
      SELECT
        k.ID,
        k.Name,
        k.Hash,
        k.Status,
        k.ExpiresAt,
        k.LastUsedAt,
        k.__mj_CreatedAt as CreatedAt,
        u.Email as UserEmail,
        u.Name as UserName,
        u.FirstName,
        u.LastName,
        STRING_AGG(s.Name, ', ') as Scopes
      FROM [${schema}].APIKey k
      JOIN [${schema}].[User] u ON k.UserID = u.ID
      LEFT JOIN [${schema}].APIKeyScope ks ON k.ID = ks.APIKeyID
      LEFT JOIN [${schema}].APIScope s ON ks.APIScopeID = s.ID
      GROUP BY
        k.ID, k.Name, k.Hash, k.Status, k.ExpiresAt, k.LastUsedAt, k.__mj_CreatedAt,
        u.Email, u.Name, u.FirstName, u.LastName
      ORDER BY k.__mj_CreatedAt DESC
    `;

    const result = await sql.query(query);

    if (result.recordset.length === 0) {
      console.log('❌ No API keys found in the database.\n');
      console.log('Generate one with:');
      console.log('  cd packages/AI/MCPServer');
      console.log('  node dist/api-key-cli.js generate --user YOUR_EMAIL --scopes "admin:*" --name "My Key"\n');
      process.exit(0);
    }

    console.log(`📋 Found ${result.recordset.length} API key(s):\n`);
    console.log('='.repeat(100));

    for (const key of result.recordset) {
      const status = key.Status === 'Active' ? '✅ ACTIVE' : '❌ REVOKED';
      const name = key.Name || '(unnamed)';
      const expires = key.ExpiresAt ? new Date(key.ExpiresAt).toISOString() : 'Never';
      const lastUsed = key.LastUsedAt ? new Date(key.LastUsedAt).toISOString() : 'Never';
      const created = new Date(key.CreatedAt).toISOString();
      const userInfo = `${key.UserEmail} (${key.FirstName} ${key.LastName})`;

      console.log(`\n${status} - ${name}`);
      console.log('-'.repeat(100));
      console.log(`  Key ID:       ${key.ID}`);
      console.log(`  Hash:         ${key.Hash}`);
      console.log(`  User:         ${userInfo}`);
      console.log(`  Scopes:       ${key.Scopes || 'None'}`);
      console.log(`  Created:      ${created}`);
      console.log(`  Expires:      ${expires}`);
      console.log(`  Last Used:    ${lastUsed}`);
    }

    console.log('\n' + '='.repeat(100));
    console.log('\n⚠️  SECURITY NOTE: The actual API keys are NOT stored in the database.');
    console.log('Only SHA-256 hashes are stored. Keys are only shown once during generation.\n');

    await sql.close();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

listKeys();
