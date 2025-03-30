import dotenv from 'dotenv';

dotenv.config();

import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { LogError } from '@memberjunction/core';

const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });

const userHandlingInfoSchema = z.object({
  autoCreateNewUsers: z.boolean().optional().default(false),
  newUserLimitedToAuthorizedDomains: z.boolean().optional().default(false),
  newUserAuthorizedDomains: z.array(z.string()).optional().default([]),
  newUserRoles: z.array(z.string()).optional().default([]),
  updateCacheWhenNotFound: z.boolean().optional().default(false),
  updateCacheWhenNotFoundDelay: z.number().optional().default(30000),
  contextUserForNewUserCreation: z.string().optional().default(''),
  CreateUserApplicationRecords: z.boolean().optional().default(false),
  UserApplications: z.array(z.string()).optional().default([]),
});

const databaseSettingsInfoSchema = z.object({
  connectionTimeout: z.number(),
  requestTimeout: z.number(),
  metadataCacheRefreshInterval: z.number(),
  dbReadOnlyUsername: z.string().optional(),
  dbReadOnlyPassword: z.string().optional(),
});

const viewingSystemInfoSchema = z.object({
  enableSmartFilters: z.boolean().optional(),
});

const askSkipInfoSchema = z.object({
  organizationInfo: z.string().optional(),
  entitiesToSendSkip: z
    .object({
      excludeSchemas: z.array(z.string()).optional(),
      includeEntitiesFromExcludedSchemas: z.array(z.string()).optional(),
    })
    .optional(),
});

const configInfoSchema = z.object({
  userHandling: userHandlingInfoSchema,
  databaseSettings: databaseSettingsInfoSchema,
  viewingSystem: viewingSystemInfoSchema.optional(),
  askSkip: askSkipInfoSchema.optional(),

  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),

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
  graphqlPort: z.coerce.number().default(4000),
  
  // MCP Server settings
  mcpServerPort: z.coerce.number().optional().default(3100),

  ___codeGenAPIURL: z.string().optional(),
  ___codeGenAPIPort: z.coerce.number().optional().default(3999),
  ___codeGenAPISubmissionDelay: z.coerce.number().optional().default(5000),
  graphqlRootPath: z.string().optional().default('/'),
  webClientID: z.string().optional(),
  tenantID: z.string().optional(),
  enableIntrospection: z.coerce.boolean().optional().default(false),
  websiteRunFromPackage: z.coerce.number().optional(),
  userEmailMap: z
    .string()
    .transform((val) => z.record(z.string()).parse(JSON.parse(val)))
    .optional(),
  ___skipAPIurl: z.string().optional(),
  ___skipAPIOrgId: z.string().optional(),
  auth0Domain: z.string().optional(),
  auth0WebClientID: z.string().optional(),
  auth0ClientSecret: z.string().optional(),
  mjCoreSchema: z.string(),
});

export type UserHandlingInfo = z.infer<typeof userHandlingInfoSchema>;
export type DatabaseSettingsInfo = z.infer<typeof databaseSettingsInfoSchema>;
export type ViewingSystemSettingsInfo = z.infer<typeof viewingSystemInfoSchema>;
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
  graphqlPort,
  mcpServerPort,
  ___codeGenAPIURL,
  ___codeGenAPIPort,
  ___codeGenAPISubmissionDelay,
  graphqlRootPath,
  webClientID,
  tenantID,
  enableIntrospection,
  websiteRunFromPackage,
  userEmailMap,
  ___skipAPIurl,
  ___skipAPIOrgId,
  auth0Domain,
  auth0WebClientID,
  auth0ClientSecret,
  apiKey,
  baseUrl,
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
