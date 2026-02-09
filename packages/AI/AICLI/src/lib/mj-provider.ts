import { SetProvider, Metadata } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import sql from 'mssql';
import { loadAIConfig } from '../config';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

// Import action and agent registrations
import '@memberjunction/core-actions';  // Register core actions
import '@memberjunction/ai-agents';     // Register agent types

// Import LLM providers to register them with ClassFactory
import '@memberjunction/ai-openai';
import '@memberjunction/ai-groq';
import '@memberjunction/ai-anthropic';

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
    const config = await loadAIConfig();
    
    // Validate required configuration
    if (!config.dbDatabase) {
      throw new Error(`❌ Database configuration missing

Problem: Database name not specified in mj.config.cjs
Required: dbDatabase property must be set

Next steps:
1. Check your mj.config.cjs file
2. Ensure dbDatabase is set to your MJ database name
3. Verify other database settings (dbHost, dbUsername, dbPassword)

Example configuration:
  dbDatabase: 'MemberJunction_Dev'`);
    }

    if (!config.dbUsername || !config.dbPassword) {
      throw new Error(`❌ Database credentials missing

Problem: Database username or password not configured
Required: Both dbUsername and dbPassword must be set

Next steps:
1. Check your mj.config.cjs file
2. Set dbUsername and dbPassword properties
3. Verify credentials are correct for your SQL Server

For security, consider using environment variables:
  dbUsername: process.env.DB_USERNAME
  dbPassword: process.env.DB_PASSWORD`);
    }
    
    // Create SQL Server connection
    const sqlConfig: sql.config = {
      server: config.dbHost || 'localhost',
      port: config.dbPort ? (typeof config.dbPort === 'string' ? parseInt(config.dbPort) : config.dbPort) : 1433,
      database: config.dbDatabase!,
      user: config.dbUsername!,
      password: config.dbPassword!,
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
      config.coreSchema || '__mj',
      180000
    );

    await setupSQLServerClient(providerConfig);
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
3. Test connection: telnet ${error.address} ${error.port}
4. Verify host and port in mj.config.cjs`);
    } else if (error?.code === 'ELOGIN') {
      throw new Error(`❌ Database authentication failed

Problem: Invalid username or password
User: ${error.userName}

Next steps:
1. Verify username and password in mj.config.cjs
2. Check user has permission to access the database
3. Ensure SQL Server authentication is enabled
4. Test credentials with SQL Server Management Studio`);
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