import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Brand-overlay edge cases between bootstrap and first paint.
 *
 * #6030: after a failed brand bootstrap the persisted overlay is restored from localStorage but
 * never registered. Re-applying that id (Theme Studio ending a workspace preview) must restore
 * it again rather than warn and leave the draft painted.
 *
 * #6031: a production build's critical CSS drops the dark `--mj-bg-page` override, so the theme
 * service records the resolved page background and the head pre-paint script sets it inline on
 * `<html>` before the bundle's stylesheet loads.
 */
vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: { Instance: { GetSetting: () => undefined, SetSetting: vi.fn(async () => true) } },
}));
vi.mock('@memberjunction/theme-engine', () => ({
  derive: vi.fn(() => ({ overlayVars: {}, tokens: { light: {} } })),
  emitOverlayCss: vi.fn((id: string) => `[data-theme-overlay="${id}"]{--mj-brand-primary:#c026d3}`),
  emitLogoOverlayCss: vi.fn(() => ''),
}));

import {
  PREPAINT_PAGE_ATTR,
  PRELOAD_OVERLAY_CSS_KEY,
  PRELOAD_OVERLAY_KEY,
  PRELOAD_PAGE_KEY,
  PrePaintPageEntry,
  ThemeService,
} from '../lib/theme.service';
import { PAGE_BACKGROUND_PREPAINT_SCRIPT } from '../lib/page-background-prepaint';

const PAGE_TOKEN_STYLE_ATTR = 'data-test-page-token';
let blobCounter = 0;

function persistOverlay(id: string): void {
  localStorage.setItem(PRELOAD_OVERLAY_KEY, id);
  localStorage.setItem(PRELOAD_OVERLAY_CSS_KEY, JSON.stringify({ id, css: `[data-theme-overlay="${id}"]{--mj-brand-primary:#c026d3}` }));
}

/** Gives the document a `--mj-bg-page` value, as the app stylesheet would. */
function setPageToken(value: string): void {
  document.head.querySelectorAll(`style[${PAGE_TOKEN_STYLE_ATTR}]`).forEach((el) => el.remove());
  const style = document.createElement('style');
  style.setAttribute(PAGE_TOKEN_STYLE_ATTR, '');
  style.textContent = `:root{--mj-bg-page:${value}}`;
  document.head.appendChild(style);
}

function readPageEntry(): PrePaintPageEntry | null {
  const raw = localStorage.getItem(PRELOAD_PAGE_KEY);
  return raw ? (JSON.parse(raw) as PrePaintPageEntry) : null;
}

function resetDocument(): void {
  localStorage.clear();
  document.head.querySelectorAll('link[data-mj-theme], style[data-mj-brand-overlay-preload], style[data-test-page-token]').forEach((el) => el.remove());
  const root = document.documentElement;
  root.removeAttribute('data-theme-overlay');
  root.removeAttribute('data-theme');
  root.removeAttribute(PREPAINT_PAGE_ATTR);
  root.removeAttribute('style');
}

describe('ThemeService — re-applying a restored but unregistered overlay (#6030)', () => {
  beforeEach(() => {
    resetDocument();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => `blob:test/${++blobCounter}`) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores the persisted overlay instead of warning when the id is the persisted one', async () => {
    persistOverlay('acme');
    const service = new ThemeService();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // something else (a draft preview) is painted in the meantime
    document.documentElement.setAttribute('data-theme-overlay', 'draft');

    await service.ApplyBrandOverlay('acme');

    expect(warn).not.toHaveBeenCalled();
    expect(document.documentElement.getAttribute('data-theme-overlay')).toBe('acme');
    expect(service.BrandOverlayId).toBe('acme');
    expect(document.head.querySelector('style[data-mj-brand-overlay-preload="acme"]')).not.toBeNull();
  });

  it('still warns for an unregistered id that is not the persisted one', async () => {
    persistOverlay('acme');
    const service = new ThemeService();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await service.ApplyBrandOverlay('other');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(service.BrandOverlayId).toBeNull();
    expect(localStorage.getItem(PRELOAD_OVERLAY_KEY)).toBe('acme');
  });

  it('still warns when the persisted id has no restorable CSS', async () => {
    localStorage.setItem(PRELOAD_OVERLAY_KEY, 'acme');
    const service = new ThemeService();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await service.ApplyBrandOverlay('acme');

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('ThemeService — page background recorded for the pre-paint script (#6031)', () => {
  beforeEach(() => {
    resetDocument();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => `blob:test/${++blobCounter}`) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
  });

  it('records the resolved page background with the base theme and overlay it was resolved under', async () => {
    setPageToken('#0b1220');
    document.documentElement.setAttribute('data-theme', 'dark');
    const service = new ThemeService();
    service.RegisterBrandTheme({ id: 'acme', name: 'Brand acme', seeds: { primary: '#c026d3' } });

    const pending = service.ApplyBrandOverlay('acme');
    const link = document.head.querySelector('link[data-mj-theme="acme"]') as HTMLLinkElement | null;
    link?.onload?.(new Event('load'));
    await pending;

    expect(readPageEntry()).toEqual({ bg: '#0b1220', scheme: 'dark', overlay: 'acme' });
  });

  it('records nothing when no stylesheet defines the page token', async () => {
    const service = new ThemeService();
    service.RegisterBrandTheme({ id: 'acme', name: 'Brand acme', seeds: { primary: '#c026d3' } });
    const pending = service.ApplyBrandOverlay('acme');
    const link = document.head.querySelector('link[data-mj-theme="acme"]') as HTMLLinkElement | null;
    link?.onload?.(new Event('load'));
    await pending;

    expect(readPageEntry()).toBeNull();
  });

  it('removes the inline background the pre-paint script set, once a theme is applied', async () => {
    const root = document.documentElement;
    root.style.setProperty('--mj-bg-page', '#000000');
    root.style.setProperty('background-color', '#000000');
    root.setAttribute(PREPAINT_PAGE_ATTR, '');
    setPageToken('#ffffff');
    const service = new ThemeService();
    service.RegisterBrandTheme({ id: 'acme', name: 'Brand acme', seeds: { primary: '#c026d3' } });

    const pending = service.ApplyBrandOverlay('acme');
    const link = document.head.querySelector('link[data-mj-theme="acme"]') as HTMLLinkElement | null;
    link?.onload?.(new Event('load'));
    await pending;

    expect(root.hasAttribute(PREPAINT_PAGE_ATTR)).toBe(false);
    expect(root.style.getPropertyValue('--mj-bg-page')).toBe('');
    expect(root.style.getPropertyValue('background-color')).toBe('');
  });
});

describe('PAGE_BACKGROUND_PREPAINT_SCRIPT', () => {
  beforeEach(() => resetDocument());

  const runSnippet = (): void => {
    new Function(PAGE_BACKGROUND_PREPAINT_SCRIPT)();
  };

  it('sets the recorded background inline when base theme and overlay match', () => {
    const entry: PrePaintPageEntry = { bg: '#0b1220', scheme: 'dark', overlay: null };
    localStorage.setItem(PRELOAD_PAGE_KEY, JSON.stringify(entry));
    document.documentElement.setAttribute('data-theme', 'dark');

    runSnippet();

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--mj-bg-page')).toBe('#0b1220');
    expect(root.style.getPropertyValue('color-scheme')).toBe('dark');
    expect(root.hasAttribute(PREPAINT_PAGE_ATTR)).toBe(true);
  });

  it('does nothing for a record made under another base theme or overlay', () => {
    const entry: PrePaintPageEntry = { bg: '#0b1220', scheme: 'dark', overlay: null };
    localStorage.setItem(PRELOAD_PAGE_KEY, JSON.stringify(entry));
    runSnippet(); // page is light now
    expect(document.documentElement.hasAttribute(PREPAINT_PAGE_ATTR)).toBe(false);

    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-theme-overlay', 'acme');
    runSnippet(); // overlay differs
    expect(document.documentElement.hasAttribute(PREPAINT_PAGE_ATTR)).toBe(false);
  });

  it('fails open on a malformed record', () => {
    localStorage.setItem(PRELOAD_PAGE_KEY, '{not json');
    expect(() => runSnippet()).not.toThrow();
    expect(document.documentElement.hasAttribute(PREPAINT_PAGE_ATTR)).toBe(false);
  });

  it('the reference host (MJExplorer index.html) carries the current snippet verbatim', () => {
    const indexHtml = resolve(__dirname, '../../../../../MJExplorer/src/index.html');
    if (!existsSync(indexHtml)) {
      return; // published-package consumers run this spec without the repo's host app
    }
    const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
    expect(squash(readFileSync(indexHtml, 'utf8'))).toContain(squash(PAGE_BACKGROUND_PREPAINT_SCRIPT));
  });
});
