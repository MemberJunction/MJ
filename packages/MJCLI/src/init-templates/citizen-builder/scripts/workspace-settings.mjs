#!/usr/bin/env node
// ==============================================================================
// Citizen Agent Builder - workspace settings
//
// The workspace's .env (on your machine) is the one place settings live. This
// script carries them into the files MemberJunction reads inside the container:
//
//   check                 Validate settings. Prints problems; exits 1 if one blocks setup.
//   install-config <file> Write the `mj install --config` file.
//   shell-env             Print `export` lines for the entrypoint (keys the CLI needs).
//   sync                  Copy keys, ports and sign-in settings into the installed workspace,
//                         and give people who sign in the Developer role.
//                         Prints {"api":bool,"explorer":bool}: which services need a restart.
//
// Why .env is read from the mounted workspace instead of the container's
// environment: Docker captures environment variables when the container is
// created, so a key added to .env afterwards is invisible until the container
// is recreated. Reading the file means a restart is enough.
// ==============================================================================
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOST_ENV_FILE = process.env.MJ_HOST_ENV_FILE || '/work/.env';
const WORKSPACE = process.env.MJ_WORKSPACE_DIR || '/workspace';
const STATE_DIR = join(WORKSPACE, '.citizen-builder');
const GENERATED_KEY_FILE = join(STATE_DIR, 'encryption-key');

/** The key every workspace shipped with before it was generated per workspace. It decodes to 24 bytes, so it never worked. */
const LEGACY_PLACEHOLDER_KEY = '0123456789abcdef0123456789abcdef';
const DEFAULT_OWNER = { Email: 'admin@memberjunction.org', FirstName: 'Admin', LastName: 'User' };

/** Provider key in .env → the driver name MemberJunction looks keys up by (AI_VENDOR_API_KEY__<driver>). */
const PROVIDER_KEYS = {
  OPENAI_API_KEY: 'OpenAILLM',
  ANTHROPIC_API_KEY: 'AnthropicLLM',
  GEMINI_API_KEY: 'GeminiLLM',
  GROQ_API_KEY: 'GroqLLM',
  MISTRAL_API_KEY: 'MistralLLM',
};

/** Settings a user edits in .env and that take effect on a restart. Everything else comes from docker-compose.yml. */
const USER_SETTINGS = [
  ...Object.keys(PROVIDER_KEYS),
  'ANTHROPIC_WORKSPACE_ID',
  'MJ_BASE_ENCRYPTION_KEY',
  'OWNER_EMAIL', 'OWNER_FIRST_NAME', 'OWNER_LAST_NAME',
  'ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID',
  'AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET',
  'GITHUB_TOKEN', 'OPEN_APP_INSTALL_URL',
];

// ---------------------------------------------------------------------------
// Reading settings
// ---------------------------------------------------------------------------

/** Minimal dotenv parser: KEY=value, optional quotes, # comments. No interpolation. */
export function ParseDotenv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    values[match[1]] = unquote(match[2]);
  }
  return values;
}

function unquote(raw) {
  const value = raw.trim();
  const quoted = value.match(/^(['"])(.*)\1$/);
  if (quoted) {
    return quoted[2];
  }
  return value.replace(/\s+#.*$/, ''); // an unquoted value ends at an inline comment
}

/**
 * A file's text, or undefined when it does not exist. Reading straight away, rather than checking
 * that the file exists first, leaves no window for it to change between the check and the read.
 */
function readIfExists(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

/** .env wins for the settings a user edits; the container environment supplies everything else. */
export function LoadSettings(env = process.env, hostEnvFile = HOST_ENV_FILE) {
  const hostEnv = readIfExists(hostEnvFile);
  const fromFile = hostEnv === undefined ? {} : ParseDotenv(hostEnv);
  const settings = { ...env };
  for (const key of USER_SETTINGS) {
    if (key in fromFile) {
      settings[key] = fromFile[key];
    }
  }
  return settings;
}

const value = (settings, key) => (settings[key] ?? '').trim();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** MemberJunction base64-decodes the key and requires exactly 32 bytes (AES-256). */
export function IsValidEncryptionKey(key) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(key)) {
    return false;
  }
  return Buffer.from(key, 'base64').length === 32;
}

export function AuthProvider(settings) {
  if (value(settings, 'ENTRA_TENANT_ID') && value(settings, 'ENTRA_CLIENT_ID')) {
    return 'entra';
  }
  if (value(settings, 'AUTH0_DOMAIN') && value(settings, 'AUTH0_CLIENT_ID')) {
    return 'auth0';
  }
  return 'none';
}

/** Returns { errors, warnings }. Errors stop setup; warnings say what will not work yet. */
export function CheckSettings(settings) {
  const errors = [];
  const warnings = [];
  const key = value(settings, 'MJ_BASE_ENCRYPTION_KEY');
  if (key && key !== LEGACY_PLACEHOLDER_KEY && !IsValidEncryptionKey(key)) {
    errors.push('MJ_BASE_ENCRYPTION_KEY in .env is not a valid key: it must be 32 random bytes, base64-encoded. '
      + 'Delete the line to have one generated, or set it to the output of `openssl rand -base64 32`.');
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value(settings, 'DB_DATABASE') || 'MemberJunction')) {
    errors.push('DB_DATABASE in .env may only contain letters, digits and underscores.');
  }
  if (!Object.keys(PROVIDER_KEYS).some((name) => value(settings, name))) {
    warnings.push('No AI provider key is set in .env, so agents cannot call a model yet.');
  }
  if (AuthProvider(settings) === 'none') {
    warnings.push('No sign-in provider is set in .env (ENTRA_* or AUTH0_*), so the Explorer web app cannot sign anyone in.');
  }
  if (!value(settings, 'OWNER_EMAIL')) {
    warnings.push('OWNER_EMAIL is not set in .env, so the installed owner is a placeholder account. Whoever signs in to Explorer is created at first sign-in instead, with the UI and Developer roles.');
  }
  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Encryption key
// ---------------------------------------------------------------------------

/**
 * The key in .env when it is set (and not the old placeholder); otherwise a key generated once
 * and kept in the container volume, so it stays the same across restarts.
 */
export function ResolveEncryptionKey(settings, keyFile = GENERATED_KEY_FILE) {
  const configured = value(settings, 'MJ_BASE_ENCRYPTION_KEY');
  if (configured && configured !== LEGACY_PLACEHOLDER_KEY) {
    return configured;
  }
  const kept = readIfExists(keyFile);
  if (kept !== undefined) {
    return kept.trim();
  }
  const generated = randomBytes(32).toString('base64');
  mkdirSync(dirname(keyFile), { recursive: true });
  try {
    // 'wx' creates the file only if it is still missing, readable by this user alone.
    writeFileSync(keyFile, `${generated}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }
    return readFileSync(keyFile, 'utf8').trim(); // another start generated one first; keep it
  }
  return generated;
}

// ---------------------------------------------------------------------------
// Installer config
// ---------------------------------------------------------------------------

function authProviderValues(settings) {
  switch (AuthProvider(settings)) {
    case 'entra':
      return { TenantID: value(settings, 'ENTRA_TENANT_ID'), ClientID: value(settings, 'ENTRA_CLIENT_ID') };
    case 'auth0':
      return {
        Domain: value(settings, 'AUTH0_DOMAIN'),
        ClientID: value(settings, 'AUTH0_CLIENT_ID'),
        ClientSecret: value(settings, 'AUTH0_CLIENT_SECRET'),
      };
    default:
      return {};
  }
}

/**
 * The owner is created with the Developer role, so the person who builds agents can also run
 * them from Explorer. Without an owner email the installer's previous default user is kept.
 */
function owner(settings) {
  const email = value(settings, 'OWNER_EMAIL');
  if (!email) {
    return { Username: DEFAULT_OWNER.Email, ...DEFAULT_OWNER };
  }
  return {
    Username: email,
    Email: email,
    FirstName: value(settings, 'OWNER_FIRST_NAME') || email.split('@')[0],
    LastName: value(settings, 'OWNER_LAST_NAME') || 'User',
  };
}

export function BuildInstallConfig(settings, encryptionKey) {
  const password = value(settings, 'DB_PASSWORD');
  return {
    PackageManager: 'pnpm',
    DatabaseHost: value(settings, 'DB_HOST') || 'sqlserver',
    DatabasePort: Number(value(settings, 'DB_PORT') || 1433),
    DatabaseName: value(settings, 'DB_DATABASE') || 'MemberJunction',
    DatabaseTrustCert: true,
    CodeGenUser: 'sa',
    CodeGenPassword: password,
    APIUser: 'sa',
    APIPassword: password,
    APIPort: Number(value(settings, 'API_PORT') || 4000),
    AuthProvider: AuthProvider(settings),
    AuthProviderValues: authProviderValues(settings),
    OpenAIKey: value(settings, 'OPENAI_API_KEY'),
    AnthropicKey: value(settings, 'ANTHROPIC_API_KEY'),
    MistralKey: value(settings, 'MISTRAL_API_KEY'),
    BaseEncryptionKey: encryptionKey,
    CreateNewUser: owner(settings),
  };
}

// ---------------------------------------------------------------------------
// Shell exports for the entrypoint
// ---------------------------------------------------------------------------

const shellQuote = (text) => `'${String(text).replace(/'/g, `'\\''`)}'`;

/** Variables the entrypoint's own CLI runs (install, sync push, app install) need. */
export function ShellExports(settings, encryptionKey) {
  const exports = { MJ_BASE_ENCRYPTION_KEY: encryptionKey };
  for (const [name, driver] of Object.entries(PROVIDER_KEYS)) {
    exports[`AI_VENDOR_API_KEY__${driver}`] = value(settings, name);
  }
  exports.ANTHROPIC_WORKSPACE_ID = value(settings, 'ANTHROPIC_WORKSPACE_ID');
  exports.GITHUB_TOKEN = value(settings, 'GITHUB_TOKEN');
  exports.OPEN_APP_INSTALL_URL = value(settings, 'OPEN_APP_INSTALL_URL');
  return Object.entries(exports).map(([name, text]) => `export ${name}=${shellQuote(text)}`).join('\n');
}

// ---------------------------------------------------------------------------
// Syncing into the installed workspace
// ---------------------------------------------------------------------------

/** Quote a dotenv value: single quotes keep it literal; double quotes when it contains one. */
function dotenvQuote(text) {
  const raw = String(text);
  if (!raw.includes("'")) {
    return `'${raw}'`;
  }
  if (!raw.includes('"')) {
    return `"${raw}"`;
  }
  throw new Error('A .env value cannot contain both single and double quotes.');
}

/** Set KEY=value in dotenv text, replacing the active line or appending one. */
export function UpsertDotenv(text, key, newValue) {
  const line = `${key}=${dotenvQuote(newValue)}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(text)) {
    return text.replace(pattern, () => line);
  }
  return `${text}${text.endsWith('\n') || text === '' ? '' : '\n'}${line}\n`;
}

/** Set `KEY: 'value'` in an Angular environment.ts. Keys the file does not have are left alone. */
export function SetEnvironmentValue(text, key, newValue) {
  const escaped = String(newValue).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const pattern = new RegExp(`^(\\s*${key}\\s*:\\s*)(['"\`]).*?\\2`, 'm');
  return text.replace(pattern, (_match, prefix) => `${prefix}'${escaped}'`);
}

function apiDotenvValues(settings, encryptionKey) {
  const values = { MJ_BASE_ENCRYPTION_KEY: encryptionKey, GRAPHQL_PORT: value(settings, 'API_PORT') || '4000' };
  for (const [name, driver] of Object.entries(PROVIDER_KEYS)) {
    values[`AI_VENDOR_API_KEY__${driver}`] = value(settings, name);
  }
  // Written even when empty, so clearing it in .env clears it here too.
  values.ANTHROPIC_WORKSPACE_ID = value(settings, 'ANTHROPIC_WORKSPACE_ID');
  const auth = AuthProvider(settings);
  if (auth === 'entra') {
    values.WEB_CLIENT_ID = value(settings, 'ENTRA_CLIENT_ID');
    values.TENANT_ID = value(settings, 'ENTRA_TENANT_ID');
  } else if (auth === 'auth0') {
    values.AUTH0_DOMAIN = value(settings, 'AUTH0_DOMAIN');
    values.AUTH0_CLIENT_ID = value(settings, 'AUTH0_CLIENT_ID');
    values.AUTH0_CLIENT_SECRET = value(settings, 'AUTH0_CLIENT_SECRET');
  }
  return values;
}

function explorerEnvironmentValues(settings) {
  const apiPort = value(settings, 'API_PORT') || '4000';
  const values = {
    GRAPHQL_URI: `http://localhost:${apiPort}/`,
    GRAPHQL_WS_URI: `ws://localhost:${apiPort}/`,
    REDIRECT_URI: `http://localhost:${value(settings, 'EXPLORER_PORT') || '4202'}`,
  };
  const auth = AuthProvider(settings);
  if (auth === 'entra') {
    const tenant = value(settings, 'ENTRA_TENANT_ID');
    Object.assign(values, { AUTH_TYPE: 'msal', CLIENT_ID: value(settings, 'ENTRA_CLIENT_ID'), TENANT_ID: tenant,
      CLIENT_AUTHORITY: `https://login.microsoftonline.com/${tenant}` });
  } else if (auth === 'auth0') {
    Object.assign(values, { AUTH_TYPE: 'auth0', AUTH0_DOMAIN: value(settings, 'AUTH0_DOMAIN'),
      AUTH0_CLIENTID: value(settings, 'AUTH0_CLIENT_ID') });
  }
  return values;
}

/** Apply `edit` to a file if it exists; returns whether the content changed. */
function rewriteFile(file, edit) {
  const before = readIfExists(file);
  if (before === undefined) {
    return false;
  }
  const after = edit(before);
  if (after === before) {
    return false;
  }
  writeFileSync(file, after, 'utf8');
  return true;
}

/** Marks the block {@link EnsureLocalSignInRoles} appends to mj.config.cjs, so it is added once. */
const LOCAL_SIGN_IN_ROLES_MARKER = '// citizen-builder: roles for people who sign in';

/**
 * Whoever signs in to a local builder is the developer building agents, so MJAPI creates them with
 * the Developer role as well as UI. Its default is UI only, which is right for a shared server but
 * leaves a builder unable to run the Flow agents they build from Explorer. docker-compose.yml binds
 * every port to this machine, so nobody else can reach the sign-in.
 *
 * Appended after `module.exports = {...}` rather than edited into it, so it survives whatever shape
 * the installed file has. MJAPI merges it over its defaults; the array replaces the default list.
 */
export function EnsureLocalSignInRoles(text) {
  if (text.includes(LOCAL_SIGN_IN_ROLES_MARKER)) {
    return text;
  }
  const block = [
    `${LOCAL_SIGN_IN_ROLES_MARKER} (added by scripts/workspace-settings.mjs)`,
    "module.exports.userHandling = { ...(module.exports.userHandling || {}), newUserRoles: ['UI', 'Developer'] };",
  ].join('\n');
  return `${text.replace(/\s*$/, '')}\n\n${block}\n`;
}

function syncApi(settings, encryptionKey) {
  const values = apiDotenvValues(settings, encryptionKey);
  const apply = (text) => Object.entries(values).reduce((acc, [k, v]) => UpsertDotenv(acc, k, v), text);
  const apiChanged = rewriteFile(join(WORKSPACE, 'apps', 'MJAPI', '.env'), apply);
  const rootChanged = rewriteFile(join(WORKSPACE, '.env'), apply); // what `mj` CLI runs in /workspace read
  // apps/MJAPI/mj.config.cjs requires this file, so MJAPI reads it too.
  const rolesChanged = rewriteFile(join(WORKSPACE, 'mj.config.cjs'), EnsureLocalSignInRoles);
  return apiChanged || rootChanged || rolesChanged;
}

function syncExplorer(settings) {
  const dir = join(WORKSPACE, 'apps', 'MJExplorer', 'src', 'environments');
  if (!existsSync(dir)) {
    return false;
  }
  const values = explorerEnvironmentValues(settings);
  const apply = (text) => Object.entries(values).reduce((acc, [k, v]) => SetEnvironmentValue(acc, k, v), text);
  let changed = false;
  for (const name of readdirSync(dir).filter((file) => /^environment.*\.ts$/.test(file))) {
    changed = rewriteFile(join(dir, name), apply) || changed;
  }
  return syncExplorerStartScript() || changed;
}

/** Explorer listens on every interface inside the container, on the port docker-compose.yml publishes. */
function syncExplorerStartScript() {
  return rewriteFile(join(WORKSPACE, 'apps', 'MJExplorer', 'package.json'), (text) => {
    const pkg = JSON.parse(text);
    const start = pkg.scripts?.start;
    if (!start || start.includes('--host 0.0.0.0')) {
      return text;
    }
    pkg.scripts.start = start.replace('ng serve', 'ng serve --host 0.0.0.0 --port 4200');
    return `${JSON.stringify(pkg, null, 2)}\n`;
  });
}

export function SyncWorkspace(settings, encryptionKey) {
  return { api: syncApi(settings, encryptionKey), explorer: syncExplorer(settings) };
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

function runCheck(settings) {
  const { errors, warnings } = CheckSettings(settings);
  for (const warning of warnings) {
    console.log(`warning: ${warning}`);
  }
  for (const error of errors) {
    console.log(`error: ${error}`);
  }
  return errors.length > 0 ? 1 : 0;
}

function main() {
  const [command, argument] = process.argv.slice(2);
  const settings = LoadSettings();
  if (command === 'check') {
    return runCheck(settings);
  }
  const encryptionKey = ResolveEncryptionKey(settings);
  switch (command) {
    case 'install-config':
      writeFileSync(argument, `${JSON.stringify(BuildInstallConfig(settings, encryptionKey), null, 2)}\n`, { mode: 0o600 });
      return 0;
    case 'shell-env':
      console.log(ShellExports(settings, encryptionKey));
      return 0;
    case 'sync':
      console.log(JSON.stringify(SyncWorkspace(settings, encryptionKey)));
      return 0;
    default:
      console.error(`workspace-settings: unknown command '${command}'`);
      return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
