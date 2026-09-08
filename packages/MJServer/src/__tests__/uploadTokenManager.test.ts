import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UploadTokenManager } from '../rest/UploadTokenManager.js';

describe('UploadTokenManager', () => {
  beforeEach(() => {
    UploadTokenManager.Instance.Clear();
    UploadTokenManager.Instance.maxFileSizeBytes = 100 * 1024 * 1024;
    UploadTokenManager.Instance.maxPoolMemoryBytes = 500 * 1024 * 1024;
  });

  it('stages and consumes a buffer atomically', () => {
    const buf = Buffer.from('hello world raw binary', 'utf-8');
    const token = UploadTokenManager.Instance.Stage({
      buffer: buf,
      fileName: 'test.txt',
      mimeType: 'text/plain',
      userId: 'user-123',
    });

    expect(token).toMatch(/^upt_[a-f0-9]{64}$/);
    expect(UploadTokenManager.Instance.ActiveCount).toBe(1);
    expect(UploadTokenManager.Instance.TotalMemoryBytes).toBe(buf.length);

    // Consume with matching user
    const consumed = UploadTokenManager.Instance.Consume(token, 'user-123');
    expect(consumed).not.toBeNull();
    expect(consumed?.buffer.toString('utf-8')).toBe('hello world raw binary');
    expect(consumed?.fileName).toBe('test.txt');
    expect(consumed?.mimeType).toBe('text/plain');

    // Single-use: consuming again must return null
    expect(UploadTokenManager.Instance.Consume(token, 'user-123')).toBeNull();
    expect(UploadTokenManager.Instance.ActiveCount).toBe(0);
    expect(UploadTokenManager.Instance.TotalMemoryBytes).toBe(0);
  });

  it('rejects claim by a different user and evicts token', () => {
    const buf = Buffer.from('secret payload', 'utf-8');
    const token = UploadTokenManager.Instance.Stage({
      buffer: buf,
      fileName: 'secret.pdf',
      mimeType: 'application/pdf',
      userId: 'user-authorized',
    });

    // Claim attempt by attacker
    const result = UploadTokenManager.Instance.Consume(token, 'user-attacker');
    expect(result).toBeNull();

    // Token must be evicted after failed attempt
    expect(UploadTokenManager.Instance.ActiveCount).toBe(0);
    expect(UploadTokenManager.Instance.Consume(token, 'user-authorized')).toBeNull();
  });

  it('enforces single file size limit', () => {
    UploadTokenManager.Instance.maxFileSizeBytes = 10;
    const buf = Buffer.alloc(20);

    expect(() => {
      UploadTokenManager.Instance.Stage({
        buffer: buf,
        fileName: 'huge.dat',
        mimeType: 'application/octet-stream',
        userId: 'user-123',
      });
    }).toThrow(/exceeds maximum allowed file size/);
  });

  it('enforces pool memory capacity limit', () => {
    UploadTokenManager.Instance.maxPoolMemoryBytes = 50;

    UploadTokenManager.Instance.Stage({
      buffer: Buffer.alloc(30),
      fileName: 'file1.dat',
      mimeType: 'application/octet-stream',
      userId: 'user-123',
    });

    expect(() => {
      UploadTokenManager.Instance.Stage({
        buffer: Buffer.alloc(30),
        fileName: 'file2.dat',
        mimeType: 'application/octet-stream',
        userId: 'user-123',
      });
    }).toThrow(/memory capacity reached/);
  });

  it('auto-evicts token after TTL expiry', async () => {
    vi.useFakeTimers();
    try {
      const buf = Buffer.from('ephemeral data');
      const token = UploadTokenManager.Instance.Stage({
        buffer: buf,
        fileName: 'temp.txt',
        mimeType: 'text/plain',
        userId: 'user-123',
        ttlSeconds: 5,
      });

      expect(UploadTokenManager.Instance.ActiveCount).toBe(1);

      // Fast-forward 6 seconds
      vi.advanceTimersByTime(6000);

      expect(UploadTokenManager.Instance.ActiveCount).toBe(0);
      expect(UploadTokenManager.Instance.Consume(token, 'user-123')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('normalizes UUIDs when verifying claiming user', () => {
    const buf = Buffer.from('uuid test data');
    const token = UploadTokenManager.Instance.Stage({
      buffer: buf,
      fileName: 'uuid.txt',
      mimeType: 'text/plain',
      userId: '4A68B0D7-49EE-4D56-82DE-92F66627EE2B',
    });

    // Claim with lowercase UUID
    const consumed = UploadTokenManager.Instance.Consume(token, '4a68b0d7-49ee-4d56-82de-92f66627ee2b');
    expect(consumed).not.toBeNull();
    expect(consumed?.buffer.toString('utf-8')).toBe('uuid test data');
  });

  it('enforces per-user memory quota independently of pool memory', () => {
    UploadTokenManager.Instance.maxPoolMemoryBytes = 500;
    UploadTokenManager.Instance.maxUserMemoryBytes = 40;

    // User A stages 30 bytes (OK)
    UploadTokenManager.Instance.Stage({
      buffer: Buffer.alloc(30),
      fileName: 'userA_1.dat',
      mimeType: 'application/octet-stream',
      userId: 'user-A',
    });

    // User A tries to stage another 20 bytes (exceeds 40 byte user quota)
    expect(() => {
      UploadTokenManager.Instance.Stage({
        buffer: Buffer.alloc(20),
        fileName: 'userA_2.dat',
        mimeType: 'application/octet-stream',
        userId: 'user-A',
      });
    }).toThrow(/Per-user upload memory quota reached/);

    // User B can still stage 30 bytes because User B has their own quota
    const tokenB = UploadTokenManager.Instance.Stage({
      buffer: Buffer.alloc(30),
      fileName: 'userB_1.dat',
      mimeType: 'application/octet-stream',
      userId: 'user-B',
    });
    expect(tokenB).toBeDefined();
  });
});
