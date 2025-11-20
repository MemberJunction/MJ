import dotenv from 'dotenv';

dotenv.config();

import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { LogError } from '@memberjunction/core';

const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });

const databaseSettingsInfoSchema = z.object({
  connectionTimeout: z.number(),
  requestTimeout: z.number(),
  dbReadOnlyUsername: z.string().optional(),
  dbReadOnlyPassword: z.string().optional(),
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
    LogError('Error parsing config file', null, JSON.stringify(configParsing.error.issues, null, 2));
  }
  return <ConfigInfo>configParsing.data;
}
