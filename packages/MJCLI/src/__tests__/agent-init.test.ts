import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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
    await AgentInit.run([target, '--skip-docker-check']);

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
    const customUrl = 'https://github.com/BlueCypress/bc-sampledata';

    await AgentInit.run([target, '--skip-docker-check', '--app', customUrl]);

    const envContent = readFileSync(path.join(target, '.env'), 'utf8');
    expect(envContent).toContain(`OPEN_APP_INSTALL_URL=${customUrl}`);
  });

  it('does not overwrite existing workspace without --force', async () => {
    const target = path.join(tempDir, 'existing-workspace');
    await AgentInit.run([target, '--skip-docker-check']);

    // Overwrite AGENTS.md with custom text
    const customContent = '# My Custom Agents File';
    writeFileSync(path.join(target, 'AGENTS.md'), customContent, 'utf8');

    // Run again without --force
    await AgentInit.run([target, '--skip-docker-check']);

    // Content should NOT have been overwritten
    const currentContent = readFileSync(path.join(target, 'AGENTS.md'), 'utf8');
    expect(currentContent).toBe(customContent);

    // Run with --force
    await AgentInit.run([target, '--skip-docker-check', '--force']);

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

    expect(readFileSync(envPath, 'utf8')).toBe(`DB_PORT=1433\nMJ_VERSION=${cliVersion}\n`);
  });

  it('--app replaces only the active OPEN_APP_INSTALL_URL, not the commented example', async () => {
    const target = path.join(tempDir, 'app-url-workspace');
    const customUrl = 'https://github.com/example-org/sample-data';
    await AgentInit.run([target, '--skip-docker-check', '--no-start', '--app', customUrl]);

    const env = readFileSync(path.join(target, '.env'), 'utf8');
    expect(envLines(target, 'OPEN_APP_INSTALL_URL')).toEqual([`OPEN_APP_INSTALL_URL=${customUrl}`]);
    expect(env).toMatch(/^# OPEN_APP_INSTALL_URL=/m);
  });

  it('respects --no-start flag without error', async () => {
    const target = path.join(tempDir, 'no-start-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    expect(existsSync(path.join(target, 'AGENTS.md'))).toBe(true);
    expect(existsSync(path.join(target, 'docker-compose.yml'))).toBe(true);
  });
});

