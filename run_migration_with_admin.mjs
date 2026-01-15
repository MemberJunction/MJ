import sql from 'mssql';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Use admin credentials from environment or fallback to regular credentials
const config = {
  server: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 1433,
  user: process.env.DB_ADMIN_USERNAME || process.env.DB_USERNAME,
  password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

async function run() {
  let pool;

  try {
    console.log('🔄 Connecting to database as admin...');
    console.log(`   Server: ${config.server}:${config.port}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}`);

    pool = new sql.ConnectionPool(config);
    await pool.connect();
    console.log('✅ Connected!\n');

    const schema = process.env.DB_SCHEMA || '__mj';
    const regularUser = process.env.DB_USERNAME || 'MJ_Connect';

    // Step 1: Grant permissions
    console.log('📝 Step 1: Granting permissions to MJ_Connect...\n');

    const permissions = [
      `GRANT CREATE TABLE TO [${regularUser}]`,
      `GRANT ALTER ON SCHEMA::${schema} TO [${regularUser}]`,
      `GRANT REFERENCES ON SCHEMA::${schema} TO [${regularUser}]`,
      `GRANT EXECUTE ON sys.sp_addextendedproperty TO [${regularUser}]`,
      `GRANT INSERT ON SCHEMA::${schema} TO [${regularUser}]`,
      `GRANT SELECT ON SCHEMA::${schema} TO [${regularUser}]`
    ];

    for (const perm of permissions) {
      try {
        await pool.request().query(perm);
        console.log(`   ✓ ${perm}`);
      } catch (err) {
        // Permission might already exist
        if (err.message.includes('already') || err.message.includes('exist')) {
          console.log(`   ⏭️  ${perm} (already granted)`);
        } else {
          console.log(`   ⚠️  ${perm} - ${err.message}`);
        }
      }
    }

    console.log('\n✅ Permissions granted!\n');

    // Step 2: Run migration
    console.log('📝 Step 2: Running migration...\n');

    const migrationPath = path.join(__dirname, 'migrations', 'v2', 'V202601151000__v2.5.x_MCP_Authentication.sql');
    let migrationSQL = await fs.readFile(migrationPath, 'utf-8');
    migrationSQL = migrationSQL.replace(/\$\{flyway:defaultSchema\}/g, schema);

    console.log('🚀 Executing migration...\n');

    try {
      await pool.request().query(migrationSQL);
      console.log('✅ Migration executed successfully!\n');
    } catch (err) {
      if (err.message.includes('already') || err.message.includes('exist')) {
        console.log('⏭️  Migration already applied (tables exist)\n');
      } else {
        throw err;
      }
    }

    // Step 3: Verify tables
    console.log('📝 Step 3: Verifying tables...\n');

    const tableQuery = `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = '${schema}'
      AND TABLE_NAME IN ('APIScope', 'APIKey', 'APIKeyScope', 'APIKeyUsageLog')
      ORDER BY TABLE_NAME
    `;

    const tableResult = await pool.request().query(tableQuery);

    if (tableResult.recordset.length === 4) {
      console.log('✅ All 4 tables verified:');
      tableResult.recordset.forEach(row => {
        console.log(`   ✓ ${schema}.${row.TABLE_NAME}`);
      });
    } else {
      console.log(`⚠️  Expected 4 tables, found ${tableResult.recordset.length}`);
    }

    // Step 4: Check seed data
    console.log('\n📝 Step 4: Checking seed data...\n');

    const scopeQuery = `SELECT Name, Category FROM [${schema}].APIScope ORDER BY Name`;
    const scopeResult = await pool.request().query(scopeQuery);

    if (scopeResult.recordset.length > 0) {
      console.log(`✅ Found ${scopeResult.recordset.length} default scopes:\n`);
      scopeResult.recordset.forEach(scope => {
        console.log(`   • ${scope.Name.padEnd(20)} [${scope.Category}]`);
      });
    } else {
      console.log('⚠️  No scopes found');
    }

    console.log('\n' + '='.repeat(70));
    console.log('🎉 Migration Complete!');
    console.log('='.repeat(70));
    console.log('\n📋 Next Steps:');
    console.log('   1. Run CodeGen to generate entity classes');
    console.log('   2. Verify with: node verify_mcp_auth_tables.mjs');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

run();
