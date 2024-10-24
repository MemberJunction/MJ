import env from 'env-var';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

export const nodeEnv = env.get('NODE_ENV').asString();

export const dbHost = env.get('DB_HOST').required().asString();
export const dbPort = env.get('DB_PORT').default('1433').asPortNumber();
export const dbUsername = env.get('DB_USERNAME').required().asString();
export const dbPassword = env.get('DB_PASSWORD').required().asString();
export const dbDatabase = env.get('DB_DATABASE').required().asString();
export const dbInstanceName = env.get('DB_INSTANCE_NAME').asString();
export const dbTrustServerCertificate = env.get('DB_TRUST_SERVER_CERTIFICATE').asBool();

export const graphqlPort = env.get('PORT').default('4000').asPortNumber();

export const ___codeGenAPIURL = env.get('CODEGEN_API_URL').asString();
export const ___codeGenAPIPort = env.get('CODEGEN_API_PORT').default('3999').asPortNumber();
export const ___codeGenAPISubmissionDelay = env.get('CODEGEN_API_SUBMISSION_DELAY').default(5000).asIntPositive();

export const graphqlRootPath = env.get('ROOT_PATH').default('/').asString();

export const webClientID = env.get('WEB_CLIENT_ID').asString();
export const tenantID = env.get('TENANT_ID').asString();

export const enableIntrospection = env.get('ENABLE_INTROSPECTION').default('false').asBool();
export const websiteRunFromPackage = env.get('WEBSITE_RUN_FROM_PACKAGE').asIntPositive();
export const userEmailMap = env.get('USER_EMAIL_MAP').default('{}').asJsonObject() as Record<string, string>;

export const ___skipAPIurl = env.get('ASK_SKIP_API_URL').asString();
export const ___skipAPIOrgId = env.get('ASK_SKIP_ORGANIZATION_ID').asString();

export const auth0Domain = env.get('AUTH0_DOMAIN').asString();
export const auth0WebClientID = env.get('AUTH0_CLIENT_ID').asString();
export const auth0ClientSecret = env.get('AUTH0_CLIENT_SECRET').asString();

export const mj_core_schema = env.get('MJ_CORE_SCHEMA').asString();

export const configFile = env.get('CONFIG_FILE').asString();

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
  entitiesToSendSkip: z.object({
    excludeSchemas: z.array(z.string()).optional(),
    includeEntitiesFromExcludedSchemas: z.array(z.string()).optional(),
  }).optional()
});

const configInfoSchema = z.object({
  userHandling: userHandlingInfoSchema,
  databaseSettings: databaseSettingsInfoSchema,
  viewingSystem: viewingSystemInfoSchema.optional(),
  askSkip: askSkipInfoSchema.optional(),
});

export type UserHandlingInfo = z.infer<typeof userHandlingInfoSchema>;
export type DatabaseSettingsInfo = z.infer<typeof databaseSettingsInfoSchema>;
export type ViewingSystemSettingsInfo = z.infer<typeof viewingSystemInfoSchema>;
export type ConfigInfo = z.infer<typeof configInfoSchema>;

export const configInfo: ConfigInfo = loadConfig();

export function loadConfig() {
  const configPath = configFile ?? path.resolve('config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file ${configPath} does not exist.`);
  }

  const configData = fs.readFileSync(configPath, 'utf-8');
  return configInfoSchema.parse(JSON.parse(configData));
}
