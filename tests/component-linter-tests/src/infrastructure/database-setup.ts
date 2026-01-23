/**
 * Database setup for linter tests
 * Initializes database connection and loads context user
 */

import { Metadata, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { ComponentMetadataEngine } from '@memberjunction/core-entities';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as sql from 'mssql';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

let isInitialized = false;
let systemUser: UserInfo | null = null;
let connectionPool: sql.ConnectionPool | null = null;

/**
 * Initialize database connection and metadata
 *
 * Note: This initializes ComponentMetadataEngine which is required for
 * dependency validation rules in the linter. The linter needs to resolve
 * component dependencies from the registry to validate props and events.
 */
export async function initializeDatabase(): Promise<void> {
  if (isInitialized) {
    return;
  }

  console.log(`🔄 Initializing database connection --- Host: ${process.env.DB_HOST}; Database: ${process.env.DB_DATABASE}`);

  // Create SQL Server connection pool configuration
  const mssqlConfig: sql.config = {
    server: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || '',
    requestTimeout: 30000,
    connectionTimeout: 30000,
    pool: {
      max: 10,
      min: 2,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 30000,
    },
    options: {
      encrypt: true,
      enableArithAbort: true,
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' ||
                              process.env.DB_TRUST_SERVER_CERTIFICATE === '1',
    },
  };

  // Add instance name if provided
  if (process.env.DB_INSTANCE_NAME) {
    mssqlConfig.options = {
      ...mssqlConfig.options,
      instanceName: process.env.DB_INSTANCE_NAME,
    };
  }

  // Create and connect the pool
  connectionPool = new sql.ConnectionPool(mssqlConfig);
  await connectionPool.connect();
  console.log(`✅ Database connection pool connected`);

  // Create provider configuration
  const mjCoreSchema = process.env.MJ_CORE_SCHEMA || '__mj';
  const config = new SQLServerProviderConfigData(
    connectionPool,
    mjCoreSchema,
    0 // checkRefreshIntervalSeconds - disable auto refresh for tests
  );

  // Initialize SQL Server client - this sets Metadata.Provider
  await setupSQLServerClient(config);

  // Verify metadata is initialized
  const md = new Metadata();
  console.log(`✅ Metadata initialized with ${md?.Entities ? md.Entities.length : 0} entities`);

  isInitialized = true;
}

/**
 * Get the SYSTEM_USER context user for tests
 */
export async function getContextUser(): Promise<UserInfo> {
  if (!isInitialized) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }

  if (systemUser) {
    return systemUser;
  }

  const testEmail = process.env.TEST_USER_EMAIL || 'not.set@nowhere.com';

  // Try to find user in UserCache (already populated during initialization)
  systemUser = UserCache.Instance.Users.find(
    (user: UserInfo) => user.Email.toLowerCase() === testEmail.toLowerCase()
  ) || null;

  if (!systemUser) {
    console.warn(`Failed to load context user ${testEmail}, using an existing user with the Owner role instead`);

    // Fallback: find any user with Owner role
    systemUser = UserCache.Instance.Users.find(
      (user: UserInfo) => user.Type.trim().toLowerCase() === 'owner'
    ) || null;

    if (!systemUser) {
      throw new Error(
        `No existing users found in the database with the Owner role, cannot proceed with tests.\n` +
        `Make sure the database has at least one user with Owner role.`
      );
    }
  }

  console.log(`✅ Context user loaded: ${systemUser.Name} (${systemUser.Email})`);

  return systemUser;
}

/**
 * Initialize ComponentMetadataEngine with context user
 * Must be called AFTER getContextUser()
 */
export async function initializeComponentEngine(contextUser: UserInfo): Promise<void> {
  if (!isInitialized) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }

  try {
    await ComponentMetadataEngine.Instance.Config(false, contextUser, Metadata.Provider);
  } catch (error) {
    console.warn(`⚠️  ComponentMetadataEngine initialization failed:`, error);
    console.warn(`   Dependency validation rules may not work correctly`);
    throw error;
  }
}

/**
 * Clean up database connection
 */
export async function cleanupDatabase(): Promise<void> {
  if (connectionPool && connectionPool.connected) {
    await connectionPool.close();
    console.log(`✅ Database connection pool closed`);
  }

  isInitialized = false;
  systemUser = null;
  connectionPool = null;
}
