import { cosmiconfigSync } from 'cosmiconfig';
import { FlywayConfig } from 'node-flyway/dist/types/types';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { simpleGit, SimpleGit } from 'simple-git';
import { z } from 'zod';

export type MJConfig = z.infer<typeof mjConfigSchema>;

const MJ_REPO_URL = 'https://github.com/MemberJunction/MJ.git';

const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });
const result = explorer.search(process.cwd());

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
  baselineVersion: z.string().optional().default('202601101600'),
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
  baselineVersion: z.string().optional().default('202601071900'),
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
  const maybeConfig = mjConfigSchema.safeParse(explorer.search(process.cwd())?.config);
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
