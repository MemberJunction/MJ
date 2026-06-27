import { describe, it, expect } from 'vitest';
import { ResolveFileInputStrategy } from '../file-input-resolver';
import { BaseLLM, FileCapabilities } from '@memberjunction/ai';

class NullCapabilitiesLLM extends BaseLLM {
  constructor() {
    super('fake-key');
  }
  protected async nonStreamingChatCompletion(): Promise<any> {
    throw new Error('not implemented');
  }
  public async ClassifyText(): Promise<any> {
    throw new Error('not implemented');
  }
  public async SummarizeText(): Promise<any> {
    throw new Error('not implemented');
  }
  protected async createStreamingRequest(): Promise<any> {
    throw new Error('not implemented');
  }
  protected processStreamingChunk(): any {
    throw new Error('not implemented');
  }
  protected finalizeStreamingResponse(): any {
    throw new Error('not implemented');
  }
}

class ImageAndPdfLLM extends NullCapabilitiesLLM {
  public override GetFileCapabilities(): FileCapabilities | null {
    return {
      SupportedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      MaxFileSize: 32 * 1024 * 1024,
      MaxFilesPerRequest: 5,
      HasFileAPI: false,
    };
  }
}

class FilesApiLLM extends NullCapabilitiesLLM {
  public override GetFileCapabilities(): FileCapabilities | null {
    return {
      SupportedMimeTypes: ['application/pdf', 'image/*', 'audio/*', 'video/*', 'text/*'],
      MaxFileSize: 20 * 1024 * 1024,
      MaxFilesPerRequest: 10,
      HasFileAPI: true,
    };
  }
}

describe('Driver FileCapabilities integration', () => {
  describe('BaseLLM default (no file support)', () => {
    const driver = new NullCapabilitiesLLM();
    it('GetFileCapabilities returns null', () => {
      expect(driver.GetFileCapabilities()).toBeNull();
    });
    it('resolver falls back to artifact tools', () => {
      const result = ResolveFileInputStrategy('image/png', 1000, driver.GetFileCapabilities(), null, 0);
      expect(result.UseNativeFileInput).toBe(false);
      expect(result.Reason).toBe('Driver does not support file input');
    });
  });

  describe('Anthropic-like driver (PDF + images, no File API)', () => {
    const driver = new ImageAndPdfLLM();
    it('accepts PDF natively', () => {
      const caps = driver.GetFileCapabilities();
      const result = ResolveFileInputStrategy('application/pdf', 5_000_000, caps, null, 0);
      expect(result.UseNativeFileInput).toBe(true);
      expect(result.UseFileAPI).toBe(false);
    });
    it('accepts image/png natively', () => {
      const caps = driver.GetFileCapabilities();
      const result = ResolveFileInputStrategy('image/png', 1_000_000, caps, null, 0);
      expect(result.UseNativeFileInput).toBe(true);
    });
    it('rejects Excel (unsupported MIME)', () => {
      const caps = driver.GetFileCapabilities();
      const result = ResolveFileInputStrategy('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1000, caps, null, 0);
      expect(result.UseNativeFileInput).toBe(false);
      expect(result.Reason).toContain('not in supported types');
    });
    it('rejects file over 32MB', () => {
      const caps = driver.GetFileCapabilities();
      const result = ResolveFileInputStrategy('image/png', 40 * 1024 * 1024, caps, null, 0);
      expect(result.UseNativeFileInput).toBe(false);
      expect(result.Reason).toContain('exceeds max file size');
    });
    it('rejects 6th file (max 5)', () => {
      const caps = driver.GetFileCapabilities();
      const result = ResolveFileInputStrategy('image/png', 1000, caps, null, 5);
      expect(result.UseNativeFileInput).toBe(false);
      expect(result.Reason).toContain('already at or above max');
    });
  });

  describe('Gemini-like driver (broad MIME, Files API)', () => {
    const driver = new FilesApiLLM();
    it('accepts audio with HasFileAPI=true', () => {
      const caps = driver.GetFileCapabilities();
      const result = ResolveFileInputStrategy('audio/mp3', 5_000_000, caps, null, 0);
      expect(result.UseNativeFileInput).toBe(true);
      expect(result.UseFileAPI).toBe(true);
    });
    it('accepts video natively', () => {
      const caps = driver.GetFileCapabilities();
      const result = ResolveFileInputStrategy('video/mp4', 10_000_000, caps, null, 0);
      expect(result.UseNativeFileInput).toBe(true);
      expect(result.UseFileAPI).toBe(true);
    });
    it('accepts text/csv', () => {
      const caps = driver.GetFileCapabilities();
      const result = ResolveFileInputStrategy('text/csv', 500, caps, null, 0);
      expect(result.UseNativeFileInput).toBe(true);
    });
    it('rejects application/zip', () => {
      const caps = driver.GetFileCapabilities();
      const result = ResolveFileInputStrategy('application/zip', 1000, caps, null, 0);
      expect(result.UseNativeFileInput).toBe(false);
    });
  });

  describe('prompt-level override vs driver capabilities', () => {
    it('forceNativeFileInput=false overrides capable driver', () => {
      const driver = new ImageAndPdfLLM();
      const result = ResolveFileInputStrategy('image/png', 1000, driver.GetFileCapabilities(), false, 0);
      expect(result.UseNativeFileInput).toBe(false);
      expect(result.Reason).toContain('forced off');
    });
    it('forceNativeFileInput=true overrides null-capability driver', () => {
      const driver = new NullCapabilitiesLLM();
      const result = ResolveFileInputStrategy('image/png', 1000, driver.GetFileCapabilities(), true, 0);
      expect(result.UseNativeFileInput).toBe(true);
      expect(result.UseFileAPI).toBe(false);
    });
  });
});
