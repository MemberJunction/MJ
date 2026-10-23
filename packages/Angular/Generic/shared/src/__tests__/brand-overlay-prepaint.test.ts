import { describe, it, expect, beforeEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The inline pre-paint snippet for the org brand overlay. The service's
 * `RestorePersistedBrandOverlay()` runs in the explorer-app constructor, which is after the
 * bundle has loaded and booted; the static frame before that can only be branded by a script
 * inlined in the host's `index.html`, at the top of `<body>` so the `<style>` it appends to
 * `<head>` lands after the app stylesheet link. The snippet is exported from this package so hosts paste a
 * versioned string rather than hand-copying, and the reference host (MJExplorer) carries the
 * current copy. It must be dependency-free (it runs before anything else), fail open, and share
 * the marker attribute with the service so the two are idempotent and bootstrap replaces both.
 */
vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: { Instance: { GetSetting: () => undefined, SetSetting: vi.fn(async () => true) } },
}));
vi.mock('@memberjunction/theme-engine', () => ({
  derive: vi.fn(() => ({ overlayVars: {}, tokens: { light: {} } })),
  emitOverlayCss: vi.fn(() => ''),
  emitLogoOverlayCss: vi.fn(() => ''),
}));

import { BRAND_OVERLAY_PREPAINT_SCRIPT } from '../lib/brand-overlay-prepaint';
import { PRELOAD_OVERLAY_CSS_KEY, PRELOAD_OVERLAY_KEY, PRELOAD_STYLE_ATTR, ThemeService } from '../lib/theme.service';

const PRELOAD_SELECTOR = `style[${PRELOAD_STYLE_ATTR}]`;

/** Run the snippet exactly as a browser would run the inline script. */
function runSnippet(): void {
  new Function(BRAND_OVERLAY_PREPAINT_SCRIPT)();
}

describe('BRAND_OVERLAY_PREPAINT_SCRIPT', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.querySelectorAll(PRELOAD_SELECTOR).forEach((el) => el.remove());
    document.documentElement.removeAttribute('data-theme-overlay');
  });

  it('injects the persisted overlay CSS as a <style> and sets the attribute, before anything else runs', () => {
    localStorage.setItem(PRELOAD_OVERLAY_KEY, 'acme');
    localStorage.setItem(PRELOAD_OVERLAY_CSS_KEY, JSON.stringify({ id: 'acme', css: '[data-theme-overlay="acme"]{--mj-brand-primary:#c026d3}' }));
    runSnippet();
    const style = document.head.querySelector(PRELOAD_SELECTOR) as HTMLStyleElement | null;
    expect(style?.getAttribute(PRELOAD_STYLE_ATTR)).toBe('acme');
    expect(style?.textContent).toContain('--mj-brand-primary:#c026d3');
    expect(document.documentElement.getAttribute('data-theme-overlay')).toBe('acme');
  });

  it('does nothing without a persisted overlay, and nothing for a stale CSS entry', () => {
    runSnippet();
    expect(document.head.querySelector(PRELOAD_SELECTOR)).toBeNull();
    localStorage.setItem(PRELOAD_OVERLAY_KEY, 'acme');
    localStorage.setItem(PRELOAD_OVERLAY_CSS_KEY, JSON.stringify({ id: 'old', css: 'x{}' }));
    runSnippet();
    expect(document.head.querySelector(PRELOAD_SELECTOR)).toBeNull();
  });

  it('is idempotent with the service restore: snippet first, then the service, leaves ONE <style>', () => {
    localStorage.setItem(PRELOAD_OVERLAY_KEY, 'acme');
    localStorage.setItem(PRELOAD_OVERLAY_CSS_KEY, JSON.stringify({ id: 'acme', css: 'x{}' }));
    runSnippet();
    const service = new ThemeService();
    expect(service.RestorePersistedBrandOverlay()).toBe(true);
    expect(document.head.querySelectorAll(PRELOAD_SELECTOR).length).toBe(1);
    expect(service.BrandOverlayId).toBe('acme');
  });

  it('the service moves a snippet-injected preload to the END of head so it follows later stylesheets', () => {
    localStorage.setItem(PRELOAD_OVERLAY_KEY, 'acme');
    localStorage.setItem(PRELOAD_OVERLAY_CSS_KEY, JSON.stringify({ id: 'acme', css: 'x{}' }));
    runSnippet();
    // The app stylesheet link arrives AFTER the snippet ran (it is injected at the end of head).
    const appStyles = document.createElement('link');
    appStyles.rel = 'stylesheet';
    appStyles.setAttribute('data-test-app-styles', '');
    document.head.appendChild(appStyles);
    expect(document.head.lastElementChild).toBe(appStyles);
    new ThemeService().RestorePersistedBrandOverlay();
    expect(document.head.lastElementChild?.getAttribute(PRELOAD_STYLE_ATTR)).toBe('acme');
    expect(document.head.querySelectorAll(PRELOAD_SELECTOR).length).toBe(1);
    appStyles.remove();
  });

  it('run from <body>, the snippet appends its <style> LAST in <head>, after the app stylesheet link', () => {
    // The cascade argument: the overlay's selectors tie the :root tokens on specificity, so the
    // preload must follow the stylesheet in source order. From the top of <body>, the app
    // stylesheet link (injected just before </head>) is already there; the snippet must append.
    const appStyles = document.createElement('link');
    appStyles.rel = 'stylesheet';
    appStyles.setAttribute('data-test-app-styles', '');
    document.head.appendChild(appStyles);
    localStorage.setItem(PRELOAD_OVERLAY_KEY, 'acme');
    localStorage.setItem(PRELOAD_OVERLAY_CSS_KEY, JSON.stringify({ id: 'acme', css: 'x{}' }));
    try {
      runSnippet();
      const last = document.head.lastElementChild;
      expect(last?.tagName).toBe('STYLE');
      expect(last?.getAttribute(PRELOAD_STYLE_ATTR)).toBe('acme');
      expect(appStyles.compareDocumentPosition(last as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    } finally {
      appStyles.remove();
    }
  });

  it('a persisted id with selector metacharacters is handled by both the snippet and the service re-append', () => {
    const id = 'acme"]';
    localStorage.setItem(PRELOAD_OVERLAY_KEY, id);
    localStorage.setItem(PRELOAD_OVERLAY_CSS_KEY, JSON.stringify({ id, css: 'x{}' }));
    expect(() => runSnippet()).not.toThrow();
    const service = new ThemeService();
    expect(() => service.RestorePersistedBrandOverlay()).not.toThrow();
    expect(document.head.querySelectorAll(PRELOAD_SELECTOR).length).toBe(1);
    expect(document.head.querySelector(PRELOAD_SELECTOR)?.getAttribute(PRELOAD_STYLE_ATTR)).toBe(id);
  });

  it('fails open: malformed JSON or a throwing localStorage leaves the stock frame', () => {
    localStorage.setItem(PRELOAD_OVERLAY_KEY, 'acme');
    localStorage.setItem(PRELOAD_OVERLAY_CSS_KEY, '{not json');
    expect(() => runSnippet()).not.toThrow();
    expect(document.head.querySelector(PRELOAD_SELECTOR)).toBeNull();
    const real = window.localStorage;
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => { throw new Error('denied'); } } });
    try {
      expect(() => runSnippet()).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: real });
    }
  });

  it('has no dependencies and uses the same storage keys and marker as the service', () => {
    expect(BRAND_OVERLAY_PREPAINT_SCRIPT).toContain(PRELOAD_OVERLAY_KEY);
    expect(BRAND_OVERLAY_PREPAINT_SCRIPT).toContain(PRELOAD_OVERLAY_CSS_KEY);
    expect(BRAND_OVERLAY_PREPAINT_SCRIPT).toContain(PRELOAD_STYLE_ATTR);
    expect(BRAND_OVERLAY_PREPAINT_SCRIPT).not.toMatch(/\bimport\b|\brequire\(/);
  });

  it('the reference host (MJExplorer index.html) carries the current snippet verbatim', () => {
    const indexHtml = resolve(__dirname, '../../../../../MJExplorer/src/index.html');
    if (!existsSync(indexHtml)) {
      return; // published-package consumers run this spec without the repo's host app
    }
    const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(squash(readFileSync(indexHtml, 'utf8'))).toContain(squash(BRAND_OVERLAY_PREPAINT_SCRIPT));
  });

  it('the reference host carries the snippet at the top of <body>: after </head>, before <app-root>', () => {
    // The pin above is position-blind. Angular injects the app stylesheet link just before
    // </head>, so a snippet anywhere in <head> appends its <style> BEFORE that link and loses the
    // cascade for the one frame it exists for; only a body position wins. HTML comments are
    // stripped first because the file's own prose mentions <body> and <app-root>.
    const indexHtml = resolve(__dirname, '../../../../../MJExplorer/src/index.html');
    if (!existsSync(indexHtml)) {
      return;
    }
    const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
    const html = squash(readFileSync(indexHtml, 'utf8').replace(/<!--[\s\S]*?-->/g, ''));
    const snippetAt = html.indexOf(squash(BRAND_OVERLAY_PREPAINT_SCRIPT));
    const headEndsAt = html.indexOf('</head>');
    const appRootAt = html.indexOf('<app-root');
    expect(snippetAt).toBeGreaterThan(-1);
    expect(headEndsAt).toBeGreaterThan(-1);
    expect(appRootAt).toBeGreaterThan(-1);
    expect(snippetAt).toBeGreaterThan(headEndsAt);
    expect(snippetAt).toBeLessThan(appRootAt);
  });
});
