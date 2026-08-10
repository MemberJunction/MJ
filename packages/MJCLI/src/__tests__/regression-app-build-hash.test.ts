import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { computeAppBuildHash, gitRevisionShort } from '../lib/regression/docker-helpers.js';

// The test process runs inside the MJ git repo, so gitRevisionShort resolves
// against a real repo; a fresh tmp dir is outside any repo for the null path.
const REPO_DIR = process.cwd();

describe('gitRevisionShort', () => {
  it('returns a 12-char short SHA (optionally -dirty) inside the repo', () => {
    const rev = gitRevisionShort(REPO_DIR);
    expect(rev).not.toBeNull();
    expect(rev).toMatch(/^[0-9a-f]{12}(-dirty)?$/);
  });

  it('returns null when the directory is not a git repo', () => {
    const orphan = mkdtempSync(path.join(tmpdir(), 'mj-nogit-'));
    try {
      expect(gitRevisionShort(orphan)).toBeNull();
    } finally {
      rmSync(orphan, { recursive: true, force: true });
    }
  });
});

describe('computeAppBuildHash', () => {
  it('composes <gitSha>:<schemaHash> inside the repo', () => {
    const hash = computeAppBuildHash(REPO_DIR);
    // git short SHA (12 hex, optional -dirty) : schema fingerprint (16 hex)
    expect(hash).toMatch(/^[0-9a-f]{12}(-dirty)?:[0-9a-f]{16}$/);
  });

  it('is deterministic for the same inputs', () => {
    expect(computeAppBuildHash(REPO_DIR)).toBe(computeAppBuildHash(REPO_DIR));
  });

  describe('graceful fallback when git is unavailable', () => {
    let orphan: string;
    beforeEach(() => { orphan = mkdtempSync(path.join(tmpdir(), 'mj-nogit-')); });
    afterEach(() => { rmSync(orphan, { recursive: true, force: true }); });

    it('falls back to the schema hash alone (no git segment, no empty prefix)', () => {
      const hash = computeAppBuildHash(orphan);
      // No repo → no "<sha>:" prefix; just the 16-hex schema fingerprint.
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
      expect(hash).not.toContain(':');
    });
  });
});
