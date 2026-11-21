// Load the JIT compiler BEFORE any Angular library evaluates: npm-published Angular
// packages ship partial declarations whose static initializers need the compiler facade.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { signal, WritableSignal } from '@angular/core';
import { ServerConnectivityBannerComponent } from '@memberjunction/ng-explorer-core';
import { MJExplorerAppComponent } from '../public-api';

/**
 * MJ #4377: the chat overlay's top boundary is the shell header plus the offline banner. It used to
 * read the banner height from `--mj-connectivity-banner-height` with `getComputedStyle`, which change
 * detection cannot see, so the binding went stale and dev mode reported NG0100 on every pass after
 * the banner appeared. It must come from the banner's `HeightPx` signal, through the shell's view query.
 *
 * This runs in the node preset on purpose: there is no `getComputedStyle` here, so a getter that
 * reads the DOM throws instead of passing. The DOM half (a signal-backed binding stays consistent
 * when the height is published mid-pass) is covered in explorer-core's banner spec.
 */
type BannerHeight = Pick<ServerConnectivityBannerComponent, 'HeightPx'>;

function appWith(banner: BannerHeight | undefined): MJExplorerAppComponent {
  // Only the getter under test runs, so the component is built without its ~20 injected services;
  // the `viewChild` query is replaced by a function returning the banner it would resolve to.
  const app: MJExplorerAppComponent = Object.create(MJExplorerAppComponent.prototype);
  return Object.assign(app, { connectivityBanner: () => banner });
}

describe('MJExplorerAppComponent.ChatOverlayTopBoundaryPx', () => {
  it('is the 60px shell header before the banner is rendered', () => {
    expect(appWith(undefined).ChatOverlayTopBoundaryPx).toBe(60);
  });

  it('is the 60px shell header while the offline banner is hidden', () => {
    expect(appWith({ HeightPx: signal(0) }).ChatOverlayTopBoundaryPx).toBe(60);
  });

  it('adds the height the banner reports', () => {
    const height: WritableSignal<number> = signal(0);
    const app = appWith({ HeightPx: height });

    height.set(35);
    expect(app.ChatOverlayTopBoundaryPx).toBe(95);

    height.set(0);
    expect(app.ChatOverlayTopBoundaryPx).toBe(60);
  });
});
