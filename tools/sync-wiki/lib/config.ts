import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Auto-detect repo root (3 levels up from lib/) */
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export interface SyncConfig {
  repoRoot: string;
  vaultPath: string;
  extractors: {
    markdown: boolean;
    entities: boolean;
    packages: boolean;
    graphql: boolean;
    metadata: boolean;
    migrations: boolean;
  };
  incremental: boolean;
  generateBacklinks: boolean;
}

export const DEFAULT_CONFIG: SyncConfig = {
  repoRoot: REPO_ROOT,
  vaultPath: path.join(REPO_ROOT, '..', 'mj-wiki'),
  extractors: {
    markdown: true,
    entities: true,
    packages: true,
    graphql: true,
    metadata: true,
    migrations: true,
  },
  incremental: false,
  generateBacklinks: true,
};

/** Vault subdirectory names */
export const VAULT_DIRS = {
  index: '00-Index',
  guides: '01-Guides',
  packages: '02-Packages',
  entities: '03-Entities',
  architecture: '04-Architecture',
  apiSurface: '05-API-Surface',
  metadata: '06-Metadata',
  packageDocs: '07-Package-Docs',
  timeline: '08-Timeline',
  sync: '_sync',
} as const;

/** Package category classification based on path */
export function classifyPackage(packagePath: string): string {
  const rel = path.relative(path.join(REPO_ROOT, 'packages'), packagePath);
  const parts = rel.split(path.sep);
  const top = parts[0];

  if (top === 'AI' || parts.some(p => p === 'AI')) return '_ai';
  if (top === 'Angular' || top === 'AngularElements' || top === 'MJExplorer') return '_angular';
  if (top === 'Actions') return '_actions';
  if (top === 'Integration') return '_integration';
  if (top === 'React') return '_react';
  if (top === 'Communication' || top === 'Templates' || top === 'Scheduling') return '_communication';
  if (top === 'Credentials' || top === 'APIKeys' || top === 'AuthProviders' || top === 'Encryption') return '_security';
  if (['MJAPI', 'MJServer', 'MJCodeGenAPI', 'ServerBootstrap', 'ServerBootstrapLite', 'ServerExtensionsCore'].includes(top)) return '_server';
  if (['MJCore', 'MJGlobal', 'MJCoreEntities', 'MJCoreEntitiesServer', 'MJDataContext', 'MJDataContextServer', 'Config'].includes(top)) return '_core';
  if (['SQLServerDataProvider', 'PostgreSQLDataProvider', 'GenericDatabaseProvider', 'GraphQLDataProvider', 'RedisProvider'].includes(top)) return '_data';
  return '_other';
}

/** Sanitize a name for use as an Obsidian filename */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
