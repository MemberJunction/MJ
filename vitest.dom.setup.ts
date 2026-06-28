/**
 * Vitest setup for DOM-level Angular component tests.
 *
 * This file is loaded once per test file (per worker) by any package whose
 * `vitest.config.ts` extends `vitest.dom.shared.ts`. It:
 *
 *  1. Pulls in `@angular/compiler` so partial-compiled (Ivy) libraries can be
 *     JIT-compiled at test time when needed (repo convention — see the
 *     class-level Angular specs that already do this).
 *  2. Initializes the Angular testing platform **once** with the modern
 *     `platformBrowserTesting` (no `platform-browser-dynamic`).
 *  3. Runs the tests **zoneless** — there is no `zone.js` import anywhere in
 *     this path. Every test module is configured with
 *     `provideZonelessChangeDetection()` via a global `beforeEach`, so specs do
 *     not have to repeat it. Drive change detection explicitly with
 *     `fixture.detectChanges()` / `await fixture.whenStable()`.
 *  4. Installs the small, standard set of browser-API stubs that jsdom does not
 *     implement (`matchMedia`, `ResizeObserver`, `IntersectionObserver`). These
 *     keep media-free presentational components from throwing in their
 *     constructors. WebRTC / `getUserMedia` / `AudioContext` are deliberately
 *     NOT stubbed — those paths are live-tested, never faked (see
 *     `plans/testing/angular-dom-testing-rollout.md` §3).
 */
import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeEach, vi } from 'vitest';

// ── 1. Initialize the Angular testing environment once per test file ────────
// `initTestEnvironment` throws if called twice; each vitest test file gets a
// fresh module graph, so this runs exactly once where it should.
getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});

// ── 2. Zoneless change detection for every spec ─────────────────────────────
// TestBed.configureTestingModule calls merge (before first component creation),
// so a spec may still add its own providers/imports on top of this.
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
});

// ── 3. jsdom browser-API stubs (the standard set) ───────────────────────────
installJsdomStubs();

function installJsdomStubs(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!window.matchMedia) {
    window.matchMedia = (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated, kept for older consumers
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList;
  }

  if (!('ResizeObserver' in window)) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  }

  if (!('IntersectionObserver' in window)) {
    class IntersectionObserverStub {
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds: ReadonlyArray<number> = [];
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    window.IntersectionObserver =
      IntersectionObserverStub as unknown as typeof IntersectionObserver;
  }
}
