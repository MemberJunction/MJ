import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The org brand overlay on a COLD load. `ApplyBrandOverlay()` persisted only the overlay id, and
 * the overlay stylesheet is a session Blob, so a reload restored the `data-theme-overlay`
 * attribute with no CSS behind it: the loading screen and the sign-in page rendered MJ's
 * default tokens until bootstrap re-emitted the overlay at the end of workspace init. The
 * service now persists the emitted CSS beside the id and can re-inject it as a `<style>` before
 * first paint; the real `<link>` replaces it once bootstrap loads the overlay again.
 *
 * Stubs: the user-settings engine (no database), the theme engine (derivation is not under
 * test; the emitter returns a recognizable rule), and `URL.createObjectURL` (jsdom has none).
 * `loadThemeCss` resolves on the link's `load` event, which jsdom never fires for a blob URL,
 * so the specs fire it by hand.
 */
vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: { Instance: { GetSetting: () => undefined, SetSetting: vi.fn(async () => true) } },
}));
vi.mock('@memberjunction/theme-engine', () => ({
  derive: vi.fn(() => ({ overlayVars: {}, tokens: { light: {} } })),
  emitOverlayCss: vi.fn((id: string) => `[data-theme-overlay="${id}"]{--mj-brand-primary:#c026d3}`),
  emitLogoOverlayCss: vi.fn(() => ''),
}));

import { ThemeService } from '../lib/theme.service';

const OVERLAY_KEY = 'mj-theme-overlay';
const OVERLAY_CSS_KEY = 'mj-theme-overlay-css';
const PRELOAD_SELECTOR = 'style[data-mj-brand-overlay-preload]';
const SEEDS = { primary: '#c026d3' };

let blobCounter = 0;

function register(service: ThemeService, id: string): void {
  service.RegisterBrandTheme({ id, name: `Brand ${id}`, seeds: SEEDS });
}

/** Run ApplyBrandOverlay and fire the overlay link's load event so it resolves. */
async function apply(service: ThemeService, id: string, options?: { persist?: boolean }): Promise<void> {
  const pending = service.ApplyBrandOverlay(id, options);
  const link = document.head.querySelector(`link[data-mj-theme="${id}"]`) as HTMLLinkElement | null;
  link?.onload?.(new Event('load'));
  await pending;
}

describe('ThemeService — org brand overlay persisted for first paint', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.querySelectorAll('link[data-mj-theme], style[data-mj-brand-overlay-preload]').forEach((el) => el.remove());
    document.documentElement.removeAttribute('data-theme-overlay');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => `blob:test/${++blobCounter}`) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
  });

  it('ApplyBrandOverlay persists the emitted CSS beside the overlay id', async () => {
    const service = new ThemeService();
    register(service, 'acme');
    await apply(service, 'acme');
    expect(localStorage.getItem(OVERLAY_KEY)).toBe('acme');
    const stored = JSON.parse(localStorage.getItem(OVERLAY_CSS_KEY) ?? 'null');
    expect(stored).toEqual({ id: 'acme', css: '[data-theme-overlay="acme"]{--mj-brand-primary:#c026d3}' });
  });

  it('a session-only overlay (persist: false, the Theme Studio preview) persists neither key', async () => {
    const service = new ThemeService();
    register(service, 'preview');
    await apply(service, 'preview', { persist: false });
    expect(localStorage.getItem(OVERLAY_KEY)).toBeNull();
    expect(localStorage.getItem(OVERLAY_CSS_KEY)).toBeNull();
  });

  it('RestorePersistedBrandOverlay injects the persisted CSS as a <style> and sets the attribute', () => {
    localStorage.setItem(OVERLAY_KEY, 'acme');
    localStorage.setItem(OVERLAY_CSS_KEY, JSON.stringify({ id: 'acme', css: '[data-theme-overlay="acme"]{--mj-brand-primary:#c026d3}' }));
    const service = new ThemeService();
    expect(service.RestorePersistedBrandOverlay()).toBe(true);
    const style = document.head.querySelector(PRELOAD_SELECTOR) as HTMLStyleElement | null;
    expect(style?.getAttribute('data-mj-brand-overlay-preload')).toBe('acme');
    expect(style?.textContent).toContain('--mj-brand-primary:#c026d3');
    expect(document.documentElement.getAttribute('data-theme-overlay')).toBe('acme');
  });

  it('restoring twice injects one <style>', () => {
    localStorage.setItem(OVERLAY_KEY, 'acme');
    localStorage.setItem(OVERLAY_CSS_KEY, JSON.stringify({ id: 'acme', css: 'x{}' }));
    const service = new ThemeService();
    service.RestorePersistedBrandOverlay();
    service.RestorePersistedBrandOverlay();
    expect(document.head.querySelectorAll(PRELOAD_SELECTOR).length).toBe(1);
  });

  it('a stale CSS entry (different id than the overlay key) is dropped, not injected', () => {
    localStorage.setItem(OVERLAY_KEY, 'acme');
    localStorage.setItem(OVERLAY_CSS_KEY, JSON.stringify({ id: 'old-brand', css: 'x{}' }));
    const service = new ThemeService();
    expect(service.RestorePersistedBrandOverlay()).toBe(false);
    expect(document.head.querySelector(PRELOAD_SELECTOR)).toBeNull();
    expect(localStorage.getItem(OVERLAY_CSS_KEY)).toBeNull();
    expect(localStorage.getItem(OVERLAY_KEY)).toBe('acme'); // the id key is bootstrap's, untouched
  });

  it('with no overlay persisted there is nothing to restore', () => {
    const service = new ThemeService();
    expect(service.RestorePersistedBrandOverlay()).toBe(false);
    expect(document.head.querySelector(PRELOAD_SELECTOR)).toBeNull();
  });

  it('once bootstrap applies the real overlay for that id, the preload <style> is removed and the link carries it', async () => {
    localStorage.setItem(OVERLAY_KEY, 'acme');
    localStorage.setItem(OVERLAY_CSS_KEY, JSON.stringify({ id: 'acme', css: 'x{}' }));
    const service = new ThemeService();
    service.RestorePersistedBrandOverlay();
    register(service, 'acme');
    await apply(service, 'acme');
    expect(document.head.querySelector(PRELOAD_SELECTOR)).toBeNull();
    const link = document.head.querySelector('link[data-mj-theme="acme"]') as HTMLLinkElement | null;
    expect(link).not.toBeNull();
    expect(link?.disabled).not.toBe(true); // jsdom has no `disabled` on <link>; a fresh link is never disabled
  });

  it('applying a DIFFERENT overlay also removes a restored preload (the org default changed)', async () => {
    localStorage.setItem(OVERLAY_KEY, 'old-brand');
    localStorage.setItem(OVERLAY_CSS_KEY, JSON.stringify({ id: 'old-brand', css: 'x{}' }));
    const service = new ThemeService();
    service.RestorePersistedBrandOverlay();
    register(service, 'new-brand');
    await apply(service, 'new-brand');
    expect(document.head.querySelector(PRELOAD_SELECTOR)).toBeNull();
    expect(localStorage.getItem(OVERLAY_KEY)).toBe('new-brand');
    expect(JSON.parse(localStorage.getItem(OVERLAY_CSS_KEY) ?? '{}').id).toBe('new-brand');
  });

  it('ClearBrandOverlay removes the CSS key and any preload <style>', async () => {
    localStorage.setItem(OVERLAY_KEY, 'acme');
    localStorage.setItem(OVERLAY_CSS_KEY, JSON.stringify({ id: 'acme', css: 'x{}' }));
    const service = new ThemeService();
    service.RestorePersistedBrandOverlay();
    service.ClearBrandOverlay();
    expect(localStorage.getItem(OVERLAY_KEY)).toBeNull();
    expect(localStorage.getItem(OVERLAY_CSS_KEY)).toBeNull();
    expect(document.head.querySelector(PRELOAD_SELECTOR)).toBeNull();
    expect(document.documentElement.getAttribute('data-theme-overlay')).toBeNull();
  });

  it('ClearBrandOverlay on an applied brand strips its attribute and disables its link', async () => {
    const service = new ThemeService();
    register(service, 'acme');
    await apply(service, 'acme');
    const brandLink = document.head.querySelector('link[data-mj-theme="acme"]') as HTMLLinkElement;
    expect(document.documentElement.getAttribute('data-theme-overlay')).toBe('acme');
    service.ClearBrandOverlay();
    expect(document.documentElement.getAttribute('data-theme-overlay')).toBeNull();
    expect(brandLink.disabled).toBe(true);
    expect(service.BrandOverlayId).toBeNull();
  });

  it('ClearBrandOverlay is scoped to the brand: a custom theme the user selected survives a no-brand bootstrap', async () => {
    const service = new ThemeService();
    service.RegisterTheme({ Id: 'corp', Name: 'Corp', BaseTheme: 'light', IsBuiltIn: false, CssUrl: 'https://example.test/corp.css' });
    const pending = service.SetTheme('corp');
    const corpLink = document.head.querySelector('link[data-mj-theme="corp"]') as HTMLLinkElement;
    corpLink.onload?.(new Event('load'));
    await pending;
    expect(document.documentElement.getAttribute('data-theme-overlay')).toBe('corp');
    service.ClearBrandOverlay();   // bootstrap found no org brand
    expect(document.documentElement.getAttribute('data-theme-overlay')).toBe('corp');
    expect(corpLink.disabled).not.toBe(true);   // jsdom leaves an untouched link's disabled undefined
  });

  it('ClearBrandOverlay with a retired cached brand under a custom theme drops the brand and keeps the theme', async () => {
    localStorage.setItem(OVERLAY_KEY, 'retired');
    localStorage.setItem(OVERLAY_CSS_KEY, JSON.stringify({ id: 'retired', css: 'x{}' }));
    const service = new ThemeService();
    expect(service.RestorePersistedBrandOverlay()).toBe(true);
    service.RegisterTheme({ Id: 'corp', Name: 'Corp', BaseTheme: 'light', IsBuiltIn: false, CssUrl: 'https://example.test/corp.css' });
    const pending = service.SetTheme('corp');
    const corpLink = document.head.querySelector('link[data-mj-theme="corp"]') as HTMLLinkElement;
    corpLink.onload?.(new Event('load'));
    await pending;
    service.ClearBrandOverlay();   // bootstrap: the cached brand is gone
    expect(document.documentElement.getAttribute('data-theme-overlay')).toBe('corp');
    expect(corpLink.disabled).not.toBe(true);   // jsdom leaves an untouched link's disabled undefined
    expect(document.head.querySelector(PRELOAD_SELECTOR)).toBeNull();
    expect(localStorage.getItem(OVERLAY_KEY)).toBeNull();
    expect(localStorage.getItem(OVERLAY_CSS_KEY)).toBeNull();
    expect(service.BrandOverlayId).toBeNull();
  });

  it('Initialize() before bootstrap keeps the restored overlay attribute (no brand flash between the two)', async () => {
    localStorage.setItem(OVERLAY_KEY, 'acme');
    localStorage.setItem(OVERLAY_CSS_KEY, JSON.stringify({ id: 'acme', css: 'x{}' }));
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, writable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
    const service = new ThemeService();
    service.RestorePersistedBrandOverlay();
    await service.Initialize(); // applies the built-in base theme; the brand is not registered yet
    expect(document.documentElement.getAttribute('data-theme-overlay')).toBe('acme');
    expect(document.head.querySelector(PRELOAD_SELECTOR)).not.toBeNull();
    expect(service.BrandOverlayId).toBe('acme');
  });

  it('an overlay id with selector metacharacters never throws out of the constructor path', () => {
    const id = 'acme"]';
    localStorage.setItem(OVERLAY_KEY, id);
    localStorage.setItem(OVERLAY_CSS_KEY, JSON.stringify({ id, css: 'x{}' }));
    const service = new ThemeService();
    expect(() => service.RestorePersistedBrandOverlay()).not.toThrow();
    expect(service.RestorePersistedBrandOverlay()).toBe(true); // and the dedupe walk handles it too
    const styles = Array.from(document.head.querySelectorAll(PRELOAD_SELECTOR));
    expect(styles.length).toBe(1);
    expect(styles[0].getAttribute('data-mj-brand-overlay-preload')).toBe(id);
  });

  it('the restored state is tracked, not read off the DOM: a stripped preload <style> does not drop the attribute', async () => {
    localStorage.setItem(OVERLAY_KEY, 'acme');
    localStorage.setItem(OVERLAY_CSS_KEY, JSON.stringify({ id: 'acme', css: 'x{}' }));
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, writable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
    const service = new ThemeService();
    service.RestorePersistedBrandOverlay();
    document.head.querySelector(PRELOAD_SELECTOR)?.remove(); // a third party touched the element
    await service.Initialize();
    expect(document.documentElement.getAttribute('data-theme-overlay')).toBe('acme');
  });

  it('bootstrap clearing a restored overlay (no brand found) ends the pending state: Initialize() strips the attribute', async () => {
    localStorage.setItem(OVERLAY_KEY, 'acme');
    localStorage.setItem(OVERLAY_CSS_KEY, JSON.stringify({ id: 'acme', css: 'x{}' }));
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, writable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
    const service = new ThemeService();
    service.RestorePersistedBrandOverlay();
    service.ClearBrandOverlay();
    await service.Initialize();
    expect(document.documentElement.getAttribute('data-theme-overlay')).toBeNull();
    expect(service.BrandOverlayId).toBeNull();
    expect(new ThemeService().RestorePersistedBrandOverlay()).toBe(false);
  });

  it('re-applying the same brand does not rewrite the CSS entry', async () => {
    const service = new ThemeService();
    register(service, 'acme');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      await apply(service, 'acme');
      await apply(service, 'acme');
      const cssWrites = setItem.mock.calls.filter(([key]) => key === OVERLAY_CSS_KEY);
      expect(cssWrites.length).toBe(1);
    } finally {
      setItem.mockRestore();
    }
  });

  it('a localStorage that throws (private mode) never breaks apply or restore', async () => {
    const service = new ThemeService();
    register(service, 'acme');
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    const real = window.localStorage;
    Object.defineProperty(window, 'localStorage', { configurable: true, value: broken });
    try {
      await expect(apply(service, 'acme')).resolves.toBeUndefined();
      expect(service.RestorePersistedBrandOverlay()).toBe(false);
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: real });
    }
  });
});
