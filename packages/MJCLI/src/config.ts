import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { FlywayConfig } from 'node-flyway/dist/types/types';

export type MJConfig = z.infer<typeof mjConfigSchema>;

const explorer = cosmiconfigSync('mj');
const result = explorer.search(process.cwd());

const mjConfigSchema = z.object({
  dbHost: z.string().default('localhost'),
  dbDatabase: z.string(),
  dbPort: z.number({ coerce: true }).default(1433),
  codeGenLogin: z.string(),
  codeGenPassword: z.string(),
  migrationsLocation: z.string().optional().default('filesystem:./migrations'),
  dbTrustServerCertificate: z.enum(['Y', 'N']).default('Y'),
  coreSchema: z.string().optional().default('__mj'),
  cleanDisabled: z.boolean().optional().default(true),
});

const parsedConfig = mjConfigSchema.safeParse(result?.config);
export const config = parsedConfig.success ? parsedConfig.data : undefined;

export const createFlywayUrl = (mjConfig: MJConfig) => {
  return `jdbc:sqlserver://${mjConfig.dbHost}:${mjConfig.dbPort}; databaseName=${mjConfig.dbDatabase}${
    mjConfig.dbTrustServerCertificate === 'Y' ? '; trustServerCertificate=true' : ''
  }`;
};

export const getFlywayConfig = (mjConfig: MJConfig): FlywayConfig => ({
  url: createFlywayUrl(mjConfig),
  user: mjConfig.codeGenLogin,
  password: mjConfig.codeGenPassword,
  migrationLocations: [mjConfig.migrationsLocation],
  advanced: { schemas: [mjConfig.coreSchema], cleanDisabled: mjConfig.cleanDisabled === false ? false : undefined },
});
