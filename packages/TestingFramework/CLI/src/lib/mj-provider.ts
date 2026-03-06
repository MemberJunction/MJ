import { SetProvider, Metadata } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { loadMJConfig } from '../utils/config-loader';

// Load environment variables from .env file
// Note: config-loader.ts also loads dotenv with override:true, but we include it here
// for completeness in case mj-provider is used standalone
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true, quiet: true });

let isInitialized = false;
let connectionPool: sql.ConnectionPool | null = null;

export async function initializeMJProvider(): Promise<void> {
  if (isInitialized) {
    return;
  }

  // Check if MJ provider is already initialized
  if (Metadata.Provider) {
    console.log('MJ Provider already initialized');
    isInitialized = true;
    return;
  }

  try {
    const config = await loadMJConfig();

    // Debug: Check what's in process.env and config
    console.log(`process.env.DB_DATABASE: ${process.env.DB_DATABASE}`);
    console.log(`config.dbDatabase: ${config.dbDatabase}`);

    // Get database config from either legacy or new format
    const dbName = config.database?.name || config.dbDatabase;
    const dbHost = config.database?.host || config.dbHost;
    const dbPort = config.database?.port || config.dbPort;
    const dbUsername = config.database?.username || config.dbUsername;
    const dbPassword = config.database?.password || config.dbPassword;
    const dbSchema = config.database?.schema || config.coreSchema;

    // Validate required configuration
    if (!dbName) {
      throw new Error(`❌ Database configuration missing

Problem: Database name not specified in configuration
Required: Database name must be set in mj.config.cjs

Next steps:
1. Check your mj.config.cjs file
2. Set dbDatabase property to your MJ database name
3. Verify other database settings (dbHost, dbUsername, dbPassword)

Example configuration:
  module.exports = {
    dbDatabase: 'MemberJunction_Dev',
    dbHost: 'localhost',
    dbUsername: process.env.DB_USERNAME,
    dbPassword: process.env.DB_PASSWORD
  }`);
    }

    if (!dbUsername || !dbPassword) {
      throw new Error(`❌ Database credentials missing

Problem: Database username or password not configured
Required: Both dbUsername and dbPassword must be set

Next steps:
1. Check your mj.config.cjs file
2. Set dbUsername and dbPassword properties
3. Verify credentials are correct for your SQL Server

For security, use environment variables:
  module.exports = {
    dbUsername: process.env.DB_USERNAME,
    dbPassword: process.env.DB_PASSWORD
  }`);
    }

    // Create SQL Server connection
    console.log(`Connecting to database: ${dbName} on ${dbHost || 'localhost'}`);
    const sqlConfig: sql.config = {
      server: dbHost || 'localhost',
      port: typeof dbPort === 'string' ? parseInt(dbPort) : (dbPort || 1433),
      database: dbName,
      user: dbUsername,
      password: dbPassword,
      options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
      pool: {
        max: 10,
        min: 2,
        idleTimeoutMillis: 30000,
      },
    };

    connectionPool = new sql.ConnectionPool(sqlConfig);
    await connectionPool.connect();

    const providerConfig = new SQLServerProviderConfigData(
      connectionPool,
      dbSchema || '__mj',
      180000
    );

    await setupSQLServerClient(providerConfig);

    // Debug: Log entity counts
    const md = new Metadata();
    console.log(`Total entities loaded: ${md.Entities.length}`);
    const testEntities = md.Entities.filter(e => e.Name.toLowerCase().includes('test'));
    console.log(`Test-related entities found: ${testEntities.length}`);
    testEntities.forEach(e => console.log(`  - ${e.Name}`));

    // Show first 10 entities as sample
    console.log(`First 10 entities loaded:`);
    md.Entities.slice(0, 10).forEach(e => console.log(`  - ${e.Name}`));

    isInitialized = true;

  } catch (error: any) {
    if (error?.message?.startsWith('❌')) {
      // Already formatted error, re-throw as is
      throw error;
    } else if (error?.code === 'ECONNREFUSED') {
      throw new Error(`❌ Failed to connect to database server

Problem: Connection refused to ${error.address}:${error.port}
Likely cause: Database server not running or incorrect host/port

Next steps:
1. Verify SQL Server is running on the specified host/port
2. Check firewall settings allow connections
3. Verify host and port in mj.config.cjs`);
    } else if (error?.code === 'ELOGIN') {
      throw new Error(`❌ Database authentication failed

Problem: Invalid username or password
User: ${error.userName}

Next steps:
1. Verify username and password in mj.config.cjs
2. Check user has permission to access the database
3. Ensure SQL Server authentication is enabled`);
    } else {
      throw new Error(`❌ Failed to initialize MJ data provider

Problem: ${error?.message || 'Unknown error'}
Context: Setting up SQL Server connection and MJ infrastructure

Next steps:
1. Check your mj.config.cjs database settings
2. Verify SQL Server is accessible
3. Ensure MJ core packages are built: npm run build

For debugging, run with --verbose flag for detailed error information.`);
    }
  }
}

export function getConnectionPool(): sql.ConnectionPool {
  if (!connectionPool) {
    throw new Error(`❌ MJ Provider not initialized

Problem: Database connection not established
Likely cause: initializeMJProvider() was not called

This is an internal error. Please report this issue.`);
  }
  return connectionPool;
}

export async function closeMJProvider(): Promise<void> {
  if (connectionPool) {
    await connectionPool.close();
    connectionPool = null;
    isInitialized = false;
  }
}

/**
 * Get a context user for CLI operations
 * Tries to get the "System" user first, falls back to first available user
 */
export async function getContextUser(): Promise<import('@memberjunction/core').UserInfo> {
  // Try to get the System user like other CLIs do
  let user = UserCache.Instance.UserByName("System", false);

  if (!user) {
    // Fallback to first available user if System user doesn't exist
    if (!UserCache.Instance.Users || UserCache.Instance.Users.length === 0) {
      throw new Error(`❌ No users found in UserCache

Problem: UserCache is empty or not properly initialized
Likely cause: Database connection or UserCache refresh issue

Next steps:
1. Verify database connection is working
2. Check that Users table has data
3. Ensure UserCache.Refresh() was called during initialization

This is typically a configuration or database setup issue.`);
    }

    user = UserCache.Instance.Users[0];
  }

  if (!user) {
    throw new Error('No valid user found for execution context');
  }

  return user;
}
