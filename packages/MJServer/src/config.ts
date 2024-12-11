import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';

const explorer = cosmiconfigSync('mj');

const userHandlingInfoSchema = z.object({
  autoCreateNewUsers: z.boolean().optional().default(false),
  newUserLimitedToAuthorizedDomains: z.boolean().optional().default(false),
  newUserAuthorizedDomains: z.array(z.string()).optional().default([]),
  newUserRoles: z.array(z.string()).optional().default([]),
  updateCacheWhenNotFound: z.boolean().optional().default(false),
  updateCacheWhenNotFoundDelay: z.number().optional().default(30000),
  contextUserForNewUserCreation: z.string().optional().default(''),
});

const databaseSettingsInfoSchema = z.object({
  connectionTimeout: z.number(),
  requestTimeout: z.number(),
  metadataCacheRefreshInterval: z.number(),
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

  dbHost: z.string().default('localhost'),
  dbDatabase: z.string(),
  dbPort: z.number({ coerce: true }).default(1433),
  dbUsername: z.string(),
  dbPassword: z.string(),
  dbTrustServerCertificate: z.enum(['Y', 'N']).default('Y'),
  dbInstanceName: z.string().optional(),
  graphqlPort: z.coerce.number().default(4000),

  ___codeGenAPIURL: z.string(),
  ___codeGenAPIPort: z.coerce.number().optional().default(3999),
  ___codeGenAPISubmissionDelay: z.coerce.number().optional().default(5000),
  graphqlRootPath: z.string().optional().default('/'),
  webClientID: z.string(),
  tenantID: z.string(),
  enableIntrospection: z.boolean().optional().default(false),
  websiteRunFromPackage: z.coerce.number().optional(),
  userEmailMap: z
    .string()
    .transform((val) => z.record(z.string()).parse(JSON.parse(val)))
    .optional(),
  ___skipAPIurl: z.string(),
  ___skipAPIOrgId: z.string(),
  auth0Domain: z.string(),
  auth0WebClientID: z.string(),
  auth0ClientSecret: z.string(),
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
  mjCoreSchema: mj_core_schema,
} = configInfo;

export function loadConfig() {
  const configSearchResult = explorer.search(process.cwd());

  if (configSearchResult.isEmpty) {
    throw new Error(`Config file ${configSearchResult.filepath} is empty or does not exist.`);
  }

  return configInfoSchema.parse(JSON.parse(configSearchResult.config));
}
