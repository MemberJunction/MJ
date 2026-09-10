import { describe, it, expect } from 'vitest';
import { AfterViewInit, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BehaviorSubject } from 'rxjs';
import { query } from '@memberjunction/ng-test-utils';
import { ServerConnectivityBannerComponent } from './server-connectivity-banner.component';
import { ServerConnectivityService } from '../services/server-connectivity.service';

/**
 * DOM coverage for <mj-server-connectivity-banner> — a standalone banner that shows only while the
 * server is disconnected. It tracks `ServerConnectivityService.IsConnected$` through a `toSignal`
 * and flips `@if (!IsConnected())`. A fake service exposes a controllable BehaviorSubject.
 *
 * Because the state is a signal, a write marks the view dirty on its own: these specs use the plain
 * `detectChanges()` (check-no-changes included) with no `markForCheck` nursing. The banner animates
 * with `@slideDown`, so noop animations are provided.
 */

function render(connected: boolean): { fixture: ComponentFixture<ServerConnectivityBannerComponent>; connected$: BehaviorSubject<boolean> } {
  const connected$ = new BehaviorSubject<boolean>(connected);
  TestBed.configureTestingModule({
    imports: [ServerConnectivityBannerComponent],
    providers: [provideNoopAnimations(), { provide: ServerConnectivityService, useValue: { IsConnected$: connected$ } }],
  });
  const fixture = TestBed.createComponent(ServerConnectivityBannerComponent);
  fixture.detectChanges();
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
    fixture.detectChanges();
    expect(query(fixture, '.connectivity-banner')).not.toBeNull();
  });
});

/**
 * Host that drops the connection from `ngAfterViewInit` — a hook Angular runs *inside* the
 * change-detection pass, after the banner's own view has already been checked. That is the
 * real-world shape of the bug: graphql-ws reports the socket closed while a pass is in flight.
 */
@Component({
  standalone: true,
  imports: [ServerConnectivityBannerComponent],
  template: `<mj-server-connectivity-banner></mj-server-connectivity-banner>`,
})
class ConnectivityHostComponent implements AfterViewInit {
  /** Assigned by the spec before the first change-detection pass. */
  public DropConnection: (() => void) | null = null;

  ngAfterViewInit(): void {
    this.DropConnection?.();
  }
}

describe('ServerConnectivityBannerComponent (mid-change-detection drop)', () => {
  it('renders the banner without NG0100 when the drop lands inside the CD pass', () => {
    const connected$ = new BehaviorSubject<boolean>(true);
    TestBed.configureTestingModule({
      imports: [ConnectivityHostComponent],
      providers: [provideNoopAnimations(), { provide: ServerConnectivityService, useValue: { IsConnected$: connected$ } }],
    });
    const fixture = TestBed.createComponent(ConnectivityHostComponent);
    fixture.componentInstance.DropConnection = () => connected$.next(false);

    // The default `detectChanges()` runs the dev-mode check-no-changes pass. Before the fix this
    // threw NG0100 "Previous value: '-1'" — the `@if` branch index meaning "no branch rendered".
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(query(fixture, '.connectivity-banner')).not.toBeNull();
  });
});
