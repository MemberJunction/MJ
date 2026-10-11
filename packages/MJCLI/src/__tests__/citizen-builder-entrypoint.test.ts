/**
 * Runs the citizen builder container's entrypoint (scripts/docker-entrypoint.sh) for real, outside
 * Docker: `mj`, `pm2` and `pnpm` are stubs that record their arguments, the database is a TCP
 * listener, and the API and Explorer are HTTP listeners. Paths are redirected with the MJ_*
 * variables the script reads. This checks the order of the steps, what each start skips, the status
 * file, and that a failing step stops setup instead of exiting into a restart loop.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer as createTcpServer, type AddressInfo, type Server as TcpServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'init-templates', 'citizen-builder');

/** A stub `mj`: records its arguments; `install` and `app install` lay down the files the real ones write. */
const MJ_STUB = `#!/bin/bash
echo "mj $*" >> "$STUB_LOG"
case "$1" in
  install)
    if [ -n "\${FAIL_INSTALL:-}" ]; then echo "Install failed: Login failed for user 'sa'"; exit 1; fi
    ws="$MJ_WORKSPACE_DIR"
    mkdir -p "$ws/apps/MJAPI" "$ws/apps/MJExplorer/src/environments"
    echo '{"name":"mj-distribution"}' > "$ws/package.json"
    printf "DB_HOST='sqlserver'\\nGRAPHQL_PORT=4000\\n" > "$ws/apps/MJAPI/.env"
    printf "GRAPHQL_PORT=4000\\n" > "$ws/.env"
    echo '{"scripts":{"start":"ng serve"},"dependencies":{"@angular/core":"21.2.22"}}' > "$ws/apps/MJExplorer/package.json"
    printf "export const environment = {\\n  GRAPHQL_URI: 'http://localhost:4000/',\\n} as const;\\n" > "$ws/apps/MJExplorer/src/environments/environment.ts"
    printf "packages:\\n  - 'apps/*'\\n" > "$ws/pnpm-workspace.yaml"
    cat > "$ws/mj.config.cjs" <<'CONFIG'
module.exports = {
  dynamicPackages: {
    server: [],
    client: [
      { PackageName: '@example/orders-ng', Enabled: true }
    ]
  },
};
CONFIG
    ;;
  app)
    if [ -n "\${APP_ALREADY_INSTALLED:-}" ]; then
      echo "Installing more-cheese..."
      echo "Error: App 'more-cheese' is already installed with status 'Active'."
      exit 1
    fi
    # Like the real installer, an Open App adds its client packages to mj.config.cjs.
    cat > "$MJ_WORKSPACE_DIR/mj.config.cjs" <<'CONFIG'
module.exports = {
  dynamicPackages: {
    server: [],
    client: [
      { PackageName: '@example/orders-ng', Enabled: true },
      { PackageName: '@example/contact-widget-element', Enabled: true }
    ]
  },
};
CONFIG
    ;;
esac
exit 0
`;

/** A stub for commands whose effects don't matter here: it records its arguments and succeeds. */
const RECORDING_STUB = (name: string) => `#!/bin/bash\necho "${name} $*" >> "$STUB_LOG"\nexit 0\n`;

/**
 * A stub `pm2`: records its arguments, and for `start` the settings a started service would
 * inherit from the entrypoint's environment (a value there would win over the .env files).
 */
const PM2_STUB = `#!/bin/bash
echo "pm2 $*" >> "$STUB_LOG"
if [ "$1" = start ]; then
  echo "pm2-env key=\${AI_VENDOR_API_KEY__AnthropicLLM-unset} encryption=\${MJ_BASE_ENCRYPTION_KEY-unset}" >> "$STUB_LOG"
fi
exit 0
`;

interface Harness {
  Root: string;
  Work: string;
  Workspace: string;
  StubLog: string;
  StatusFile: string;
}

function makeHarness(): Harness {
  const root = mkdtempSync(path.join(os.tmpdir(), 'mj-entrypoint-'));
  const work = path.join(root, 'work');
  const bin = path.join(root, 'bin');
  cpSync(path.join(TEMPLATE, 'scripts'), path.join(work, 'scripts'), { recursive: true });
  cpSync(path.join(TEMPLATE, 'metadata'), path.join(work, 'metadata'), { recursive: true });
  mkdirSync(bin, { recursive: true });
  for (const [name, body] of [['mj', MJ_STUB], ['pm2', PM2_STUB], ['pnpm', RECORDING_STUB('pnpm')]] as const) {
    writeFileSync(path.join(bin, name), body);
    chmodSync(path.join(bin, name), 0o755);
  }
  return {
    Root: root,
    Work: work,
    Workspace: path.join(root, 'workspace'),
    StubLog: path.join(root, 'stub.log'),
    StatusFile: path.join(work, '.mj-status.json'),
  };
}

function listen<T extends HttpServer | TcpServer>(server: T): Promise<number> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
}

function close(server: HttpServer | TcpServer): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('citizen builder entrypoint', () => {
  let h: Harness;
  let database: TcpServer;
  let api: HttpServer;
  let explorer: HttpServer;
  let ports: { Database: number; Api: number; Explorer: number };

  beforeEach(async () => {
    h = makeHarness();
    database = createTcpServer((socket) => socket.end());
    api = createHttpServer((_req, res) => res.end('ok'));
    explorer = createHttpServer((_req, res) => res.end('<html></html>'));
    ports = { Database: await listen(database), Api: await listen(api), Explorer: await listen(explorer) };
    writeFileSync(path.join(h.Work, '.env'), 'ANTHROPIC_API_KEY=sk-test\nOWNER_EMAIL=pat@example.com\nGITHUB_TOKEN=gh-test\n');
  });

  afterEach(async () => {
    await Promise.all([close(database), close(api), close(explorer)]);
    rmSync(h.Root, { recursive: true, force: true });
  });

  /** Run the entrypoint to completion (it must not block the event loop: the listeners answer it). */
  function runEntrypoint(extraEnv: Record<string, string> = {}): Promise<{ Code: number | null; Output: string }> {
    return new Promise((resolve) => {
      const child = spawn('bash', [path.join(h.Work, 'scripts', 'docker-entrypoint.sh')], {
        env: {
          PATH: `${path.join(h.Root, 'bin')}:${process.env.PATH ?? ''}`,
          TMPDIR: h.Root,
          STUB_LOG: h.StubLog,
          MJ_SCRIPTS_DIR: path.join(h.Work, 'scripts'),
          MJ_METADATA_DIR: path.join(h.Work, 'metadata'),
          MJ_WORKSPACE_DIR: h.Workspace,
          MJ_HOST_ENV_FILE: path.join(h.Work, '.env'),
          MJ_STATUS_FILE: h.StatusFile,
          MJ_RETRY_DELAY_SECONDS: '0',
          MJ_EXIT_ON_PARK: '1',
          MJ_EXPLORER_INTERNAL_PORT: String(ports.Explorer),
          MJ_VERSION: '6.2.0-edge.9',
          DB_HOST: '127.0.0.1',
          DB_PORT: String(ports.Database),
          DB_PASSWORD: 'TestPassword123!',
          DB_DATABASE: 'MemberJunction',
          API_PORT: String(ports.Api),
          EXPLORER_PORT: '4202',
          OPEN_APP_INSTALL_URL: 'https://github.com/MemberJunction/more-cheese',
          ...extraEnv,
        },
      });
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.on('close', (code) => resolve({ Code: code, Output: output }));
    });
  }

  const calls = () => (existsSync(h.StubLog) ? readFileSync(h.StubLog, 'utf8').trim().split('\n') : []);
  const status = () => JSON.parse(readFileSync(h.StatusFile, 'utf8'));
  const workspaceFile = (...parts: string[]) => readFileSync(path.join(h.Workspace, ...parts), 'utf8');

  it('first start: installs, loads sample data, pushes metadata, starts, reports ready', async () => {
    const run = await runEntrypoint();
    expect(run.Code, run.Output).toBe(0);

    const log = calls();
    const index = (prefix: string) => log.findIndex((line) => line.startsWith(prefix));
    expect(log[index('mj install')]).toMatch(new RegExp(`--dir ${h.Workspace} --tag v6\\.2\\.0-edge\\.9$`));
    expect(index('mj install')).toBeLessThan(index('mj app install https://github.com/MemberJunction/more-cheese'));
    expect(index('mj app install')).toBeLessThan(index(`mj sync push --dir ${path.join(h.Work, 'metadata')} --ci`));
    expect(index('mj sync push')).toBeLessThan(index('pm2 start npm run start:api --name mjapi'));
    expect(log).toContain('pm2 start npm run start:explorer --name mjexplorer');

    expect(status()).toMatchObject({ state: 'ready', urls: { explorer: 'http://localhost:4202', api: `http://localhost:${ports.Api}` }, error: null });
    expect(status().warnings.join(' ')).toContain('No sign-in provider');

    expect(workspaceFile('apps', 'MJAPI', '.env')).toContain("AI_VENDOR_API_KEY__AnthropicLLM='sk-test'");
    expect(workspaceFile('apps', 'MJAPI', '.env')).toContain(`GRAPHQL_PORT='${ports.Api}'`);
    // The API reads keys from apps/MJAPI/.env. A copy left in the environment it starts with would
    // win over that file (dotenv never overrides) and pm2 would keep it across restarts.
    expect(log.filter((line) => line.startsWith('pm2-env'))).toEqual(['pm2-env key=unset encryption=unset', 'pm2-env key=unset encryption=unset']);
    const config = workspaceFile('mj.config.cjs');
    expect(config).toMatch(/"PackageName": "@example\/orders-ng",\s*"Enabled": true/);
    expect(config).toMatch(/"PackageName": "@example\/contact-widget-element",\s*"Enabled": false/);
  }, 60_000);

  it('a later start only checks for updates and starts the services', async () => {
    expect((await runEntrypoint()).Code).toBe(0);
    writeFileSync(h.StubLog, '');

    const second = await runEntrypoint();
    expect(second.Code, second.Output).toBe(0);
    const log = calls();
    expect(log).toContain('mj migrate');
    expect(log.some((line) => line.startsWith('mj install'))).toBe(false);
    expect(log.some((line) => line.startsWith('mj app install'))).toBe(false);
    expect(log.some((line) => line.startsWith('mj sync push'))).toBe(false); // never overwrites edits made in Explorer
    expect(status().state).toBe('ready');
  }, 60_000);

  it('a step that fails twice stops setup with what went wrong, instead of exiting into a restart loop', async () => {
    const run = await runEntrypoint({ FAIL_INSTALL: '1' });
    expect(run.Code).toBe(3); // MJ_EXIT_ON_PARK: in the container this is `sleep infinity`, so Docker never restarts it
    expect(calls().filter((line) => line.startsWith('mj install'))).toHaveLength(2);
    expect(calls().some((line) => line.startsWith('pm2 start'))).toBe(false);
    expect(status()).toMatchObject({ state: 'failed', error: { phase: 'install', summary: 'Installing MemberJunction failed twice.' } });
    expect(status().error.logTail).toContain("Login failed for user 'sa'");
    expect(status().error.whatToDo).toContain('docker compose logs sqlserver');
  }, 60_000);

  it('an app install that an earlier, interrupted start already finished counts as done', async () => {
    const run = await runEntrypoint({ APP_ALREADY_INSTALLED: '1' });
    expect(run.Code, run.Output).toBe(0);
    expect(run.Output).toContain("already installed with status 'Active'"); // the installer's output reaches the log
    expect(calls().filter((line) => line.startsWith('mj app install'))).toHaveLength(1);
    expect(existsSync(path.join(h.Workspace, '.citizen-builder', 'app-installed'))).toBe(true);
    expect(status().state).toBe('ready');
  }, 60_000);

  it('an invalid encryption key stops setup before anything is installed', async () => {
    writeFileSync(path.join(h.Work, '.env'), 'MJ_BASE_ENCRYPTION_KEY=not-a-valid-key\nGITHUB_TOKEN=gh-test\n');
    const run = await runEntrypoint();
    expect(run.Code).toBe(3);
    expect(calls()).toEqual([]);
    expect(status().state).toBe('failed');
    expect(status().message).toContain('MJ_BASE_ENCRYPTION_KEY');
  }, 60_000);
});
