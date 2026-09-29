import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AgentInit from '../commands/agent/init.js';

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

  it('respects --no-start flag without error', async () => {
    const target = path.join(tempDir, 'no-start-workspace');
    await AgentInit.run([target, '--skip-docker-check', '--no-start']);

    expect(existsSync(path.join(target, 'AGENTS.md'))).toBe(true);
    expect(existsSync(path.join(target, 'docker-compose.yml'))).toBe(true);
  });
});

