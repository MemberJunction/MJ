/**
 * ValidationService over temp folders: --dir at an entity folder, pushWhen rules.
 * Metadata finds no entities, so every validated folder reports "not found in metadata".
 * That error shows which folders were validated.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockMetadata {
    public EntityByName(): null {
      return null;
    }
  }
  return { ...actual, Metadata: MockMetadata };
});

import { ValidationService } from '../services/ValidationService';

describe('ValidationService.ValidateDirectory — entity folders and pushWhen', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-validate-pw-'));
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0', directoryOrder: ['open', 'gated'] });
    await entityFolder('open', {});
    await entityFolder('gated', { pushWhen: '@env:MJ_VALIDATE_GATE' });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.remove(root);
  });

  async function entityFolder(name: string, extra: Record<string, unknown>): Promise<void> {
    const dir = path.join(root, name);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, '.mj-sync.json'), { entity: `Entity ${name}`, ...extra });
  }

  function validatedEntities(messages: string[]): string[] {
    return messages.filter((m) => m.includes('not found in metadata')).sort();
  }

  async function validate(dir: string, honorPushWhen: boolean, validateChildFoldersOnly = false): Promise<string[]> {
    const result = await new ValidationService({
      HonorPushWhen: honorPushWhen,
      ValidateChildFoldersOnly: validateChildFoldersOnly,
    }).ValidateDirectory(dir);
    return result.errors.map((e) => e.message);
  }

  it('validates every folder when HonorPushWhen is off', async () => {
    expect(validatedEntities(await validate(root, false))).toEqual([
      'Entity "Entity gated" not found in metadata',
      'Entity "Entity open" not found in metadata',
    ]);
  });

  it('does not validate a folder that push would skip', async () => {
    expect(validatedEntities(await validate(root, true))).toEqual(['Entity "Entity open" not found in metadata']);
  });

  it('validates a gated folder whose variable is true', async () => {
    vi.stubEnv('MJ_VALIDATE_GATE', 'true');

    expect(validatedEntities(await validate(root, true))).toHaveLength(2);
  });

  it('validates the folder itself when given an entity folder', async () => {
    expect(validatedEntities(await validate(path.join(root, 'open'), false))).toEqual([
      'Entity "Entity open" not found in metadata',
    ]);
  });

  it('validates only the child folders of an entity folder when ValidateChildFoldersOnly is on', async () => {
    const childDir = path.join(root, 'open', 'child');
    await fs.ensureDir(childDir);
    await fs.writeJson(path.join(childDir, '.mj-sync.json'), { entity: 'Entity child' });

    expect(validatedEntities(await validate(path.join(root, 'open'), false, true))).toEqual([
      'Entity "Entity child" not found in metadata',
    ]);
  });

  it('validates nothing when given an entity folder that push would skip', async () => {
    expect(await validate(path.join(root, 'gated'), true)).toEqual([]);
  });

  it('reports a non-string pushWhen as an error', async () => {
    await entityFolder('gated', { pushWhen: true });

    expect((await validate(root, true)).some((m) => m.includes('pushWhen must be a string'))).toBe(true);
  });

  it('reports a ?optional pushWhen as an error', async () => {
    await entityFolder('gated', { pushWhen: '@env:MJ_VALIDATE_GATE?optional' });

    expect((await validate(root, true)).some((m) => m.includes('cannot use ?optional'))).toBe(true);
  });

  it('reports a malformed pushWhen as an error', async () => {
    await entityFolder('gated', { pushWhen: 'MJ_VALIDATE_GATE' });

    expect((await validate(root, true)).some((m) => m.includes('must be an @env: reference'))).toBe(true);
  });

  it('reports an unreadable folder config as one error without throwing', async () => {
    const gatedConfig = path.join(root, 'gated', '.mj-sync.json');
    await fs.writeFile(gatedConfig, '{ not json');

    const result = await new ValidationService({ HonorPushWhen: true }).ValidateDirectory(root);

    const configErrors = result.errors.filter((e) => e.file === gatedConfig);
    expect(configErrors).toHaveLength(1);
    expect(configErrors[0].message).toMatch(/^Cannot read \.mj-sync\.json: /);
    expect(configErrors[0].message).not.toContain(gatedConfig);
  });

  it('warns about a pushWhen in a nested folder', async () => {
    const childDir = path.join(root, 'open', 'child');
    await fs.ensureDir(childDir);
    await fs.writeJson(path.join(childDir, '.mj-sync.json'), { entity: 'Entity child', pushWhen: '@env:MJ_VALIDATE_GATE' });

    const nested = (await new ValidationService({}).ValidateDirectory(root)).warnings.filter((w) =>
      w.message.includes('nested folder')
    );
    expect(nested).toHaveLength(1);
    expect(nested[0].file).toBe(path.join(childDir, '.mj-sync.json'));

    const direct = await new ValidationService({}).ValidateDirectory(childDir);
    expect(direct.warnings.filter((w) => w.message.includes('nested folder'))).toEqual([]);
  });

  it('reports pushWhen in the root config as an error', async () => {
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0', pushWhen: '@env:MJ_VALIDATE_GATE' });

    expect((await validate(root, false)).some((m) => m.includes('only allowed in an entity folder'))).toBe(true);
  });
});
