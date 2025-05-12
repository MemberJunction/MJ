import * as dotenv from 'dotenv';

dotenv.config();

import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { LogError } from '@memberjunction/core';

const explorer = cosmiconfigSync('mj');

const databaseSettingsInfoSchema = z.object({
  connectionTimeout: z.number(),
  requestTimeout: z.number(),
  dbReadOnlyUsername: z.string().optional(),
  dbReadOnlyPassword: z.string().optional(),
});

const a2aServerEntityCapabilitySchema = z.object({
  entityName: z.string().optional(),
  schemaName: z.string().optional(),
  get: z.boolean().optional().default(false),
  create: z.boolean().optional().default(false),
  update: z.boolean().optional().default(false),
  delete: z.boolean().optional().default(false),
  runView: z.boolean().optional().default(false),
});

const a2aServerInfoSchema = z.object({
  port: z.coerce.number().optional().default(3200),
  entityCapabilities: z.array(a2aServerEntityCapabilitySchema).optional(),
  enableA2AServer: z.boolean().optional().default(false),
  agentName: z.string().optional().default("MemberJunction"),
  agentDescription: z.string().optional().default("MemberJunction A2A Agent"),
  streamingEnabled: z.boolean().optional().default(true),
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

  // A2A Server settings
  a2aServerSettings: a2aServerInfoSchema.optional(),

  mjCoreSchema: z.string(),
});

export type DatabaseSettingsInfo = z.infer<typeof databaseSettingsInfoSchema>;
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
  a2aServerSettings,
  mjCoreSchema: mj_core_schema,
  dbReadOnlyUsername,
  dbReadOnlyPassword,
} = configInfo;

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
    LogError('Error parsing config file', '', JSON.stringify(configParsing.error.issues, null, 2));
    throw new Error('Error parsing config file');
  }
  return configParsing.data;
}