import { cosmiconfig } from 'cosmiconfig';
import dotenv from 'dotenv';
import path from 'node:path';

// Load environment variables
dotenv.config({ quiet: true });

export interface AICliConfig {
  // Database settings from mj.config.cjs
  dbHost?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dbDatabase?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dbPort?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dbUsername?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dbPassword?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  coreSchema?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  settings?: {
    host?: string;
    port?: number;
    database?: string;
    mjCoreSchema?: string;
  };
  
  // AI CLI specific settings
  aiSettings?: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    defaultTimeout?: number;
    outputFormat?: 'compact' | 'json' | 'table';
    logLevel?: 'info' | 'debug' | 'verbose';
    enableChat?: boolean;
    chatHistoryLimit?: number;
  };
}

export async function LoadAIConfig(): Promise<AICliConfig> {
  const explorer = cosmiconfig('mj');
  const result = await explorer.search();
  
  if (!result) {
    throw new Error(`❌ No mj.config.cjs configuration found

Problem: MJ configuration file is missing
Likely cause: You may not be in a MemberJunction workspace directory

Next steps:
1. Ensure you're running from the MJ repository root
2. Verify mj.config.cjs exists in the current directory
3. Check that the config file exports database connection settings

For help configuring MJ, see: https://docs.memberjunction.org`);
  }

  if (result.filepath) {
    dotenv.config({ path: path.join(path.dirname(result.filepath), '.env'), quiet: true });
  }

  const raw: AICliConfig = result.config ?? {};
  const envPort = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined;
  return {
    ...raw,
    dbHost: raw.dbHost || raw.settings?.host || process.env.DB_HOST || 'localhost',
    dbDatabase: raw.dbDatabase || raw.settings?.database || process.env.DB_DATABASE || '',
    dbPort: raw.dbPort || raw.settings?.port || (Number.isFinite(envPort) ? envPort : 1433),
    dbUsername: raw.dbUsername || process.env.DB_USERNAME || process.env.DB_USER || process.env.CODEGEN_DB_USERNAME || '',
    dbPassword: raw.dbPassword || process.env.DB_PASSWORD || process.env.CODEGEN_DB_PASSWORD || '',
    coreSchema: raw.coreSchema || raw.settings?.mjCoreSchema || process.env.MJ_CORE_SCHEMA || '__mj',
  };
}

/** @deprecated Use {@link LoadAIConfig}. */
export async function loadAIConfig(): Promise<AICliConfig> {
  return LoadAIConfig();
}