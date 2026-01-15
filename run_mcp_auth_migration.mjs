import sql from 'mssql';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
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

async function runMigration() {
  try {
    console.log('🔄 Connecting to database...');
    await sql.connect(config);
    console.log('✅ Connected!\n');

    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'migrations', 'v2', 'V202601151000__v2.5.x_MCP_Authentication.sql');
    console.log(`📄 Reading migration file: ${migrationPath}`);
    let migrationSQL = await fs.readFile(migrationPath, 'utf-8');

    // Replace Flyway placeholder with actual schema name
    const schema = process.env.DB_SCHEMA || '__mj';
    console.log(`🔧 Using schema: ${schema}`);
    migrationSQL = migrationSQL.replace(/\$\{flyway:defaultSchema\}/g, schema);

    // Execute the entire migration as a batch
    // SQL Server allows multiple statements in a single batch
    console.log(`\n🚀 Executing migration...\n`);

    const statements = [migrationSQL]; // Execute as single batch

    console.log(`\n📦 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Show progress
      const preview = statement.substring(0, 80).replace(/\s+/g, ' ');
      process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `);

      try {
        // Check if table already exists (for CREATE TABLE statements)
        if (statement.includes('CREATE TABLE')) {
          const tableMatch = statement.match(/CREATE TABLE \[?(\w+)\]?\.\[?(\w+)\]?/i);
          if (tableMatch) {
            const tableName = tableMatch[2];
            const checkQuery = `
              SELECT COUNT(*) as count
              FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_SCHEMA = '${schema}'
              AND TABLE_NAME = '${tableName}'
            `;
            const checkResult = await sql.query(checkQuery);
            if (checkResult.recordset[0].count > 0) {
              console.log('⏭️  (already exists)');
              skipCount++;
              continue;
            }
          }
        }

        await sql.query(statement);
        console.log('✅');
        successCount++;
      } catch (error) {
        // Check if it's a benign error (already exists)
        if (error.message.includes('already exists') ||
            error.message.includes('already an object')) {
          console.log('⏭️  (already exists)');
          skipCount++;
        } else {
          console.log('❌');
          console.error(`\nError executing statement ${i + 1}:`, error.message);
          console.error('Statement:', statement.substring(0, 200));
          throw error;
        }
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Migration completed successfully!');
    console.log(`   - ${successCount} statements executed`);
    console.log(`   - ${skipCount} statements skipped (already exist)`);
    console.log('='.repeat(70));

    // Verify the tables were created
    console.log('\n🔍 Verifying tables...\n');
    const verifyQuery = `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = '${schema}'
      AND TABLE_NAME IN ('APIScope', 'APIKey', 'APIKeyScope', 'APIKeyUsageLog')
      ORDER BY TABLE_NAME
    `;
    const verifyResult = await sql.query(verifyQuery);

    if (verifyResult.recordset.length === 4) {
      console.log('✅ All 4 tables verified:');
      verifyResult.recordset.forEach(row => {
        console.log(`   ✓ ${schema}.${row.TABLE_NAME}`);
      });
    } else {
      console.log(`⚠️  Expected 4 tables, found ${verifyResult.recordset.length}`);
      verifyResult.recordset.forEach(row => {
        console.log(`   ✓ ${schema}.${row.TABLE_NAME}`);
      });
    }

    // Check seed data
    console.log('\n🌱 Checking seed data...\n');
    const seedQuery = `SELECT COUNT(*) as count FROM [${schema}].APIScope`;
    const seedResult = await sql.query(seedQuery);
    const scopeCount = seedResult.recordset[0].count;
    console.log(`✅ Found ${scopeCount} default scopes`);

    if (scopeCount > 0) {
      const scopesQuery = `SELECT Name, Category FROM [${schema}].APIScope ORDER BY Name`;
      const scopesResult = await sql.query(scopesQuery);
      console.log('\nDefault scopes:');
      scopesResult.recordset.forEach(scope => {
        console.log(`   • ${scope.Name} (${scope.Category})`);
      });
    }

    await sql.close();
    console.log('\n🎉 Migration complete! Ready for CodeGen.\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
