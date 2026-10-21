/**
 * ValidationService leaves out the folders that push leaves out: dot folders and the root
 * ignoreDirectories. Metadata finds no entities, so each validated folder gives a
 * "not found in metadata" error.
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
import { IsIgnoredDirectoryName } from '../lib/ignore-directories';

describe('IsIgnoredDirectoryName', () => {
  it('matches an exact name or a name that ends with the pattern', () => {
    expect(IsIgnoredDirectoryName('archive', ['archive'])).toBe(true);
    expect(IsIgnoredDirectoryName('old-archive', ['archive'])).toBe(true);
    expect(IsIgnoredDirectoryName('archived', ['archive'])).toBe(false);
    expect(IsIgnoredDirectoryName('archive', undefined)).toBe(false);
  });
});

describe('ValidationService — ignoreDirectories', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-validate-ignore-'));
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0', ignoreDirectories: ['scratch', '-old'] });
    for (const name of ['tags', 'scratch', 'tags-old', 'node_modules', '.cache']) {
      await fs.ensureDir(path.join(root, name));
      await fs.writeJson(path.join(root, name, '.mj-sync.json'), { entity: `Entity ${name}` });
    }
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  it('validates the folders push visits: no dot folders, none that match ignoreDirectories', async () => {
    const result = await new ValidationService({}).ValidateDirectory(root);

    expect(result.errors.map((e) => e.message).filter((m) => m.includes('not found in metadata'))).toEqual([
      'Entity "Entity node_modules" not found in metadata',
      'Entity "Entity tags" not found in metadata',
    ]);
  });
});
