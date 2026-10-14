import { describe, it, expect } from 'vitest';
import { AfterViewInit, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BehaviorSubject } from 'rxjs';
import { query } from '@memberjunction/ng-test-utils';
import { ServerConnectivityBannerComponent } from './server-connectivity-banner.component';
import { ServerConnectivityService, ServerConnectionState } from '../services/server-connectivity.service';

/**
 * DOM coverage for <mj-server-connectivity-banner> — a standalone banner that shows only while the
 * server is not connected. It tracks `ServerConnectivityService.ConnectionState$` through a `toSignal`
 * and says why: reconnecting, busy, or unavailable (MJ #5510). A fake service exposes a controllable
 * BehaviorSubject.
 *
 * Because the state is a signal, a write marks the view dirty on its own: these specs use the plain
 * `detectChanges()` (check-no-changes included) with no `markForCheck` nursing. The banner animates
 * with `@slideDown`, so noop animations are provided.
 */

function render(state: ServerConnectionState): {
  fixture: ComponentFixture<ServerConnectivityBannerComponent>;
  state$: BehaviorSubject<ServerConnectionState>;
} {
  const state$ = new BehaviorSubject<ServerConnectionState>(state);
  TestBed.configureTestingModule({
    imports: [ServerConnectivityBannerComponent],
    providers: [provideNoopAnimations(), { provide: ServerConnectivityService, useValue: { ConnectionState$: state$ } }],
  });
  const fixture = TestBed.createComponent(ServerConnectivityBannerComponent);
  fixture.detectChanges();
  return { fixture, state$ };
}

describe('ServerConnectivityBannerComponent (DOM)', () => {
  it('hides the banner while the server is connected', () => {
    expect(query(render('connected').fixture, '.connectivity-banner')).toBeNull();
  });

  it('shows the offline banner while the server is unavailable', () => {
    const banner = query(render('unavailable').fixture, '.connectivity-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Server unavailable');
  });

  it('says the server is busy — and that refreshing will not help — while it is stalled', () => {
    const banner = query(render('busy').fixture, '.connectivity-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('busy');
    expect(banner?.textContent).toContain('no need to refresh');
    expect(banner?.textContent).not.toContain('unavailable');
  });

  it('says it is reconnecting while the socket re-establishes against a live server', () => {
    const banner = query(render('reconnecting').fixture, '.connectivity-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Reconnecting');
    expect(banner?.textContent).not.toContain('unavailable');
  });

  it('marks each state on the banner so styling can tell them apart', () => {
    expect(query(render('busy').fixture, '.connectivity-banner')?.classList.contains('state-busy')).toBe(true);
  });

  it('reacts to a connectivity change — banner appears when the connection drops', () => {
    const { fixture, state$ } = render('connected');
    expect(query(fixture, '.connectivity-banner')).toBeNull();
    state$.next('unavailable');
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
    const state$ = new BehaviorSubject<ServerConnectionState>('connected');
    TestBed.configureTestingModule({
      imports: [ConnectivityHostComponent],
      providers: [provideNoopAnimations(), { provide: ServerConnectivityService, useValue: { ConnectionState$: state$ } }],
    });
    const fixture = TestBed.createComponent(ConnectivityHostComponent);
    fixture.componentInstance.DropConnection = () => state$.next('unavailable');

    // The default `detectChanges()` runs the dev-mode check-no-changes pass. Before the fix this
    // threw NG0100 "Previous value: '-1'" — the `@if` branch index meaning "no branch rendered".
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(query(fixture, '.connectivity-banner')).not.toBeNull();
  });
});
