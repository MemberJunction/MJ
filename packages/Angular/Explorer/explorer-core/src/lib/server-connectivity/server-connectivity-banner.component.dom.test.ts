import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BehaviorSubject } from 'rxjs';
import { query } from '@memberjunction/ng-test-utils';
import { ServerConnectivityBannerComponent } from './server-connectivity-banner.component';
import { ServerConnectivityService } from '../services/server-connectivity.service';

/**
 * DOM coverage for <mj-server-connectivity-banner> — a standalone banner that shows only while the
 * server is disconnected. It subscribes to `ServerConnectivityService.IsConnected$` in ngOnInit and
 * flips `@if (!IsConnected)`. A fake service exposes a controllable BehaviorSubject.
 *
 * `detectChanges(false)` + `markForCheck` are used because the subscription mutates a plain property
 * across the `@if` boundary (a strict checkNoChanges would flag the connected→disconnected flip), and
 * the banner uses a `@slideDown` animation so noop animations are provided.
 */

function render(connected: boolean): { fixture: ComponentFixture<ServerConnectivityBannerComponent>; connected$: BehaviorSubject<boolean> } {
  const connected$ = new BehaviorSubject<boolean>(connected);
  TestBed.configureTestingModule({
    imports: [ServerConnectivityBannerComponent],
    providers: [provideNoopAnimations(), { provide: ServerConnectivityService, useValue: { IsConnected$: connected$ } }],
  });
  const fixture = TestBed.createComponent(ServerConnectivityBannerComponent);
  fixture.detectChanges(false);
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return { fixture, connected$ };
}

describe('ServerConnectivityBannerComponent (DOM)', () => {
  it('hides the banner while the server is connected', () => {
    expect(query(render(true).fixture, '.connectivity-banner')).toBeNull();
  });

  it('shows the offline banner while the server is disconnected', () => {
    const banner = query(render(false).fixture, '.connectivity-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Server unavailable');
  });

  it('reacts to a connectivity change — banner appears when the connection drops', () => {
    const { fixture, connected$ } = render(true);
    expect(query(fixture, '.connectivity-banner')).toBeNull();
    connected$.next(false);
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(query(fixture, '.connectivity-banner')).not.toBeNull();
  });
});
