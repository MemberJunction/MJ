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

async function verify() {
  try {
    console.log('🔄 Connecting to database...');
    await sql.connect(config);
    console.log('✅ Connected!\n');

    const schema = process.env.DB_SCHEMA || '__mj';

    // Check if tables exist
    console.log('📊 Checking for MCP Authentication tables...\n');
    const tableQuery = `
      SELECT
        t.TABLE_NAME,
        (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) as ColumnCount
      FROM INFORMATION_SCHEMA.TABLES t
      WHERE t.TABLE_SCHEMA = '${schema}'
      AND t.TABLE_NAME IN ('APIScope', 'APIKey', 'APIKeyScope', 'APIKeyUsageLog')
      ORDER BY t.TABLE_NAME
    `;

    const tableResult = await sql.query(tableQuery);

    if (tableResult.recordset.length === 0) {
      console.log('❌ No MCP authentication tables found!');
      console.log('\nThe migration has NOT been applied yet.');
      console.log('Please run the migration first or check database permissions.\n');
      process.exit(1);
    }

    console.log(`✅ Found ${tableResult.recordset.length} tables:\n`);
    tableResult.recordset.forEach(row => {
      console.log(`   ✓ ${schema}.${row.TABLE_NAME} (${row.ColumnCount} columns)`);
    });

    // Check Entity table for CodeGen metadata
    console.log('\n📋 Checking Entity metadata (CodeGen status)...\n');
    const entityQuery = `
      SELECT ID, Name, SchemaName, BaseTable, BaseView
      FROM [${schema}].Entity
      WHERE SchemaName = '${schema}'
      AND BaseTable IN ('APIScope', 'APIKey', 'APIKeyScope', 'APIKeyUsageLog')
      ORDER BY Name
    `;

    const entityResult = await sql.query(entityQuery);

    if (entityResult.recordset.length === 0) {
      console.log('⚠️  Tables exist but NOT registered in Entity metadata!');
      console.log('\n📝 This means CodeGen has NOT run yet after the migration.');
      console.log('   Please run CodeGen to generate entity classes.\n');
    } else {
      console.log(`✅ Found ${entityResult.recordset.length} entities registered:\n`);
      entityResult.recordset.forEach(row => {
        console.log(`   ✓ ${row.Name} (${row.BaseTable})`);
      });
      console.log('\n🎉 CodeGen has processed these tables!');
    }

    // Check seed data
    console.log('\n🌱 Checking seed data...\n');
    const scopeQuery = `SELECT Name, Category, Description FROM [${schema}].APIScope ORDER BY Name`;
    const scopeResult = await sql.query(scopeQuery);

    if (scopeResult.recordset.length > 0) {
      console.log(`✅ Found ${scopeResult.recordset.length} default scopes:\n`);
      scopeResult.recordset.forEach(scope => {
        console.log(`   • ${scope.Name.padEnd(20)} [${scope.Category}]`);
        console.log(`     ${scope.Description.substring(0, 80)}...`);
      });
    } else {
      console.log('⚠️  No scopes found - seed data may not have been inserted');
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 Summary:');
    console.log('='.repeat(70));
    console.log(`Database Tables:    ${tableResult.recordset.length === 4 ? '✅' : '❌'} ${tableResult.recordset.length}/4`);
    console.log(`Entity Metadata:    ${entityResult.recordset.length === 4 ? '✅' : '⚠️ '} ${entityResult.recordset.length}/4`);
    console.log(`Seed Data (Scopes): ${scopeResult.recordset.length === 5 ? '✅' : '⚠️ '} ${scopeResult.recordset.length}/5`);
    console.log('='.repeat(70));

    if (tableResult.recordset.length === 4 && entityResult.recordset.length === 4) {
      console.log('\n🎉 Everything looks good! Ready to implement APIKeyService.\n');
    } else if (tableResult.recordset.length === 4 && entityResult.recordset.length === 0) {
      console.log('\n⚠️  Tables exist but CodeGen has not run. Please run CodeGen now.\n');
    } else {
      console.log('\n❌ Migration incomplete. Check errors above.\n');
    }

    await sql.close();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

verify();
