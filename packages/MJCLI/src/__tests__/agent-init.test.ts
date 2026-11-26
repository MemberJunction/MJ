import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execSync: execSyncMock,
  };
});

import AgentInit from '../commands/agent/init.js';

const cliVersion: string = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;

const envLines = (target: string, key: string): string[] =>
  readFileSync(path.join(target, '.env'), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith(`${key}=`));

const LLM_KEY_NAMES = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
] as const;

describe('AgentInit Command', () => {
  let tempDir: string;
  const savedEnv: Partial<Record<(typeof LLM_KEY_NAMES)[number], string | undefined>> = {};

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'mj-agent-init-test-'));
    execSyncMock.mockReset();
    for (const key of LLM_KEY_NAMES) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of LLM_KEY_NAMES) {
      const prev = savedEnv[key];
      if (prev === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prev;
      }
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('has valid command description, examples, and aliases', () => {
    expect(AgentInit.description).toContain('Citizen Agent Builder');
    expect(AgentInit.aliases).toContain('ai:agents:init');
    expect(AgentInit.args).toBeDefined();
    expect(AgentInit.flags.force).toBeDefined();
    expect(AgentInit.flags.start).toBeDefined();
    expect(AgentInit.flags.app).toBeDefined();
  });

  it('scaffolds citizen-builder workspace into target directory with executable scripts', async () => {
    const target = path.join(tempDir, 'workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    expect(existsSync(path.join(target, 'AGENTS.md'))).toBe(true);
    expect(existsSync(path.join(target, 'README.md'))).toBe(true);
    expect(existsSync(path.join(target, 'CAPABILITIES.md'))).toBe(true);
    expect(existsSync(path.join(target, 'docker-compose.yml'))).toBe(true);
    expect(existsSync(path.join(target, '.env'))).toBe(true);
    expect(existsSync(path.join(target, 'metadata', 'agents', '.customer-insight-agent.json'))).toBe(true);
    expect(existsSync(path.join(target, '.agents', 'skills', 'new-agent', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(target, '.agents', 'skills', 'test-agent', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(target, '.agents', 'skills', 'package-agent', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(target, 'docs', 'ENTERPRISE_ORG_SETUP.md'))).toBe(true);

    const scriptsDir = path.join(target, 'scripts');
    const shFiles = readdirSync(scriptsDir).filter((name) => name.endsWith('.sh'));
    expect(shFiles.length).toBeGreaterThan(0);
    for (const file of shFiles) {
      const mode = statSync(path.join(scriptsDir, file)).mode;
      expect(mode & 0o111).not.toBe(0);
    }
  });

  it('customizes OPEN_APP_INSTALL_URL when --app flag is passed', async () => {
    const target = path.join(tempDir, 'custom-app-workspace');
    const customUrl = 'https://github.com/BlueCypress/bc-sampledata';

    await AgentInit.run([target, '--skip-docker-check', '--no-start', '--app', customUrl]);

    const envContent = readFileSync(path.join(target, '.env'), 'utf8');
    expect(envContent).toContain(`OPEN_APP_INSTALL_URL=${customUrl}`);
  });

  it('does not overwrite existing workspace without --force', async () => {
    const target = path.join(tempDir, 'existing-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    // Overwrite AGENTS.md with custom text
    const customContent = '# My Custom Agents File';
    writeFileSync(path.join(target, 'AGENTS.md'), customContent, 'utf8');

    // Run again without --force
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    // Content should NOT have been overwritten
    const currentContent = readFileSync(path.join(target, 'AGENTS.md'), 'utf8');
    expect(currentContent).toBe(customContent);

    // Run with --force
    await AgentInit.run([target, '--skip-docker-check', '--no-start', '--force']);

    // Content should now be reset to template
    const resetContent = readFileSync(path.join(target, 'AGENTS.md'), 'utf8');
    expect(resetContent).toContain('Citizen Agent Builder');
  });

  it('pins the workspace to its own CLI version via MJ_VERSION in .env', async () => {
    const target = path.join(tempDir, 'pinned-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    expect(cliVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(envLines(target, 'MJ_VERSION')).toEqual([`MJ_VERSION=${cliVersion}`]);
  });

  // The pin in .env only matters if the container honours it. These files come from the CLI's
  // bundled copy of the template, which once lagged citizen-builder/ and still installed an
  // unpinned CLI while the test above passed.
  it('scaffolds a container that installs the release MJ_VERSION names', async () => {
    const target = path.join(tempDir, 'pinned-container-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    const read = (...segments: string[]) => readFileSync(path.join(target, ...segments), 'utf8');
    expect(read('docker-compose.yml')).toContain('MJ_VERSION: "${MJ_VERSION:?');
    expect(read('docker-compose.yml')).toContain('./CAPABILITIES.md:/work/CAPABILITIES.md');
    expect(read('docker-compose.yml')).toContain('http://localhost:4000/healthcheck');
    expect(read('docker', 'Dockerfile')).toContain('npm install -g "@memberjunction/cli@${MJ_VERSION}"');
    expect(read('scripts', 'docker-entrypoint.sh')).toContain('--tag "v${MJ_VERSION}"');
    expect(read('scripts', 'docker-entrypoint.sh')).toContain('pm2-runtime start /tmp/ecosystem.config.cjs');
    expect(read('scripts', 'docker-entrypoint.sh')).toContain('shamefully-hoist=true');
  });

  it('re-pins a stale MJ_VERSION in place on --force, keeping the user\'s other values', async () => {
    const target = path.join(tempDir, 'stale-pin-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    const envPath = path.join(target, '.env');
    const stale = readFileSync(envPath, 'utf8')
      .replace(/^MJ_VERSION=.*$/m, 'MJ_VERSION=0.0.1')
      .replace(/^ANTHROPIC_API_KEY=.*$/m, 'ANTHROPIC_API_KEY=user-key');
    writeFileSync(envPath, stale, 'utf8');

    await AgentInit.run([target, '--skip-docker-check', '--no-start', '--force']);

    expect(envLines(target, 'MJ_VERSION')).toEqual([`MJ_VERSION=${cliVersion}`]);
    expect(envLines(target, 'ANTHROPIC_API_KEY')).toEqual(['ANTHROPIC_API_KEY=user-key']);
  });

  it('appends MJ_VERSION and COMPOSE_PROJECT_NAME to an existing .env that predates them', async () => {
    const target = path.join(tempDir, 'legacy-env-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    const envPath = path.join(target, '.env');
    writeFileSync(envPath, 'DB_PORT=1433', 'utf8'); // no MJ_VERSION, no trailing newline

    await AgentInit.run([target, '--skip-docker-check', '--no-start', '--force']);

    expect(readFileSync(envPath, 'utf8')).toBe(
      `DB_PORT=1433\nMJ_VERSION=${cliVersion}\nCOMPOSE_PROJECT_NAME=mj-legacy-env-workspace\n`
    );
  });

  it('--app replaces only the active OPEN_APP_INSTALL_URL, not the commented example', async () => {
    const target = path.join(tempDir, 'app-url-workspace');
    const customUrl = 'https://github.com/example-org/sample-data';
    await AgentInit.run([target, '--skip-docker-check', '--no-start', '--app', customUrl]);

    const env = readFileSync(path.join(target, '.env'), 'utf8');
    expect(envLines(target, 'OPEN_APP_INSTALL_URL')).toEqual([`OPEN_APP_INSTALL_URL=${customUrl}`]);
    expect(env).toMatch(/^# OPEN_APP_INSTALL_URL=/m);
  });

  it('--skip-docker-check assumes Docker is available rather than absent', async () => {
    const logSpy = vi.spyOn(AgentInit.prototype, 'log').mockImplementation(() => undefined);
    const target = path.join(tempDir, 'skip-docker-check-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('Start your local environment');
    expect(output).not.toContain('Launch Docker Desktop');
  });

  it('respects --no-start flag without error', async () => {
    const target = path.join(tempDir, 'no-start-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    expect(existsSync(path.join(target, 'AGENTS.md'))).toBe(true);
    expect(existsSync(path.join(target, 'docker-compose.yml'))).toBe(true);
  });

  it('skips automatic Docker startup when no LLM API key is configured and --start is not passed', async () => {
    const logSpy = vi.spyOn(AgentInit.prototype, 'log').mockImplementation(() => undefined);
    const target = path.join(tempDir, 'no-llm-key-workspace');

    await AgentInit.run([target, '--skip-docker-check']);

    expect(execSyncMock).not.toHaveBeenCalledWith('docker compose up -d', expect.anything());
    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('no LLM API key is configured');
    expect(output).toContain('http://localhost:4202');
    expect(output).toContain('http://localhost:4000');
  });

  it('starts Docker automatically when an LLM API key is configured in env', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-123';
    const logSpy = vi.spyOn(AgentInit.prototype, 'log').mockImplementation(() => undefined);
    const target = path.join(tempDir, 'with-llm-key-workspace');

    await AgentInit.run([target, '--skip-docker-check']);

    expect(execSyncMock).toHaveBeenCalledWith('docker compose up -d', expect.objectContaining({ cwd: target }));
    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('Your MemberJunction local instance is running');
  });

  it('starts Docker when --start is explicitly passed even without an LLM API key', async () => {
    const target = path.join(tempDir, 'explicit-start-workspace');

    await AgentInit.run([target, '--skip-docker-check', '--start']);

    expect(execSyncMock).toHaveBeenCalledWith('docker compose up -d', expect.objectContaining({ cwd: target }));
  });

  it('prints resolved EXPLORER_PORT and API_PORT from .env in Next Steps', async () => {
    const target = path.join(tempDir, 'custom-ports-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    const envPath = path.join(target, '.env');
    const updatedEnv = readFileSync(envPath, 'utf8')
      .replace(/^EXPLORER_PORT=.*$/m, 'EXPLORER_PORT=4209')
      .replace(/^API_PORT=.*$/m, 'API_PORT=4009');
    writeFileSync(envPath, updatedEnv, 'utf8');

    const logSpy = vi.spyOn(AgentInit.prototype, 'log').mockImplementation(() => undefined);
    await AgentInit.run([target, '--skip-docker-check', '--no-start', '--force']);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('http://localhost:4209');
    expect(output).toContain('http://localhost:4009');
  });

  it('warns when running multiple stacks with less than 16 GB Docker RAM', async () => {
    const twelveGb = String(12 * 1024 * 1024 * 1024);
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes('MemTotal')) {
        return Buffer.from(twelveGb);
      }
      if (cmd === 'docker ps -q') {
        return Buffer.from('abc123\ndef456\n');
      }
      return Buffer.from('');
    });

    const logSpy = vi.spyOn(AgentInit.prototype, 'log').mockImplementation(() => undefined);
    const target = path.join(tempDir, 'multi-stack-ram-workspace');
    await AgentInit.run([target, '--no-start']);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('2 container(s) already running');
    expect(output).toContain('< 16 GB RAM');
  });
});
