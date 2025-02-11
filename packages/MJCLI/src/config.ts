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
});

const parsedConfig = mjConfigSchema.safeParse(result?.config);
if (!parsedConfig.success) {
  console.error('Error parsing config file', JSON.stringify(parsedConfig.error.issues, null, 2));
}
export const config = parsedConfig.success ? parsedConfig.data : undefined;

export const updatedConfig = () => {
  const maybeConfig = mjConfigSchema.safeParse(explorer.search(process.cwd())?.config);
  if (!maybeConfig.success) {
    console.error('Error parsing config file', JSON.stringify(maybeConfig.error.issues, null, 2));
  }
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
    advanced: { schemas: [mjConfig.coreSchema], cleanDisabled: mjConfig.cleanDisabled === false ? false : undefined },
  };
};
