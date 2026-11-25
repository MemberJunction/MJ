import { describe, it, expect } from 'vitest';
import { IsAzureBlobUrl } from '../lib/record-attachments/record-attachments.component';

describe('IsAzureBlobUrl (CodeQL js/incomplete-url-substring-sanitization)', () => {
  it('matches Azure Blob Storage upload URLs', () => {
    expect(IsAzureBlobUrl('https://acct.blob.core.windows.net/container/file.pdf?sv=2024&sig=x')).toBe(true);
  });

  it('does not match the domain in a path or query', () => {
    expect(IsAzureBlobUrl('https://s3.amazonaws.com/bucket/file.pdf?x=.blob.core.windows.net')).toBe(false);
    expect(IsAzureBlobUrl('https://acct.blob.core.windows.net.example.com/file.pdf')).toBe(false);
  });

  it('returns false for an unparseable URL', () => {
    expect(IsAzureBlobUrl('not a url')).toBe(false);
  });
});
