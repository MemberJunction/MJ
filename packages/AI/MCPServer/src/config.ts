import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { LogError } from '@memberjunction/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });

const databaseSettingsInfoSchema = z.object({
  connectionTimeout: z.number(),
  requestTimeout: z.number(),
  dbReadOnlyUsername: z.string().optional(),
  dbReadOnlyPassword: z.string().optional(),
});

const mcpServerEntityToolInfoSchema = z.object({
  entityName: z.string().optional(),
  schemaName: z.string().optional(),
  get: z.boolean().optional().default(false),
  create: z.boolean().optional().default(false),
  update: z.boolean().optional().default(false),
  delete: z.boolean().optional().default(false),
  runView: z.boolean().optional().default(false),
});

const mcpServerActionToolInfoSchema = z.object({
  actionName: z.string().optional(),
  actionCategory: z.string().optional(),
});

const mcpServerAgentToolInfoSchema = z.object({
  agentName: z.string().optional(),
  discover: z.boolean().optional().default(false),
  execute: z.boolean().optional().default(false),
  status: z.boolean().optional().default(false),
  cancel: z.boolean().optional().default(false),
});

const mcpServerInfoSchema = z.object({
  port: z.coerce.number().optional().default(3100),
  transport: z.enum(['stdio', 'sse']).optional().default('sse'),
  entityTools: z.array(mcpServerEntityToolInfoSchema).optional(),
  actionTools: z.array(mcpServerActionToolInfoSchema).optional(),
  agentTools: z.array(mcpServerAgentToolInfoSchema).optional(),
  enableMCPServer: z.boolean().optional().default(false),
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

  // MCP Server settings
  mcpServerSettings: mcpServerInfoSchema.optional(),

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
  mcpServerSettings,
  mjCoreSchema: mj_core_schema,
  dbReadOnlyUsername,
  dbReadOnlyPassword,
} = configInfo;

export function loadConfig(): ConfigInfo {
  const cwd = process.cwd();
  // Navigate from dist/config.js up to project root: packages/AI/MCPServer/dist -> project root
  const projectRoot = join(__dirname, '..', '..', '..', '..');

  console.error(`[MCP Config] Current working directory: ${cwd}`);
  console.error(`[MCP Config] Script directory: ${__dirname}`);
  console.error(`[MCP Config] Project root: ${projectRoot}`);
  console.error(`[MCP Config] Searching for mj.config.* files...`);

  // Try project root first (more reliable), then fall back to cwd
  let configSearchResult = explorer.search(projectRoot);
  if (!configSearchResult) {
    console.error(`[MCP Config] Config not found in project root, trying cwd...`);
    configSearchResult = explorer.search(cwd);
  }

  if (!configSearchResult) {
    console.error(`[MCP Config] Config file not found in: ${projectRoot} or ${cwd}`);
    console.error(`[MCP Config] Expected file: mj.config.cjs or similar`);
    throw new Error('Config file not found.');
  }

  console.error(`[MCP Config] Found config at: ${configSearchResult.filepath}`);

  if (configSearchResult.isEmpty) {
    throw new Error(`Config file ${configSearchResult.filepath} is empty or does not exist.`);
  }

  const configParsing = configInfoSchema.safeParse(configSearchResult.config);
  if (!configParsing.success) {
    LogError('Error parsing config file', null, JSON.stringify(configParsing.error.issues, null, 2));
  }
  return <ConfigInfo>configParsing.data;
}
