import { cosmiconfigSync } from 'cosmiconfig';
import { FlywayConfig } from 'node-flyway/dist/types/types';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { simpleGit, SimpleGit } from 'simple-git';
import { z } from 'zod';
import { mergeConfigs } from '@memberjunction/config';

export type MJConfig = z.infer<typeof mjConfigSchema>;

const MJ_REPO_URL = 'https://github.com/MemberJunction/MJ.git';

/**
 * Default database configuration for MJCLI.
 * Database settings come from environment variables with sensible defaults.
 */
const DEFAULT_CLI_CONFIG = {
  dbHost: process.env.DB_HOST ?? 'localhost',
  dbPort: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 1433,
  dbDatabase: process.env.DB_DATABASE ?? '',
  dbTrustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  codeGenLogin: process.env.CODEGEN_DB_USERNAME ?? '',
  codeGenPassword: process.env.CODEGEN_DB_PASSWORD ?? '',
  coreSchema: '__mj',
  cleanDisabled: true,
  baselineVersion: '202601122300',
  baselineOnMigrate: true,
  mjRepoUrl: MJ_REPO_URL,
  migrationsLocation: 'filesystem:./migrations',
};

const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });
const searchResult = explorer.search(process.cwd());

// Merge user config with DEFAULT_CLI_CONFIG to support minimal config
// This allows database fields to come from environment variables
const mergedConfig: any = searchResult?.config
  ? mergeConfigs(DEFAULT_CLI_CONFIG, searchResult.config)
  : DEFAULT_CLI_CONFIG;

// Create a result object with merged config for backward compatibility
const result = searchResult
  ? { ...searchResult, config: mergedConfig }
  : { config: mergedConfig, filepath: '', isEmpty: false };

// Schema for database-dependent config (required fields)
const mjConfigSchema = z.object({
  dbHost: z.string().default('localhost'),
  dbDatabase: z.string(),
  dbPort: z.number({ coerce: true }).default(1433),
  codeGenLogin: z.string(),
  codeGenPassword: z.string(),
  migrationsLocation: z.string().optional().default('filesystem:./migrations'),
  dbTrustServerCertificate: z.coerce.boolean().default(false),
  coreSchema: z.string().optional().default('__mj'),
  cleanDisabled: z.boolean().optional().default(true),
  mjRepoUrl: z.string().url().catch(MJ_REPO_URL),
  baselineVersion: z.string().optional().default('202601122300'),
  baselineOnMigrate: z.boolean().optional().default(true),
});

// Schema for non-database commands (all fields optional)
const mjConfigSchemaOptional = z.object({
  dbHost: z.string().optional(),
  dbDatabase: z.string().optional(),
  dbPort: z.number({ coerce: true }).optional(),
  codeGenLogin: z.string().optional(),
  codeGenPassword: z.string().optional(),
  migrationsLocation: z.string().optional().default('filesystem:./migrations'),
  dbTrustServerCertificate: z.coerce.boolean().default(false),
  coreSchema: z.string().optional().default('__mj'),
  cleanDisabled: z.boolean().optional().default(true),
  mjRepoUrl: z.string().url().catch(MJ_REPO_URL),
  baselineVersion: z.string().optional().default('202601122300'),
  baselineOnMigrate: z.boolean().optional().default(true),
});

// Don't validate at module load - let commands decide when they need validated config
export const config = result?.config as MJConfig | undefined;

/**
 * Get validated config for commands that require database connection.
 * Throws error if config is invalid.
 */
export const getValidatedConfig = (): MJConfig => {
  const parsedConfig = mjConfigSchema.safeParse(result?.config);
  if (!parsedConfig.success) {
    throw new Error(
      `Invalid or missing mj.config.cjs file. Database commands require valid configuration.\n` +
      `Missing fields: ${parsedConfig.error.issues.map(i => i.path.join('.')).join(', ')}`
    );
  }
  return parsedConfig.data;
};

/**
 * Get optional config for commands that don't require database connection.
 * Returns undefined if no config exists, or partial config if it exists.
 */
export const getOptionalConfig = (): Partial<MJConfig> | undefined => {
  const parsedConfig = mjConfigSchemaOptional.safeParse(result?.config);
  return parsedConfig.success ? parsedConfig.data : undefined;
};

/**
 * Legacy function for backward compatibility with codegen.
 * Validates and returns updated config.
 * Returns undefined silently if config is invalid (command will handle the error).
 */
export const updatedConfig = (): MJConfig | undefined => {
  const freshSearchResult = explorer.search(process.cwd());
  // Merge fresh config with DEFAULT_CLI_CONFIG
  const freshMergedConfig: any = freshSearchResult?.config
    ? mergeConfigs(DEFAULT_CLI_CONFIG, freshSearchResult.config)
    : DEFAULT_CLI_CONFIG;

  const maybeConfig = mjConfigSchema.safeParse(freshMergedConfig);
  // Don't log errors here - let the calling command handle validation
  return maybeConfig.success ? maybeConfig.data : undefined;
};

export const createFlywayUrl = (mjConfig: MJConfig) => {
  return `jdbc:sqlserver://${mjConfig.dbHost}:${mjConfig.dbPort}; databaseName=${mjConfig.dbDatabase}${
    mjConfig.dbTrustServerCertificate ? '; trustServerCertificate=true' : ''
  }`;
};

export const getFlywayConfig = async (mjConfig: MJConfig, tag?: string): Promise<FlywayConfig> => {
  let location = mjConfig.migrationsLocation;

  if (tag) {
    // when tag is set, we want to fetch migrations from the github repo using the tag specified
    // we save those to a tmp dir and set that tmp dir as the migration location
    const tmp = mkdtempSync(tmpdir());
    const branch = /v?\d+\.\d+\.\d+/.test(tag) ? (tag.startsWith('v') ? tag : `v${tag}`) : tag;
    const git: SimpleGit = simpleGit(tmp);
    await git.clone(mjConfig.mjRepoUrl, tmp, ['--sparse', '--depth=1', '--branch', branch]);
    await git.raw(['sparse-checkout', 'set', 'migrations']);

    location = `filesystem:${tmp}`;
  }

  return {
    url: createFlywayUrl(mjConfig),
    user: mjConfig.codeGenLogin,
    password: mjConfig.codeGenPassword,
    migrationLocations: [location],
    advanced: {
      schemas: [mjConfig.coreSchema],
      cleanDisabled: mjConfig.cleanDisabled === false ? false : undefined,
      baselineVersion: mjConfig.baselineVersion,
      baselineOnMigrate: mjConfig.baselineOnMigrate,
    },
  };
};
