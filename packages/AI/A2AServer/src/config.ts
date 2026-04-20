import dotenv from 'dotenv';

dotenv.config({ quiet: true });

import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { LogError, LogStatus } from '@memberjunction/core';
import { mergeConfigs } from '@memberjunction/config';
import { DEFAULT_SERVER_CONFIG } from '@memberjunction/server';

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

const a2aServerAgentCapabilitySchema = z.object({
  agentName: z.string().optional(),
  discover: z.boolean().optional().default(false),
  execute: z.boolean().optional().default(false),
  monitor: z.boolean().optional().default(false),
  cancel: z.boolean().optional().default(false),
});

const a2aServerInfoSchema = z.object({
  port: z.coerce.number().optional().default(3200),
  entityCapabilities: z.array(a2aServerEntityCapabilitySchema).optional(),
  agentCapabilities: z.array(a2aServerAgentCapabilitySchema).optional(),
  enableA2AServer: z.boolean().optional().default(false),
  agentName: z.string().optional().default("MemberJunction"),
  agentDescription: z.string().optional().default("MemberJunction A2A Agent"),
  streamingEnabled: z.boolean().optional().default(true),
  userEmail: z.string().optional().describe("Email address of the user to use for entity operations"),
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

  // Start with DEFAULT_SERVER_CONFIG as base
  let mergedConfig = DEFAULT_SERVER_CONFIG;

  // If user config exists, merge it with defaults
  if (configSearchResult && !configSearchResult.isEmpty) {
    LogStatus(`A2A Server: Config file found at ${configSearchResult.filepath}`);

    // Merge user config with defaults (user config takes precedence)
    mergedConfig = mergeConfigs(DEFAULT_SERVER_CONFIG, configSearchResult.config);
  } else {
    LogStatus(`A2A Server: No config file found, using DEFAULT_SERVER_CONFIG`);
  }

  // Validate the merged configuration
  const configParsing = configInfoSchema.safeParse(mergedConfig);
  if (!configParsing.success) {
    LogError('Error parsing config file', '', JSON.stringify(configParsing.error.issues, null, 2));
    throw new Error('Configuration validation failed');
  }
  return configParsing.data;
}