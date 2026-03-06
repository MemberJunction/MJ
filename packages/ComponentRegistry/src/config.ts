import dotenv from 'dotenv';

dotenv.config({ quiet: true });

import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { LogError } from '@memberjunction/core';

const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });

const databaseSettingsInfoSchema = z.object({
  connectionTimeout: z.number(),
  requestTimeout: z.number(),
  dbReadOnlyUsername: z.string().optional(),
  dbReadOnlyPassword: z.string().optional(),
  metadataCacheRefreshInterval: z.number().optional().default(0),
  connectionPool: z.object({
    max: z.number().optional(),
    min: z.number().optional(),
    idleTimeoutMillis: z.number().optional(),
    acquireTimeoutMillis: z.number().optional()
  }).optional()
});

const componentRegistrySettingsSchema = z.object({
  port: z.number().default(3200),
  enableRegistry: z.boolean().default(false), // Default to disabled
  registryId: z.string().uuid().optional(),
  requireAuth: z.boolean().default(false),
  corsOrigins: z.array(z.string()).default(['*'])
});
 
const configInfoSchema = z.object({
  databaseSettings: databaseSettingsInfoSchema,

  dbHost: z.string().default('localhost'),
  dbDatabase: z.string(),
  dbPort: z.number({ coerce: true }).default(1433),
  dbUsername: z.string(),
  dbPassword: z.string(),
  dbReadOnlyUsername: z.string().optional(),
  dbReadOnlyPassword: z.string().optional(),
  dbTrustServerCertificate: z.coerce
    .boolean()
    .default(false)
    .transform((v) => (v ? 'Y' : 'N')),
  dbInstanceName: z.string().optional(),

  mjCoreSchema: z.string(),
  componentRegistrySettings: componentRegistrySettingsSchema.optional()
});

export type DatabaseSettingsInfo = z.infer<typeof databaseSettingsInfoSchema>;
export type ComponentRegistrySettings = z.infer<typeof componentRegistrySettingsSchema>;
export type ConfigInfo = z.infer<typeof configInfoSchema>;

export const configInfo: ConfigInfo = loadConfig();

export const {
  dbUsername,
  dbPassword,
  dbHost,
  dbDatabase,
  dbPort,
  dbTrustServerCertificate,
  dbInstanceName,
  mjCoreSchema: mj_core_schema,
  componentRegistrySettings,
} = configInfo;

export const dbReadOnlyUsername = configInfo.dbReadOnlyUsername || configInfo.databaseSettings?.dbReadOnlyUsername;
export const dbReadOnlyPassword = configInfo.dbReadOnlyPassword || configInfo.databaseSettings?.dbReadOnlyPassword;

export function loadConfig(): ConfigInfo {
  const configSearchResult = explorer.search(process.cwd());
  if (!configSearchResult) {
    throw new Error('Config file not found.');
  }

  if (configSearchResult.isEmpty) {
    throw new Error(`Config file ${configSearchResult.filepath} is empty or does not exist.`);
  }

  const configParsing = configInfoSchema.safeParse(configSearchResult.config);
  if (!configParsing.success) {
    LogError('Error parsing config file', null, JSON.stringify(configParsing.error.issues, null, 2));
  }
  return <ConfigInfo>configParsing.data;
}
