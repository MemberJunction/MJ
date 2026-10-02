import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LocalArtifactPath, ResolveLocalArtifactBaseDir } from '../artifact-store';
import { LocalArtifactLoader } from '../../scoring/artifact-loader';

/**
 * Tests for the local-disk reader that keeps models trained before #4991 scoring.
 * Those models' bytes were written to `<baseDir>/<file.ID>.bin` on the training
 * host; new artifacts go to the storage provider (see `storage-artifact.test.ts`).
 * NO DB, NO sidecar — bytes live in a scratch directory.
 */

describe('LocalArtifactLoader — reads pre-#4991 artifacts', () => {
  it('returns the exact bytes stored at <baseDir>/<fileId>.bin', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'mj-ps-artifact-legacy-'));
    try {
      const fileId = 'A1B2C3D4-0000-0000-0000-000000000001';
      const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 42, 7]);
      await writeFile(LocalArtifactPath(baseDir, fileId), bytes);

      const loaded = await new LocalArtifactLoader(baseDir).load(fileId);
      expect(Array.from(loaded ?? [])).toEqual(Array.from(bytes));
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});

describe('LocalArtifactLoader — missing files return null', () => {
  it('returns null for an id with no file in the base dir', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'mj-ps-artifact-empty-'));
    try {
      const loaded = await new LocalArtifactLoader(baseDir).load('A1B2C3D4-0000-0000-0000-000000000000');
      expect(loaded).toBeNull();
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it('returns null (not throws) when the base dir itself does not exist', async () => {
    const baseDir = join(tmpdir(), 'mj-ps-artifact-missing-dir', 'never-created');
    const loaded = await new LocalArtifactLoader(baseDir).load('A1B2C3D4-0000-0000-0000-000000000000');
    expect(loaded).toBeNull();
  });
});

describe('local artifact path + base dir resolution', () => {
  it('localArtifactPath builds <baseDir>/<fileId>.bin', () => {
    expect(LocalArtifactPath('/base', 'abc-123')).toBe(join('/base', 'abc-123.bin'));
  });

  it('resolveLocalArtifactBaseDir honors PS_ARTIFACT_DIR, else os tmpdir', () => {
    const prev = process.env.PS_ARTIFACT_DIR;
    try {
      process.env.PS_ARTIFACT_DIR = '/custom/ps/artifacts';
      expect(ResolveLocalArtifactBaseDir()).toBe('/custom/ps/artifacts');

      delete process.env.PS_ARTIFACT_DIR;
      expect(ResolveLocalArtifactBaseDir()).toBe(join(tmpdir(), 'mj-ps-artifacts'));
    } finally {
      if (prev === undefined) {
        delete process.env.PS_ARTIFACT_DIR;
      } else {
        process.env.PS_ARTIFACT_DIR = prev;
      }
    }
  });
});
