import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GetShellScriptUrl,
  LoadSessionModule,
  PrefetchSession,
  ResetSessionLoads,
  ResetSessionPrefetches,
  ResolveSessionUrl,
  SESSION_CHUNK_FILE,
  SetSessionImporter,
  SetShellScriptUrl,
  CreateSessionFor,
  type SessionImporter
} from '../shell/session-loader';
import { SHELL_SESSION_CONTRACT_VERSION, type WidgetSessionHandle, type WidgetSessionModule } from '../shell/session-contract';
import { DefaultWidgetConfig } from '../lib/config';

/** A document with just what the loader reads. */
function fakeDoc(scripts: string[], baseURI = 'https://page.example.com/products/'): Document {
  return { baseURI, getElementsByTagName: () => scripts.map((src) => ({ src })) } as unknown as Document;
}

describe('locating the call chunk', () => {
  afterEach(() => SetShellScriptUrl(null));

  it('resolves the chunk beside the shell, so a CDN path needs no configuration', () => {
    SetShellScriptUrl('https://cdn.example.com/widget/v6.2.0/mj-realtime-widget.js');
    expect(ResolveSessionUrl(null, fakeDoc([]))).toBe(`https://cdn.example.com/widget/v6.2.0/${SESSION_CHUNK_FILE}`);
  });

  it('honours an explicit session-url, absolute or relative to the shell', () => {
    SetShellScriptUrl('https://cdn.example.com/widget/mj-realtime-widget.js');
    expect(ResolveSessionUrl('https://other.example.com/x/session.js', fakeDoc([]))).toBe('https://other.example.com/x/session.js');
    expect(ResolveSessionUrl('../v2/session.js', fakeDoc([]))).toBe('https://cdn.example.com/v2/session.js');
  });

  it('without a recorded URL finds the shell\'s own script tag, then falls back to the page', () => {
    expect(GetShellScriptUrl(fakeDoc(['https://x.example.com/a.js', 'https://cdn.example.com/w/mj-realtime-widget.min.js?v=3']))).toBe('https://cdn.example.com/w/mj-realtime-widget.min.js?v=3');
    expect(ResolveSessionUrl(null, fakeDoc(['https://cdn.example.com/w/mj-realtime-widget.js']))).toBe(`https://cdn.example.com/w/${SESSION_CHUNK_FILE}`);
    expect(ResolveSessionUrl(null, fakeDoc([]))).toBe(`https://page.example.com/products/${SESSION_CHUNK_FILE}`);
  });

  it('says what is wrong with a session-url that cannot be a URL', () => {
    SetShellScriptUrl('not a url at all');
    expect(() => ResolveSessionUrl(null, fakeDoc([]))).toThrow(/not a valid URL/);
  });
});

describe('loading the call module', () => {
  const sessionModule = (version = SHELL_SESSION_CONTRACT_VERSION): WidgetSessionModule => ({
    SESSION_CONTRACT_VERSION: version,
    CreateWidgetSession: async () => ({}) as WidgetSessionHandle
  });
  let restore: SessionImporter;
  beforeEach(() => ResetSessionLoads());
  afterEach(() => SetSessionImporter(restore));

  it('imports each URL once and shares the module between callers', async () => {
    const importer = vi.fn(async () => sessionModule());
    restore = SetSessionImporter(importer);
    const [a, b] = await Promise.all([LoadSessionModule('https://x/s.js'), LoadSessionModule('https://x/s.js')]);
    expect(a).toBe(b);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('refuses a call module that speaks a different contract, naming both versions', async () => {
    restore = SetSessionImporter(async () => sessionModule(99));
    await expect(LoadSessionModule('https://x/s.js')).rejects.toThrow(/contract 99.*speaks 1/);
  });

  it('forgets a failed load so the next attempt downloads again', async () => {
    const importer = vi.fn<SessionImporter>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(sessionModule());
    restore = SetSessionImporter(importer);
    await expect(LoadSessionModule('https://x/s.js')).rejects.toThrow('offline');
    await expect(LoadSessionModule('https://x/s.js')).resolves.toBeDefined();
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it('creates a session through the loaded module', async () => {
    const create = vi.fn(async () => ({}) as WidgetSessionHandle);
    restore = SetSessionImporter(async () => ({ SESSION_CONTRACT_VERSION: SHELL_SESSION_CONTRACT_VERSION, CreateWidgetSession: create }));
    await CreateSessionFor('https://x/s.js', { Config: DefaultWidgetConfig(), Nonce: 'n' });
    expect(create).toHaveBeenCalledWith({ Config: DefaultWidgetConfig(), Nonce: 'n' });
  });
});

describe('prefetching', () => {
  beforeEach(() => ResetSessionPrefetches());

  it('is a modulepreload link carrying the nonce, added once per URL, and runs nothing', () => {
    const appended: Array<{ rel: string; href: string; attrs: Record<string, string> }> = [];
    const doc = {
      createElement: () => {
        const attrs: Record<string, string> = {};
        return { rel: '', href: '', setAttribute: (k: string, v: string) => (attrs[k] = v), attrs };
      },
      head: { appendChild: (el: { rel: string; href: string; attrs: Record<string, string> }) => appended.push(el) }
    } as unknown as Document;
    expect(PrefetchSession('https://x/s.js', 'nonce-1', doc)).not.toBeNull();
    expect(PrefetchSession('https://x/s.js', 'nonce-1', doc)).toBeNull();
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ rel: 'modulepreload', href: 'https://x/s.js', attrs: { nonce: 'nonce-1' } });
  });
});
