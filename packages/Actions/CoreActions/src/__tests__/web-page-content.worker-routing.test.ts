/**
 * WebPageContentAction converts HTML and PDFs on the web-content worker thread when one is
 * available, and in-process otherwise (MJ #5510).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/global', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
  return { ...actual, RegisterClass: () => (target: unknown) => target };
});
vi.mock('@memberjunction/actions-base', () => ({}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));

const host = vi.hoisted(() => ({ available: true, run: vi.fn() }));
vi.mock('../custom/web/worker/WebContentWorkerHost', () => ({
  WebContentWorkerHost: {
    get Instance() {
      return {
        get IsAvailable() {
          return host.available;
        },
        Run: host.run,
      };
    },
  },
}));

import { WebPageContentAction } from '../custom/web/web-page-content.action';

type ProcessHtml = (r: Response, outputType: string, extractMain: boolean, includeMetadata: boolean, maxLength: number) => Promise<Record<string, unknown>>;
type ProcessPdf = (r: Response, outputType: string, includeMetadata: boolean, maxLength: number) => Promise<Record<string, unknown>>;

const action = new WebPageContentAction();
const processHtml: ProcessHtml = (...args) => (action as unknown as { processHtml: ProcessHtml }).processHtml(...args);
const processPdf: ProcessPdf = (...args) => (action as unknown as { processPdf: ProcessPdf }).processPdf(...args);

describe('WebPageContentAction — where conversion runs', () => {
  beforeEach(() => {
    host.available = true;
    host.run.mockReset();
  });

  it('sends HTML to the worker thread with the requested options and returns its result', async () => {
    host.run.mockResolvedValue({ detectedType: 'html', content: 'from worker' });
    const result = await processHtml(new Response('<h1>Hi</h1>'), 'markdown', true, false, 500);
    expect(host.run).toHaveBeenCalledWith({
      Kind: 'html',
      Html: '<h1>Hi</h1>',
      Options: { OutputType: 'markdown', ExtractMainContent: true, IncludeMetadata: false, MaxLength: 500 },
    });
    expect(result).toEqual({ detectedType: 'html', content: 'from worker' });
  });

  it('converts HTML in-process when the worker is unavailable', async () => {
    host.available = false;
    const result = await processHtml(new Response('<h1>Hi</h1>'), 'markdown', false, false, 500);
    expect(host.run).not.toHaveBeenCalled();
    expect(result).toEqual({ detectedType: 'html', outputType: 'markdown', extractMainContent: false, content: '# Hi' });
  });

  it('sends PDF bytes to the worker thread', async () => {
    host.run.mockResolvedValue({ detectedType: 'pdf', content: 'text' });
    await processPdf(new Response(new Uint8Array([37, 80, 68, 70])), 'text', true, 100);
    expect(host.run).toHaveBeenCalledWith({
      Kind: 'pdf',
      Data: new Uint8Array([37, 80, 68, 70]),
      Options: { OutputType: 'text', IncludeMetadata: true, MaxLength: 100 },
    });
  });
});
