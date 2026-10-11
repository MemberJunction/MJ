import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type AddressInfo, type Server } from 'node:net';
import {
  ChooseFreePort,
  ComposeProjectName,
  FormatGigabytes,
  GenerateEncryptionKey,
  IsPortFree,
  IsValidEncryptionKey,
  LEGACY_PLACEHOLDER_ENCRYPTION_KEY,
} from '../lib/agent-init-preflight.js';

describe('agent init preflight', () => {
  describe('IsValidEncryptionKey', () => {
    it('accepts 32 bytes, base64-encoded', () => {
      expect(IsValidEncryptionKey(Buffer.alloc(32, 1).toString('base64'))).toBe(true);
      expect(IsValidEncryptionKey(GenerateEncryptionKey())).toBe(true);
    });

    it('rejects the old placeholder, which decodes to 24 bytes', () => {
      expect(Buffer.from(LEGACY_PLACEHOLDER_ENCRYPTION_KEY, 'base64')).toHaveLength(24);
      expect(IsValidEncryptionKey(LEGACY_PLACEHOLDER_ENCRYPTION_KEY)).toBe(false);
    });

    it('rejects other lengths and non-base64 text', () => {
      expect(IsValidEncryptionKey(Buffer.alloc(16, 1).toString('base64'))).toBe(false);
      expect(IsValidEncryptionKey('not a key!')).toBe(false);
      expect(IsValidEncryptionKey('')).toBe(false);
    });
  });

  describe('ComposeProjectName', () => {
    it('is the folder name, slugged, plus the suffix', () => {
      expect(ComposeProjectName('/Users/pat/Documents/My Agents!', 'abc123')).toBe('mj-my-agents-abc123');
    });

    it('falls back when the folder name has no usable characters', () => {
      expect(ComposeProjectName('/tmp/!!!', 'abc123')).toBe('mj-workspace-abc123');
    });

    it('differs between two workspaces with the same folder name', () => {
      expect(ComposeProjectName('/a/agents')).not.toBe(ComposeProjectName('/b/agents'));
    });
  });

  describe('ChooseFreePort', () => {
    it('keeps the preferred port when it is free', async () => {
      expect(await ChooseFreePort(1433, new Set(), async () => true)).toBe(1433);
    });

    it('moves past ports in use and ports another service already claimed', async () => {
      const busy = new Set([1433, 1434]);
      const port = await ChooseFreePort(1433, new Set([1435]), async (p) => !busy.has(p));
      expect(port).toBe(1436);
    });

    it('gives up rather than searching forever', async () => {
      expect(await ChooseFreePort(1433, new Set(), async () => false)).toBeUndefined();
    });
  });

  describe('IsPortFree', () => {
    let server: Server | undefined;

    afterEach(async () => {
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
      server = undefined;
    });

    it('reports a port something is listening on as not free', async () => {
      server = createServer();
      const port = await new Promise<number>((resolve) => {
        server!.listen(0, '0.0.0.0', () => resolve((server!.address() as AddressInfo).port));
      });
      expect(await IsPortFree(port)).toBe(false);
    });

    it('reports a port as free once nothing listens on it', async () => {
      const probe = createServer();
      const port = await new Promise<number>((resolve) => {
        probe.listen(0, '0.0.0.0', () => resolve((probe.address() as AddressInfo).port));
      });
      await new Promise<void>((resolve) => probe.close(() => resolve()));
      expect(await IsPortFree(port)).toBe(true);
    });
  });

  it('FormatGigabytes rounds to one decimal', () => {
    expect(FormatGigabytes(16 * 1024 ** 3)).toBe('16.0 GB');
    expect(FormatGigabytes(20 * 1000 ** 3, 1000)).toBe('20.0 GB');
  });
});
