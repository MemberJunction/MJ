import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import * as sql from 'mssql';
import * as path from 'path';
import * as fs from 'fs';

const explorer = cosmiconfigSync('mj');

// We'll use a subset of the MJServer config schema that we need for the extension
const databaseSettingsInfoSchema = z.object({
  connectionTimeout: z.number().optional().default(30000),
  requestTimeout: z.number().optional().default(120000),
  connectionPool: z.object({
    max: z.number().optional().default(10), // Lower default for extension
    min: z.number().optional().default(0),
    idleTimeoutMillis: z.number().optional().default(30000),
    acquireTimeoutMillis: z.number().optional().default(30000),
  }).optional().default({}),
});

const configInfoSchema = z.object({
  databaseSettings: databaseSettingsInfoSchema.optional().default({}),
  dbHost: z.string().default(() => process.env.DB_HOST || 'localhost'),
  dbDatabase: z.string().default(() => process.env.DB_DATABASE || ''),
  dbPort: z.number({ coerce: true }).default(() => parseInt(process.env.DB_PORT || '1433')),
  dbUsername: z.string().default(() => process.env.DB_USERNAME || ''),
  dbPassword: z.string().default(() => process.env.DB_PASSWORD || ''),
  dbTrustServerCertificate: z.coerce
    .boolean()
    .default(() => process.env.DB_TRUST_SERVER_CERTIFICATE === 'true')
    .transform((v) => (v ? 'Y' : 'N')),
  dbInstanceName: z.string().optional(),
  mjCoreSchema: z.string().default(() => process.env.MJ_CORE_SCHEMA || '__mj'),
});

export type ConfigInfo = z.infer<typeof configInfoSchema>;

export function loadConfig(workspaceRoot: string): ConfigInfo {
  // First, load .env file if it exists in the workspace root
  const envPath = path.join(workspaceRoot, '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }

  // Search for config file
  const configSearchResult = explorer.search(workspaceRoot);

  // If we have a config file, use it; otherwise use empty object
  // The schema defaults will pull from environment variables automatically
  const configData = configSearchResult && !configSearchResult.isEmpty 
    ? configSearchResult.config 
    : {};

  // Add dbInstanceName from env if not in config
  if (!configData.dbInstanceName && process.env.DB_INSTANCE_NAME) {
    configData.dbInstanceName = process.env.DB_INSTANCE_NAME;
  }

  // Parse the config - Zod will use environment variables as defaults for missing values
  const configParsing = configInfoSchema.safeParse(configData);
  if (!configParsing.success) {
    throw new Error(`Error parsing configuration: ${JSON.stringify(configParsing.error.issues, null, 2)}`);
  }
  
  return configParsing.data;
}

export function createMSSQLConfig(config: ConfigInfo): sql.config {
  const mssqlConfig: sql.config = {
    server: config.dbHost,
    port: config.dbPort,
    user: config.dbUsername,
    password: config.dbPassword,
    database: config.dbDatabase,
    requestTimeout: config.databaseSettings.requestTimeout,
    connectionTimeout: config.databaseSettings.connectionTimeout,
    pool: {
      max: config.databaseSettings.connectionPool?.max ?? 10,
      min: config.databaseSettings.connectionPool?.min ?? 0,
      idleTimeoutMillis: config.databaseSettings.connectionPool?.idleTimeoutMillis ?? 30000,
      acquireTimeoutMillis: config.databaseSettings.connectionPool?.acquireTimeoutMillis ?? 30000,
    },
    options: {
      encrypt: true,
      enableArithAbort: true,
    },
  };
  
  if (config.dbInstanceName?.trim()) {
    mssqlConfig.options = {
      ...mssqlConfig.options,
      instanceName: config.dbInstanceName,
    };
  }
  
  if (config.dbTrustServerCertificate) {
    mssqlConfig.options = {
      ...mssqlConfig.options,
      trustServerCertificate: config.dbTrustServerCertificate === 'Y',
    };
  }

  return mssqlConfig;
}