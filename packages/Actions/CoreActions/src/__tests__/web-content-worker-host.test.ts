/**
 * WebContentWorkerHost runs WebPageContentAction's HTML/PDF conversion on a worker thread so it
 * cannot block the event loop that serves requests (MJ #5510). These tests drive a real worker
 * thread running a fake converter (fixtures/fake-web-content-worker.mjs) that speaks the protocol.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { WebContentWorkerHost, WEB_CONTENT_IN_PROCESS_ENV } from '../custom/web/worker/WebContentWorkerHost';

const FAKE_WORKER = fileURLToPath(new URL('./fixtures/fake-web-content-worker.mjs', import.meta.url));
const OPTIONS = { OutputType: 'markdown', ExtractMainContent: false, IncludeMetadata: false, MaxLength: 1000 };
const convert = (page: string) => WebContentWorkerHost.Instance.Run({ Kind: 'html', Html: page, Options: OPTIONS });

describe('WebContentWorkerHost', () => {
  beforeEach(() => {
    delete process.env[WEB_CONTENT_IN_PROCESS_ENV];
    WebContentWorkerHost.Instance.UseScriptPath(FAKE_WORKER);
  });

  afterEach(async () => {
    await WebContentWorkerHost.Instance.Shutdown();
    WebContentWorkerHost.Instance.UseScriptPath(null);
    delete process.env[WEB_CONTENT_IN_PROCESS_ENV];
  });

  it('returns the result the worker produced', async () => {
    expect(await convert('<p>hi</p>')).toEqual({ length: 9 });
  });

  it('transfers PDF bytes to the worker', async () => {
    const data = new Uint8Array(1024);
    expect(
      await WebContentWorkerHost.Instance.Run({ Kind: 'pdf', Data: data, Options: { OutputType: 'text', IncludeMetadata: false, MaxLength: 10 } }),
    ).toEqual({ bytes: 1024 });
    expect(data.byteLength).toBe(0); // transferred, not copied
  });

  it("keeps the caller's event loop free while the worker converts", async () => {
    let worstLagMs = 0;
    let last = performance.now();
    const ticker = setInterval(() => {
      const now = performance.now();
      worstLagMs = Math.max(worstLagMs, now - last - 10);
      last = now;
    }, 10);
    try {
      await convert('BLOCK:600');
    } finally {
      clearInterval(ticker);
    }
    expect(worstLagMs).toBeLessThan(150);
  });

  it("rejects with the worker's error when conversion fails", async () => {
    await expect(convert('FAIL')).rejects.toThrow('parser exploded');
  });

  it('rejects a pending call when the worker dies, and starts a new worker for the next call', async () => {
    await expect(convert('CRASH')).rejects.toThrow(/Web content worker stopped/);
    expect(await convert('abc')).toEqual({ length: 3 });
  });

  it('disables itself after three worker deaths within a minute, so the action converts in-process', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(convert('CRASH')).rejects.toThrow(/Web content worker stopped/);
    }
    expect(WebContentWorkerHost.Instance.IsAvailable).toBe(false);
    expect(WebContentWorkerHost.Instance.DisabledReason).toMatch(/3 worker crashes/);
  });

  it('is unavailable when the worker script is missing, or when the in-process switch is on', () => {
    process.env[WEB_CONTENT_IN_PROCESS_ENV] = 'true';
    expect(WebContentWorkerHost.Instance.IsAvailable).toBe(false);
    delete process.env[WEB_CONTENT_IN_PROCESS_ENV];
    WebContentWorkerHost.Instance.UseScriptPath('/nonexistent/WebContentWorker.js');
    expect(WebContentWorkerHost.Instance.IsAvailable).toBe(false);
  });
});
