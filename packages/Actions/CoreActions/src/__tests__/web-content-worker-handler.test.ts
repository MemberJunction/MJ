/**
 * The web-content worker's logic, run in-process: each call goes to the matching transform, and an
 * unknown call throws (the worker turns a throw into a failed response).
 */
import { describe, expect, it } from 'vitest';
import { HandleWebContentRequest } from '../custom/web/worker/WebContentWorkerHandler';

describe('HandleWebContentRequest', () => {
  it('converts an HTML call with its options', async () => {
    const answer = await HandleWebContentRequest({
      Kind: 'html',
      Html: '<h1>Hi</h1><p>there</p>',
      Options: { OutputType: 'markdown', ExtractMainContent: false, IncludeMetadata: false, MaxLength: 500 },
    });
    expect(answer.Result).toEqual({ detectedType: 'html', outputType: 'markdown', extractMainContent: false, content: '# Hi\n\nthere' });
    expect(answer.Transfer).toBeUndefined();
  });

  it('throws on an unknown call', async () => {
    await expect(HandleWebContentRequest({ Kind: 'docx' } as never)).rejects.toThrow('Unknown web-content worker call: docx');
  });
});
