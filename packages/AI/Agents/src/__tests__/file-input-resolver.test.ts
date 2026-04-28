import { describe, it, expect } from 'vitest';
import { ResolveFileInputStrategy } from '../file-input-resolver';
import { FileCapabilities } from '@memberjunction/ai';

function makeCaps(overrides: Partial<FileCapabilities> = {}): FileCapabilities {
  return {
    SupportedMimeTypes: ['image/*', 'application/pdf'],
    MaxFileSize: 32 * 1024 * 1024,
    MaxFilesPerRequest: 5,
    HasFileAPI: false,
    ...overrides,
  };
}

describe('ResolveFileInputStrategy', () => {
  it('forceNativeFileInput=true forces native input even with null capabilities', () => {
    const result = ResolveFileInputStrategy('image/png', 100, null, true, 0);
    expect(result.UseNativeFileInput).toBe(true);
    expect(result.UseFileAPI).toBe(false);
    expect(result.Reason).toContain('forced on');
  });

  it('forceNativeFileInput=true with capabilities propagates HasFileAPI', () => {
    const result = ResolveFileInputStrategy('image/png', 100, makeCaps({ HasFileAPI: true }), true, 0);
    expect(result.UseNativeFileInput).toBe(true);
    expect(result.UseFileAPI).toBe(true);
  });

  it('forceNativeFileInput=false forces artifact tools', () => {
    const result = ResolveFileInputStrategy('image/png', 100, makeCaps(), false, 0);
    expect(result.UseNativeFileInput).toBe(false);
    expect(result.Reason).toContain('forced off');
  });

  it('null capabilities returns artifact tools', () => {
    const result = ResolveFileInputStrategy('image/png', 100, null, null, 0);
    expect(result.UseNativeFileInput).toBe(false);
    expect(result.Reason).toBe('Driver does not support file input');
  });

  it('MIME type matching: image/png matches image/* pattern', () => {
    const result = ResolveFileInputStrategy('image/png', 100, makeCaps(), null, 0);
    expect(result.UseNativeFileInput).toBe(true);
  });

  it('MIME type mismatch: audio/mp3 not in [image/*, application/pdf]', () => {
    const result = ResolveFileInputStrategy('audio/mp3', 100, makeCaps(), null, 0);
    expect(result.UseNativeFileInput).toBe(false);
    expect(result.Reason).toContain("MIME type 'audio/mp3' not in supported types");
  });

  it('file size exceeds MaxFileSize returns artifact tools', () => {
    const caps = makeCaps({ MaxFileSize: 10_000_000 });
    const result = ResolveFileInputStrategy('image/png', 20_000_000, caps, null, 0);
    expect(result.UseNativeFileInput).toBe(false);
    expect(result.Reason).toContain('exceeds max file size');
  });

  it('file count at MaxFilesPerRequest returns artifact tools', () => {
    const result = ResolveFileInputStrategy('image/png', 100, makeCaps(), null, 5);
    expect(result.UseNativeFileInput).toBe(false);
    expect(result.Reason).toContain('already at or above max');
  });

  it('all constraints pass returns native input', () => {
    const result = ResolveFileInputStrategy('application/pdf', 1000, makeCaps(), null, 2);
    expect(result.UseNativeFileInput).toBe(true);
    expect(result.UseFileAPI).toBe(false);
    expect(result.Reason).toBe('All file input constraints satisfied');
  });

  it('HasFileAPI propagates when all constraints pass', () => {
    const caps = makeCaps({ HasFileAPI: true });
    const result = ResolveFileInputStrategy('image/png', 1000, caps, null, 0);
    expect(result.UseNativeFileInput).toBe(true);
    expect(result.UseFileAPI).toBe(true);
  });

  it('exact MIME type match works', () => {
    const caps = makeCaps({ SupportedMimeTypes: ['text/csv'] });
    const result = ResolveFileInputStrategy('text/csv', 100, caps, null, 0);
    expect(result.UseNativeFileInput).toBe(true);
  });

  it('MIME matching is case-insensitive', () => {
    const caps = makeCaps({ SupportedMimeTypes: ['Image/*'] });
    const result = ResolveFileInputStrategy('IMAGE/PNG', 100, caps, null, 0);
    expect(result.UseNativeFileInput).toBe(true);
  });
});
