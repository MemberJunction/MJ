import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AgentInit from '../commands/agent/init.js';

const cliVersion: string = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
).version;

const envLines = (target: string, key: string): string[] =>
  readFileSync(path.join(target, '.env'), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith(`${key}=`));

describe('AgentInit Command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'mj-agent-init-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('scaffolds citizen-builder workspace into target directory', async () => {
    const target = path.join(tempDir, 'workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    expect(existsSync(path.join(target, 'AGENTS.md'))).toBe(true);
    expect(existsSync(path.join(target, 'README.md'))).toBe(true);
    expect(existsSync(path.join(target, 'docker-compose.yml'))).toBe(true);
    expect(existsSync(path.join(target, '.env'))).toBe(true);
    expect(existsSync(path.join(target, 'metadata', 'agents', '.customer-insight-agent.json'))).toBe(true);
    expect(existsSync(path.join(target, '.agents', 'skills', 'new-agent', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(target, '.agents', 'skills', 'test-agent', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(target, '.agents', 'skills', 'package-agent', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(target, 'docs', 'ENTERPRISE_ORG_SETUP.md'))).toBe(true);
  });

  it('customizes OPEN_APP_INSTALL_URL when --app flag is passed', async () => {
    const target = path.join(tempDir, 'custom-app-workspace');
    const customUrl = 'https://github.com/example-org/sample-data';

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
    expect(read('docker-compose.yml')).toContain('image: "mj-citizen-builder:${MJ_VERSION:?');
    expect(read('docker-compose.yml')).toContain('MJ_VERSION: "${MJ_VERSION}"');
    expect(read('docker', 'Dockerfile')).toContain('npm install -g "@memberjunction/cli@${MJ_VERSION}"');
    expect(read('scripts', 'docker-entrypoint.sh')).toContain('--tag "v${MJ_VERSION}"');
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

  it('appends MJ_VERSION to an existing .env that predates it', async () => {
    const target = path.join(tempDir, 'legacy-env-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    const envPath = path.join(target, '.env');
    writeFileSync(envPath, 'DB_PORT=1433', 'utf8'); // no MJ_VERSION, no trailing newline

    await AgentInit.run([target, '--skip-docker-check', '--no-start', '--force']);

    expect(readFileSync(envPath, 'utf8').startsWith(`DB_PORT=1433\nMJ_VERSION=${cliVersion}\n`)).toBe(true);
    expect(envLines(target, 'DB_PORT')).toEqual(['DB_PORT=1433']); // an existing .env keeps its ports
  });

  it('--app replaces the active OPEN_APP_INSTALL_URL instead of adding a second one', async () => {
    const target = path.join(tempDir, 'app-url-workspace');
    const customUrl = 'https://github.com/example-org/sample-data';
    await AgentInit.run([target, '--skip-docker-check', '--no-start', '--app', customUrl]);

    expect(envLines(target, 'OPEN_APP_INSTALL_URL')).toEqual([`OPEN_APP_INSTALL_URL=${customUrl}`]);
  });

  it('--skip-docker-check assumes Docker is available rather than absent', async () => {
    const logSpy = vi.spyOn(AgentInit.prototype, 'log').mockImplementation(() => undefined);
    const target = path.join(tempDir, 'skip-docker-check-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('Start your local environment');
    expect(output).not.toContain('Launch Docker Desktop');
  });

  it('makes the helper scripts executable', async () => {
    const target = path.join(tempDir, 'exec-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    for (const script of ['docker-entrypoint.sh', 'sync-metadata.sh', 'restart-api.sh', 'query-run-history.sh', 'generate-capabilities.sh']) {
      const mode = statSync(path.join(target, 'scripts', script)).mode;
      expect(mode & 0o111, script).not.toBe(0);
    }
  });

  it('gives each workspace its own Compose project name, so workspaces never share a database', async () => {
    const first = path.join(tempDir, 'same-name');
    const second = path.join(tempDir, 'nested', 'same-name');
    await AgentInit.run([first, '--skip-docker-check', '--no-start']);
    await AgentInit.run([second, '--skip-docker-check', '--no-start']);

    const [firstName] = envLines(first, 'COMPOSE_PROJECT_NAME');
    const [secondName] = envLines(second, 'COMPOSE_PROJECT_NAME');
    expect(firstName).toMatch(/^COMPOSE_PROJECT_NAME=mj-same-name-[0-9a-f]{6}$/);
    expect(secondName).toMatch(/^COMPOSE_PROJECT_NAME=mj-same-name-[0-9a-f]{6}$/);
    expect(firstName).not.toBe(secondName);
  });

  it('keeps an existing Compose project name on --force, so the workspace keeps its data', async () => {
    const target = path.join(tempDir, 'keep-project');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);
    const before = envLines(target, 'COMPOSE_PROJECT_NAME');

    await AgentInit.run([target, '--skip-docker-check', '--no-start', '--force']);

    expect(envLines(target, 'COMPOSE_PROJECT_NAME')).toEqual(before);
  });

  it('generates a valid 32-byte encryption key', async () => {
    const target = path.join(tempDir, 'key-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    const [line] = envLines(target, 'MJ_BASE_ENCRYPTION_KEY');
    const key = line.slice('MJ_BASE_ENCRYPTION_KEY='.length);
    expect(Buffer.from(key, 'base64')).toHaveLength(32);
  });

  it('replaces the old 24-byte placeholder key but keeps a valid key the user set', async () => {
    const target = path.join(tempDir, 'legacy-key-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);
    const envPath = path.join(target, '.env');

    writeFileSync(envPath, readFileSync(envPath, 'utf8').replace(/^MJ_BASE_ENCRYPTION_KEY=.*$/m, 'MJ_BASE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef'), 'utf8');
    await AgentInit.run([target, '--skip-docker-check', '--no-start', '--force']);
    const [regenerated] = envLines(target, 'MJ_BASE_ENCRYPTION_KEY');
    expect(regenerated).not.toContain('0123456789abcdef0123456789abcdef');
    expect(Buffer.from(regenerated.slice('MJ_BASE_ENCRYPTION_KEY='.length), 'base64')).toHaveLength(32);

    const userKey = Buffer.alloc(32, 7).toString('base64');
    writeFileSync(envPath, readFileSync(envPath, 'utf8').replace(/^MJ_BASE_ENCRYPTION_KEY=.*$/m, `MJ_BASE_ENCRYPTION_KEY=${userKey}`), 'utf8');
    await AgentInit.run([target, '--skip-docker-check', '--no-start', '--force']);
    expect(envLines(target, 'MJ_BASE_ENCRYPTION_KEY')).toEqual([`MJ_BASE_ENCRYPTION_KEY=${userKey}`]);
  });

  it('writes a port for each published service', async () => {
    const target = path.join(tempDir, 'ports-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    for (const key of ['DB_PORT', 'API_PORT', 'EXPLORER_PORT']) {
      const lines = envLines(target, key);
      expect(lines, key).toHaveLength(1);
      expect(lines[0]).toMatch(new RegExp(`^${key}=\\d+$`));
    }
  });

  it('lists the settings the user still has to supply', async () => {
    const logSpy = vi.spyOn(AgentInit.prototype, 'log').mockImplementation(() => undefined);
    const target = path.join(tempDir, 'checklist-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('AI provider key');
    expect(output).toContain('OWNER_EMAIL');
    expect(output).toContain('ENTRA_* or AUTH0_*');
  });

  it('respects --no-start flag without error', async () => {
    const target = path.join(tempDir, 'no-start-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    expect(existsSync(path.join(target, 'AGENTS.md'))).toBe(true);
    expect(existsSync(path.join(target, 'docker-compose.yml'))).toBe(true);
  });
});

