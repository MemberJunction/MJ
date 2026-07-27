import { describe, it, expect, vi, afterEach } from 'vitest';
import type { MJConversationEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { ExportService } from './export.service';

/**
 * DOM spec (jsdom — `escapeHtml` and the theme snapshot touch `document`) for the
 * export service's branded-export surface, driven through the download-free
 * `BuildExportContent` seam with fabricated conversation data (no provider, no
 * TestBed — the service has a no-arg constructor).
 *
 * The load-bearing assertions are the PARITY ones: without branding/includeTheme
 * the HTML must carry the legacy palette as `var()` fallbacks and emit no `:root`
 * block and no logo — i.e. today's unthemed file, rendered identically.
 */
describe('ExportService — BuildExportContent branding', () => {
  const conversation = {
    ID: 'c1',
    Name: 'My Chat',
    Description: 'About things',
    __mj_CreatedAt: new Date('2026-01-02T03:04:05Z'),
    __mj_UpdatedAt: new Date('2026-01-02T03:04:05Z'),
  } as unknown as MJConversationEntity;
  const details = [
    { ID: 'm1', Role: 'User', Message: 'Hello there', __mj_CreatedAt: new Date('2026-01-02T03:05:00Z') },
    { ID: 'm2', Role: 'Assistant', Message: 'Hi!', __mj_CreatedAt: new Date('2026-01-02T03:05:30Z') },
  ] as unknown as MJConversationDetailEntity[];
  const data = { conversation, details };
  const svc = new ExportService();

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('unthemed HTML keeps the ENTIRE legacy palette as fallbacks — no :root block, no logo', async () => {
    const { content, filename, mimeType } = await svc.BuildExportContent(data, 'html');
    expect(mimeType).toBe('text/html');
    expect(filename).toMatch(/\.html$/);
    // Every legacy hex survives as its rule's var() fallback (pin the full
    // palette so an accidental selector/color change can't slip through)…
    expect(content).toContain('var(--mj-text-primary, #333)');
    expect(content).toContain('var(--mj-brand-primary, #007bff)'); // h1 border + .role
    expect(content).toContain('var(--mj-text-secondary, #666)'); // .meta
    expect(content).toContain('var(--mj-bg-surface-card, #f5f5f5)'); // .message / .assistant
    expect(content).toContain('var(--mj-status-info-bg, #e3f2fd)'); // .message.user
    expect(content).toContain('var(--mj-text-disabled, #999)'); // .timestamp
    // …and nothing themed is emitted
    expect(content).not.toContain(':root {');
    expect(content).not.toContain('<img');
    expect(content).toContain('<title>My Chat</title>');
    expect(content).toContain('Hello there');
  });

  it('explicit brandTokens are emitted as a :root block; hostile entries are REJECTED whole', async () => {
    const { content } = await svc.BuildExportContent(data, 'html', {
      branding: {
        brandTokens: {
          '--mj-brand-primary': '#ff0000',
          '--mj-bg-surface-card': 'color-mix(in srgb, #ff0000 10%, white)',
          'background:url(x)': 'red', // invalid KEY — dropped
          '--mj-evil-markup': 'red}</style><script>', // tag/rule breakout — dropped
          '--mj-evil-decl': 'red; background: url(https://evil.example/beacon)', // declaration breakout + beacon — dropped
          '--mj-evil-url': 'url(https://evil.example/x.png)', // network call from a style value — dropped
          '--mj-evil-escape': '\\75 rl(x)', // CSS-escape smuggling — dropped
          '--mj-evil-atrule': '@import "x"', // at-rule — dropped
        },
      },
    });
    expect(content).toContain(':root { ');
    expect(content).toContain('--mj-brand-primary: #ff0000;');
    expect(content).toContain('--mj-bg-surface-card: color-mix(in srgb, #ff0000 10%, white);');
    // Rejection means the ENTRY vanishes — no stripped residue of any kind.
    expect(content).not.toContain('background:url(x)');
    expect(content).not.toContain('--mj-evil-markup');
    expect(content).not.toContain('--mj-evil-decl');
    expect(content).not.toContain('evil.example');
    expect(content).not.toContain('--mj-evil-url');
    expect(content).not.toContain('--mj-evil-escape');
    expect(content).not.toContain('--mj-evil-atrule');
  });

  it('includeTheme auto-snapshots the live document tokens', async () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (token: string) => (token === '--mj-brand-primary' ? ' #ff0000 ' : ''),
    } as unknown as CSSStyleDeclaration);
    const { content } = await svc.BuildExportContent(data, 'html', { includeTheme: true });
    expect(content).toContain('--mj-brand-primary: #ff0000;');
    // only the set token lands — unset snapshot tokens are skipped
    expect(content).not.toContain('--mj-text-primary:');
  });

  it('explicit brandTokens win over the includeTheme snapshot', async () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => '#00ff00',
    } as unknown as CSSStyleDeclaration);
    const { content } = await svc.BuildExportContent(data, 'html', {
      includeTheme: true,
      branding: { brandTokens: { '--mj-brand-primary': '#123456' } },
    });
    expect(content).toContain('--mj-brand-primary: #123456;');
    expect(content).not.toContain('#00ff00');
  });

  it('inlines the logo as a data URI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(['png-bytes'], { type: 'image/png' }) }))
    );
    const { content } = await svc.BuildExportContent(data, 'html', {
      branding: { logoUrl: 'https://example.org/logo.png' },
    });
    expect(content).toContain('<img class="brand-logo" src="data:image/png;base64,');
    expect(content).toContain('.brand-logo {');
  });

  it('falls back to the raw logo URL when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    const { content } = await svc.BuildExportContent(data, 'html', {
      branding: { logoUrl: 'https://example.org/logo.png' },
    });
    expect(content).toContain('<img class="brand-logo" src="https://example.org/logo.png"');
  });

  it('branding.title overrides the document title and heading', async () => {
    const { content } = await svc.BuildExportContent(data, 'html', {
      branding: { title: 'ACME — Conversation Report' },
    });
    expect(content).toContain('<title>ACME — Conversation Report</title>');
    expect(content).toContain('<h1>ACME — Conversation Report</h1>');
    expect(content).not.toContain('<h1>My Chat</h1>');
  });

  it('branding.trademark renders (escaped) as an HTML footer with its own themed rule', async () => {
    const { content } = await svc.BuildExportContent(data, 'html', {
      branding: { trademark: '© 2026 Acme <Assoc>' },
    });
    expect(content).toContain('<footer class="brand-trademark">© 2026 Acme &lt;Assoc&gt;</footer>');
    expect(content).toContain('.brand-trademark {');
    // themed via tokens already in the snapshot set, so no new token is needed
    expect(content).toContain('var(--mj-text-secondary, #666)');
    // absent entirely when no trademark is supplied
    const plain = await svc.BuildExportContent(data, 'html');
    expect(plain.content).not.toContain('brand-trademark');
  });

  it('applies title + trademark to markdown/text and a branding block to JSON', async () => {
    const branding = {
      brandTokens: { '--mj-brand-primary': '#ff0000' }, // HTML-only — must NOT leak into data formats
      logoUrl: 'https://x/logo.png',
      title: 'Acme Report',
      trademark: '© 2026 Acme · Powered by Betty',
    };

    const md = (await svc.BuildExportContent(data, 'markdown', { branding })).content;
    expect(md).toContain('![Acme Report](https://x/logo.png)');
    expect(md).toContain('# Acme Report');
    expect(md).toContain('_© 2026 Acme · Powered by Betty_');
    expect(md).not.toContain('# My Chat');

    const txt = (await svc.BuildExportContent(data, 'text', { branding })).content;
    expect(txt.startsWith('Acme Report\n')).toBe(true);
    expect(txt).toContain('© 2026 Acme · Powered by Betty');

    const json = JSON.parse((await svc.BuildExportContent(data, 'json', { branding })).content);
    expect(json.branding).toEqual({
      title: 'Acme Report',
      trademark: '© 2026 Acme · Powered by Betty',
      logoUrl: 'https://x/logo.png',
    });
    // color tokens are HTML-only — never serialized into the data format
    expect((await svc.BuildExportContent(data, 'json', { branding })).content).not.toContain('--mj-brand-primary');
  });

  it('data formats stay byte-identical when no branding is supplied', async () => {
    for (const format of ['json', 'markdown', 'text'] as const) {
      const plain = await svc.BuildExportContent(data, format);
      // includeTheme without branding is an HTML-only concern; data formats ignore it
      const stillPlain = await svc.BuildExportContent(data, format, { includeTheme: true });
      expect(stillPlain.content).toBe(plain.content);
    }
  });
});
