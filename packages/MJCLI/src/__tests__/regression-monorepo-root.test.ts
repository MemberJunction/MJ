import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findMonorepoRoot, isInsideMonorepo } from '../lib/regression/docker-helpers.js';

const SENTINEL = 'docker/regression/docker-compose.test.yml';

describe('findMonorepoRoot', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'mj-root-'));
    mkdirSync(path.join(root, 'docker', 'regression'), { recursive: true });
    writeFileSync(path.join(root, SENTINEL), 'name: mj-regression\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds the root from the root directory itself', () => {
    expect(findMonorepoRoot(root)).toBe(root);
  });

  it('walks up from a nested subdirectory to the root', () => {
    const nested = path.join(root, 'packages', 'MJCLI', 'src');
    mkdirSync(nested, { recursive: true });
    expect(findMonorepoRoot(nested)).toBe(root);
  });

  it('returns null when no sentinel exists at or above the start dir', () => {
    const orphan = mkdtempSync(path.join(tmpdir(), 'mj-orphan-'));
    try {
      expect(findMonorepoRoot(orphan)).toBeNull();
    } finally {
      rmSync(orphan, { recursive: true, force: true });
    }
  });

  it('isInsideMonorepo mirrors findMonorepoRoot', () => {
    const nested = path.join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    expect(isInsideMonorepo(nested)).toBe(true);
    const orphan = mkdtempSync(path.join(tmpdir(), 'mj-orphan-'));
    try {
      expect(isInsideMonorepo(orphan)).toBe(false);
    } finally {
      rmSync(orphan, { recursive: true, force: true });
    }
  });
});
