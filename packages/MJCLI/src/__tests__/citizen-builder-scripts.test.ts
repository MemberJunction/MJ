/**
 * The citizen builder template's Node helpers, run the way scripts/docker-entrypoint.sh runs them:
 * as child processes, against a workspace laid out like the container's (/work = the user's folder,
 * /workspace = the installed MemberJunction). Paths are redirected with the MJ_* variables each
 * script reads, so no Docker is needed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'init-templates', 'citizen-builder', 'scripts');

interface Workspace {
  Root: string;
  HostEnv: string;
  Installed: string;
}

function makeWorkspace(): Workspace {
  const root = mkdtempSync(path.join(os.tmpdir(), 'mj-citizen-scripts-'));
  const installed = path.join(root, 'workspace');
  mkdirSync(path.join(root, 'host'), { recursive: true });
  return { Root: root, HostEnv: path.join(root, 'host', '.env'), Installed: installed };
}

/** Lay down the files `mj install` writes that the settings sync edits. */
function installMemberJunction(ws: Workspace): void {
  mkdirSync(path.join(ws.Installed, 'apps', 'MJAPI'), { recursive: true });
  mkdirSync(path.join(ws.Installed, 'apps', 'MJExplorer', 'src', 'environments'), { recursive: true });
  const apiEnv = "DB_HOST='sqlserver'\nGRAPHQL_PORT=4000\nMJ_BASE_ENCRYPTION_KEY=''\nAI_VENDOR_API_KEY__AnthropicLLM=''\n";
  writeFileSync(path.join(ws.Installed, 'apps', 'MJAPI', '.env'), apiEnv);
  writeFileSync(path.join(ws.Installed, '.env'), apiEnv);
  writeFileSync(
    path.join(ws.Installed, 'apps', 'MJExplorer', 'src', 'environments', 'environment.ts'),
    [
      'export const environment = {',
      "  GRAPHQL_URI: 'http://localhost:4000/',",
      "  GRAPHQL_WS_URI: 'ws://localhost:4000/',",
      "  REDIRECT_URI: 'http://localhost:4200',",
      "  AUTH_TYPE: 'msal',",
      "  CLIENT_ID: '',",
      "  TENANT_ID: '',",
      "  CLIENT_AUTHORITY: '',",
      '} as const;',
      '',
    ].join('\n')
  );
  writeFileSync(path.join(ws.Installed, 'apps', 'MJExplorer', 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }));
  writeFileSync(
    path.join(ws.Installed, 'mj.config.cjs'),
    "module.exports = {\n  settings: { host: 'sqlserver' },\n  userHandling: { autoCreateNewUsers: true },\n};\n"
  );
}

/** Evaluate the installed mj.config.cjs the way MJAPI does: `require` it in a fresh process. */
function loadServerConfig(ws: Workspace): { settings?: { host?: string }; userHandling?: { autoCreateNewUsers?: boolean; newUserRoles?: string[] } } {
  const script = `process.stdout.write(JSON.stringify(require(${JSON.stringify(path.join(ws.Installed, 'mj.config.cjs'))})))`;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }));
}

/** Run a template script with the container's environment, redirected into the temp workspace. */
function run(ws: Workspace, script: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      MJ_HOST_ENV_FILE: ws.HostEnv,
      MJ_WORKSPACE_DIR: ws.Installed,
      MJ_STATUS_FILE: path.join(ws.Root, 'status.json'),
      DB_HOST: 'sqlserver',
      DB_PORT: '1433',
      DB_PASSWORD: 'TestPassword123!',
      DB_DATABASE: 'MemberJunction',
      API_PORT: '4000',
      EXPLORER_PORT: '4202',
      ...env,
    },
  });
}

describe('citizen builder template scripts', () => {
  let ws: Workspace;

  beforeEach(() => {
    ws = makeWorkspace();
  });

  afterEach(() => {
    rmSync(ws.Root, { recursive: true, force: true });
  });

  describe('workspace-settings.mjs check', () => {
    it('blocks setup on an invalid encryption key and names the fix', () => {
      writeFileSync(ws.HostEnv, 'MJ_BASE_ENCRYPTION_KEY=too-short\n');
      const result = run(ws, 'workspace-settings.mjs', ['check']);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('error: MJ_BASE_ENCRYPTION_KEY');
      expect(result.stdout).toContain('openssl rand -base64 32');
    });

    it('accepts the old placeholder key, which is replaced rather than rejected', () => {
      writeFileSync(ws.HostEnv, 'MJ_BASE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef\nANTHROPIC_API_KEY=k\n');
      expect(run(ws, 'workspace-settings.mjs', ['check']).status).toBe(0);
    });

    it('warns about what will not work yet, without blocking', () => {
      writeFileSync(ws.HostEnv, '');
      const result = run(ws, 'workspace-settings.mjs', ['check']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('warning: No AI provider key');
      expect(result.stdout).toContain('warning: No sign-in provider');
      expect(result.stdout).toContain('warning: OWNER_EMAIL');
    });
  });

  describe('workspace-settings.mjs install-config', () => {
    function installConfig(env: Record<string, string> = {}) {
      const file = path.join(ws.Root, 'install.json');
      const result = run(ws, 'workspace-settings.mjs', ['install-config', file], env);
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(readFileSync(file, 'utf8'));
    }

    it('creates the owner, wires Entra sign-in and the API port, and keeps an awkward password intact', () => {
      writeFileSync(ws.HostEnv, 'OWNER_EMAIL=pat@example.com\nOWNER_FIRST_NAME=Pat\nENTRA_TENANT_ID=t1\nENTRA_CLIENT_ID=c1\nANTHROPIC_API_KEY=sk-ant\n');
      const config = installConfig({ DB_PASSWORD: `Pa'ss"wo\\rd`, API_PORT: '4010' });
      expect(config.CreateNewUser).toEqual({ Username: 'pat@example.com', Email: 'pat@example.com', FirstName: 'Pat', LastName: 'User' });
      expect(config.AuthProvider).toBe('entra');
      expect(config.AuthProviderValues).toEqual({ TenantID: 't1', ClientID: 'c1' });
      expect(config.APIPort).toBe(4010);
      expect(config.AnthropicKey).toBe('sk-ant');
      expect(config.CodeGenPassword).toBe(`Pa'ss"wo\\rd`);
      expect(Buffer.from(config.BaseEncryptionKey, 'base64')).toHaveLength(32);
    });

    it('wires Auth0 when its settings are present', () => {
      writeFileSync(ws.HostEnv, 'AUTH0_DOMAIN=example.auth0.com\nAUTH0_CLIENT_ID=c2\nAUTH0_CLIENT_SECRET=s2\n');
      const config = installConfig();
      expect(config.AuthProvider).toBe('auth0');
      expect(config.AuthProviderValues).toEqual({ Domain: 'example.auth0.com', ClientID: 'c2', ClientSecret: 's2' });
    });

    it('keeps the previous default user when no owner is set', () => {
      writeFileSync(ws.HostEnv, '');
      expect(installConfig().CreateNewUser.Email).toBe('admin@memberjunction.org');
      expect(installConfig().AuthProvider).toBe('none');
    });

    it('reads user settings from .env over the container environment, which goes stale', () => {
      writeFileSync(ws.HostEnv, 'ANTHROPIC_API_KEY=from-file\n');
      expect(installConfig({ ANTHROPIC_API_KEY: 'from-container' }).AnthropicKey).toBe('from-file');
    });
  });

  describe('workspace-settings.mjs encryption key', () => {
    it('generates one key and keeps it across runs, replacing the old placeholder', () => {
      writeFileSync(ws.HostEnv, 'MJ_BASE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef\n');
      const keyOf = () => {
        const file = path.join(ws.Root, 'install.json');
        run(ws, 'workspace-settings.mjs', ['install-config', file]);
        return JSON.parse(readFileSync(file, 'utf8')).BaseEncryptionKey as string;
      };
      const first = keyOf();
      expect(first).not.toBe('0123456789abcdef0123456789abcdef');
      expect(keyOf()).toBe(first);
      expect(existsSync(path.join(ws.Installed, '.citizen-builder', 'encryption-key'))).toBe(true);
    });

    it('uses the key in .env when it is valid', () => {
      const key = Buffer.alloc(32, 9).toString('base64');
      writeFileSync(ws.HostEnv, `MJ_BASE_ENCRYPTION_KEY=${key}\n`);
      const file = path.join(ws.Root, 'install.json');
      run(ws, 'workspace-settings.mjs', ['install-config', file]);
      expect(JSON.parse(readFileSync(file, 'utf8')).BaseEncryptionKey).toBe(key);
    });
  });

  describe('workspace-settings.mjs sync', () => {
    beforeEach(() => installMemberJunction(ws));

    it('carries keys, sign-in and the API port into the files the API and Explorer read, once', () => {
      writeFileSync(ws.HostEnv, "ANTHROPIC_API_KEY=sk-ant-1\nGEMINI_API_KEY=it's\nENTRA_TENANT_ID=t1\nENTRA_CLIENT_ID=c1\n");
      const first = run(ws, 'workspace-settings.mjs', ['sync'], { API_PORT: '4010' });
      expect(JSON.parse(first.stdout)).toEqual({ api: true, explorer: true });

      const apiEnv = readFileSync(path.join(ws.Installed, 'apps', 'MJAPI', '.env'), 'utf8');
      expect(apiEnv).toContain("AI_VENDOR_API_KEY__AnthropicLLM='sk-ant-1'");
      expect(apiEnv).toContain(`AI_VENDOR_API_KEY__GeminiLLM="it's"`);
      expect(apiEnv).toContain("GRAPHQL_PORT='4010'");
      expect(apiEnv).toContain("WEB_CLIENT_ID='c1'");
      expect(apiEnv).toContain("TENANT_ID='t1'");
      expect(readFileSync(path.join(ws.Installed, '.env'), 'utf8')).toContain("AI_VENDOR_API_KEY__AnthropicLLM='sk-ant-1'");

      const environment = readFileSync(path.join(ws.Installed, 'apps', 'MJExplorer', 'src', 'environments', 'environment.ts'), 'utf8');
      expect(environment).toContain("GRAPHQL_URI: 'http://localhost:4010/'");
      expect(environment).toContain("CLIENT_ID: 'c1'");
      expect(environment).toContain("CLIENT_AUTHORITY: 'https://login.microsoftonline.com/t1'");
      expect(JSON.parse(readFileSync(path.join(ws.Installed, 'apps', 'MJExplorer', 'package.json'), 'utf8')).scripts.start)
        .toBe('ng serve --host 0.0.0.0 --port 4200');

      const second = run(ws, 'workspace-settings.mjs', ['sync'], { API_PORT: '4010' });
      expect(JSON.parse(second.stdout)).toEqual({ api: false, explorer: false });
    });

    it('picks up a key added to .env after the container started', () => {
      writeFileSync(ws.HostEnv, 'ANTHROPIC_API_KEY=\n');
      run(ws, 'workspace-settings.mjs', ['sync']);
      writeFileSync(ws.HostEnv, 'ANTHROPIC_API_KEY=added-later\n');
      const result = run(ws, 'workspace-settings.mjs', ['sync']);
      expect(JSON.parse(result.stdout).api).toBe(true);
      expect(readFileSync(path.join(ws.Installed, 'apps', 'MJAPI', '.env'), 'utf8')).toContain("AI_VENDOR_API_KEY__AnthropicLLM='added-later'");
    });

    it('gives people who sign in the Developer role as well as UI, once', () => {
      writeFileSync(ws.HostEnv, '');
      expect(JSON.parse(run(ws, 'workspace-settings.mjs', ['sync']).stdout).api).toBe(true);

      const config = loadServerConfig(ws);
      expect(config.userHandling).toEqual({ autoCreateNewUsers: true, newUserRoles: ['UI', 'Developer'] });
      expect(config.settings).toEqual({ host: 'sqlserver' });

      expect(JSON.parse(run(ws, 'workspace-settings.mjs', ['sync']).stdout).api).toBe(false);
      const text = readFileSync(path.join(ws.Installed, 'mj.config.cjs'), 'utf8');
      expect(text.match(/newUserRoles/g)).toHaveLength(1);
    });

    it('carries the Anthropic workspace ID to the API and the CLI, and clears it when .env does', () => {
      writeFileSync(ws.HostEnv, 'ANTHROPIC_API_KEY=sk-org\nANTHROPIC_WORKSPACE_ID=wrkspc_1\n');
      run(ws, 'workspace-settings.mjs', ['sync']);
      expect(readFileSync(path.join(ws.Installed, 'apps', 'MJAPI', '.env'), 'utf8')).toContain("ANTHROPIC_WORKSPACE_ID='wrkspc_1'");
      expect(readFileSync(path.join(ws.Installed, '.env'), 'utf8')).toContain("ANTHROPIC_WORKSPACE_ID='wrkspc_1'");

      writeFileSync(ws.HostEnv, 'ANTHROPIC_API_KEY=sk-scoped\nANTHROPIC_WORKSPACE_ID=\n');
      const result = run(ws, 'workspace-settings.mjs', ['sync']);
      expect(JSON.parse(result.stdout).api).toBe(true);
      expect(readFileSync(path.join(ws.Installed, 'apps', 'MJAPI', '.env'), 'utf8')).toContain("ANTHROPIC_WORKSPACE_ID=''");
    });
  });

  it('workspace-settings.mjs shell-env quotes values so the shell reads them back exactly', () => {
    writeFileSync(ws.HostEnv, "ANTHROPIC_API_KEY=a'b $HOME `x`\nANTHROPIC_WORKSPACE_ID=wrkspc_2\nGITHUB_TOKEN=gh-1\n");
    const exports = run(ws, 'workspace-settings.mjs', ['shell-env']).stdout;
    const echoed = execFileSync('bash', ['-c', `${exports}\nprintf '%s|%s|%s' "$AI_VENDOR_API_KEY__AnthropicLLM" "$ANTHROPIC_WORKSPACE_ID" "$GITHUB_TOKEN"`], { encoding: 'utf8' });
    expect(echoed).toBe("a'b $HOME `x`|wrkspc_2|gh-1");
  });

  it('builder-status.mjs records each step, warnings, a failure with its log, and ready', () => {
    const status = () => JSON.parse(readFileSync(path.join(ws.Root, 'status.json'), 'utf8'));
    run(ws, 'builder-status.mjs', ['start']);
    expect(status().state).toBe('starting');

    run(ws, 'builder-status.mjs', ['phase', 'install', '2', '6', 'Installing MemberJunction', '10 to 25 minutes']);
    expect(status()).toMatchObject({ state: 'working', phase: { id: 'install', step: 2, steps: 6, typical: '10 to 25 minutes' } });

    run(ws, 'builder-status.mjs', ['warn', 'No AI provider key is set.']);
    const logFile = path.join(ws.Root, 'install.log');
    writeFileSync(logFile, Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n'));
    run(ws, 'builder-status.mjs', ['fail', 'Installing MemberJunction failed twice.', 'Check the database.', logFile]);
    const failed = status();
    expect(failed.state).toBe('failed');
    expect(failed.error).toMatchObject({ phase: 'install', summary: 'Installing MemberJunction failed twice.', whatToDo: 'Check the database.' });
    expect(failed.error.logTail.split('\n')).toHaveLength(40);
    expect(failed.error.logTail).toContain('line 60');

    run(ws, 'builder-status.mjs', ['ready', 'http://localhost:4202', 'http://localhost:4000']);
    expect(status()).toMatchObject({ state: 'ready', urls: { explorer: 'http://localhost:4202', api: 'http://localhost:4000' }, warnings: ['No AI provider key is set.'] });

    run(ws, 'builder-status.mjs', ['start']);
    expect(status()).toMatchObject({ state: 'starting', warnings: [], error: null });
  });
});
