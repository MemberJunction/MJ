import { cosmiconfig } from 'cosmiconfig';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ quiet: true });

export interface AICliConfig {
  // Database settings. Each one comes from mj.config.cjs when the file sets it, and from its
  // environment variable otherwise — see BuildAIConfigDefaults for the variable names.
  dbHost?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dbDatabase?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dbPort?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dbUsername?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dbPassword?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Trust the SQL Server's TLS certificate without validating it. `true`/`false`, or `'Y'`/`'N'` as MJAPI's config spells it. */
  dbTrustServerCertificate?: boolean | string;  // case-violation-ok-legacy-back-compat: mj.config.cjs key name — the config file, not this type, defines it
  /** Named SQL Server instance, when the server is not reached by host and port alone. */
  dbInstanceName?: string;  // case-violation-ok-legacy-back-compat: mj.config.cjs key name — the config file, not this type, defines it
  coreSchema?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** MJAPI's name for the core schema. Read as an alias of `coreSchema`, which wins when both are set. */
  mjCoreSchema?: string;  // case-violation-ok-legacy-back-compat: mj.config.cjs key name — the config file, not this type, defines it

  // AI CLI specific settings
  aiSettings?: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    defaultTimeout?: number;
    outputFormat?: 'compact' | 'json' | 'table';
    logLevel?: 'info' | 'debug' | 'verbose';
    enableChat?: boolean;
    chatHistoryLimit?: number;
  };
}

/**
 * mj.config.cjs as it may actually be written. It is plain JavaScript, so a setting such as
 * `dbUsername: process.env.DB_USERNAME` arrives as undefined (or null) when its variable is unset,
 * and `dbPort: process.env.DB_PORT` arrives as a string. {@link MergeAIConfig} accepts all of these.
 */
export type AICliFileConfig = Omit<AICliConfig, 'dbHost' | 'dbDatabase' | 'dbPort' | 'dbUsername' | 'dbPassword'> & {
  dbHost?: string | null;  // case-violation-ok-legacy-back-compat: mj.config.cjs key name — the config file, not this type, defines it
  dbDatabase?: string | null;  // case-violation-ok-legacy-back-compat: mj.config.cjs key name — the config file, not this type, defines it
  dbPort?: number | string | null;  // case-violation-ok-legacy-back-compat: mj.config.cjs key name — the config file, not this type, defines it
  dbUsername?: string | null;  // case-violation-ok-legacy-back-compat: mj.config.cjs key name — the config file, not this type, defines it
  dbPassword?: string | null;  // case-violation-ok-legacy-back-compat: mj.config.cjs key name — the config file, not this type, defines it
};

/** The values `ParseBooleanEnv` in @memberjunction/config reads as true. */
const TRUTHY_SETTING_VALUES = ['true', '1', 'yes', 'y', 'on', 't'];

/**
 * Reads a yes/no setting the way MJAPI and the rest of `mj` read one.
 *
 * Strings follow `ParseBooleanEnv` from @memberjunction/config — `true`, `1`, `yes`, `y`, `on` and
 * `t`, in any case, are true and anything else is false — which also covers MJAPI's `'Y'`/`'N'`.
 * It is restated here rather than imported because this package does not depend on
 * @memberjunction/config. Unset is false.
 */
export function ParseBooleanSetting(value: boolean | string | null | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (!value) {
    return false;
  }
  return TRUTHY_SETTING_VALUES.includes(value.trim().toLowerCase());
}

/**
 * Reads a TCP port setting, or `undefined` when it is not set.
 *
 * A config file may hold the port as a number or as a string, and `parseInt` over a bad
 * environment value produces `NaN`, so both shapes are accepted and anything that is not a whole
 * number fails here, naming where the value came from, instead of surfacing later as a driver error.
 *
 * @param source - Where the value was read, for the error message (e.g. `DB_PORT`).
 */
export function ParsePortSetting(value: number | string | null | undefined, source: string): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const port = typeof value === 'number' ? value : /^\s*\d+\s*$/.test(value) ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`❌ Invalid database port

Problem: ${source} is "${value}", which is not a port number

Next steps:
1. Set ${source} to a whole number, such as 1433 (the SQL Server default)
2. Or remove it to use 1433`);
  }
  return port;
}

/** An environment variable's value, treating an empty string (`DB_HOST=` in a .env file) as unset. */
function readEnvSetting(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value === '' ? undefined : value;
}

/**
 * The database settings the environment supplies when mj.config.cjs does not set them.
 *
 * The variables and their defaults are the ones MJAPI (`DEFAULT_SERVER_CONFIG`) and the `mj` CLI
 * use, so a workspace whose `.env` lets MJAPI connect lets this CLI connect too. An installed
 * workspace ships mj.config.cjs with its `db*` lines commented out and the real values in `.env`,
 * which is exactly the case this exists for.
 *
 * | setting                    | variable                      | default     |
 * |----------------------------|-------------------------------|-------------|
 * | `dbHost`                   | `DB_HOST`                     | `localhost` |
 * | `dbPort`                   | `DB_PORT`                     | `1433`      |
 * | `dbDatabase`               | `DB_DATABASE`                 | —           |
 * | `dbUsername`               | `DB_USERNAME`                 | —           |
 * | `dbPassword`               | `DB_PASSWORD`                 | —           |
 * | `dbTrustServerCertificate` | `DB_TRUST_SERVER_CERTIFICATE` | `false`     |
 * | `dbInstanceName`           | `DB_INSTANCE_NAME`            | —           |
 * | `coreSchema`               | `MJ_CORE_SCHEMA`              | `__mj`      |
 *
 * @param env - The environment to read. Defaults to `process.env`.
 */
export function BuildAIConfigDefaults(env: NodeJS.ProcessEnv = process.env): AICliConfig {
  return {
    dbHost: readEnvSetting(env, 'DB_HOST') ?? 'localhost',
    dbPort: ParsePortSetting(readEnvSetting(env, 'DB_PORT'), 'DB_PORT') ?? 1433,
    dbDatabase: readEnvSetting(env, 'DB_DATABASE'),
    dbUsername: readEnvSetting(env, 'DB_USERNAME'),
    dbPassword: readEnvSetting(env, 'DB_PASSWORD'),
    dbTrustServerCertificate: ParseBooleanSetting(readEnvSetting(env, 'DB_TRUST_SERVER_CERTIFICATE')),
    dbInstanceName: readEnvSetting(env, 'DB_INSTANCE_NAME'),
    coreSchema: readEnvSetting(env, 'MJ_CORE_SCHEMA') ?? '__mj',
  };
}

/**
 * Lays the settings from mj.config.cjs over the environment defaults.
 *
 * A value the file sets wins; a value it leaves out — or sets to `null`/`undefined`, which is
 * what `dbPassword: process.env.DB_PASSWORD` yields when the variable is unset — falls back to the
 * default. That is the rule `MergeConfigs` in @memberjunction/config applies for MJAPI and the
 * `mj` CLI. Every other key in the file is passed through unchanged.
 *
 * @param defaults - Usually {@link BuildAIConfigDefaults}.
 * @param fileConfig - The object mj.config.cjs exports, or nothing when there is no file.
 */
export function MergeAIConfig(defaults: AICliConfig, fileConfig?: AICliFileConfig | null): AICliConfig {
  const file: AICliFileConfig = fileConfig ?? {};
  return {
    ...file,
    dbHost: file.dbHost ?? defaults.dbHost,
    dbPort: ParsePortSetting(file.dbPort, 'dbPort in mj.config.cjs') ?? defaults.dbPort,
    dbDatabase: file.dbDatabase ?? defaults.dbDatabase,
    dbUsername: file.dbUsername ?? defaults.dbUsername,
    dbPassword: file.dbPassword ?? defaults.dbPassword,
    dbTrustServerCertificate: ParseBooleanSetting(file.dbTrustServerCertificate ?? defaults.dbTrustServerCertificate),
    dbInstanceName: file.dbInstanceName ?? defaults.dbInstanceName,
    coreSchema: file.coreSchema ?? file.mjCoreSchema ?? defaults.coreSchema,
  };
}

/**
 * Loads this CLI's configuration: mj.config.cjs from the current directory, laid over the
 * database settings the environment (and the `.env` file loaded above) supplies.
 *
 * A missing config file is not an error by itself. The settings can all come from the
 * environment, as they do for MJAPI; when a required one is missing from both places,
 * `InitializeMJProvider` says which one and where to set it.
 */
export async function LoadAIConfig(): Promise<AICliConfig> {
  const explorer = cosmiconfig('mj');
  const result = await explorer.search();
  const fileConfig: AICliFileConfig | undefined = result?.config;
  return MergeAIConfig(BuildAIConfigDefaults(process.env), fileConfig);
}

/** @deprecated Use {@link LoadAIConfig}. */
export async function loadAIConfig(): Promise<AICliConfig> {
  return LoadAIConfig();
}
