import { describe, it, expect, afterEach } from 'vitest';
import { AfterViewInit, Component, Injectable, ViewChild, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AnimationEvent } from '@angular/animations';
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
 *
 * The service is the real `ServerConnectivityService` with only `IsConnected$` swapped for a
 * controllable subject, so `BannerHeightPx` / `SetBannerHeightPx` are the shipped implementation.
 */

@Injectable()
class ControllableConnectivityService extends ServerConnectivityService {
  public readonly Connected$ = new BehaviorSubject<boolean>(true);
  public override readonly IsConnected$ = this.Connected$.asObservable();
}

const BANNER_HEIGHT_VAR = '--mj-connectivity-banner-height';

/** The `@slideDown.done` event the banner receives once its enter animation finishes. */
function enterDone(offsetHeight: number): AnimationEvent {
  return { toState: '', element: { offsetHeight } } as Partial<AnimationEvent> as AnimationEvent;
}

afterEach(() => document.documentElement.style.removeProperty(BANNER_HEIGHT_VAR));

function render(connected: boolean): { fixture: ComponentFixture<ServerConnectivityBannerComponent>; connected$: BehaviorSubject<boolean>; service: ControllableConnectivityService } {
  TestBed.configureTestingModule({
    imports: [ServerConnectivityBannerComponent],
    providers: [provideNoopAnimations(), { provide: ServerConnectivityService, useClass: ControllableConnectivityService }],
  });
  const service = TestBed.inject(ServerConnectivityService) as ControllableConnectivityService;
  service.Connected$.next(connected);
  const fixture = TestBed.createComponent(ServerConnectivityBannerComponent);
  fixture.detectChanges();
  return { fixture, connected$: service.Connected$, service };
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

  it('publishes its rendered height to the service and to the CSS custom property', () => {
    const { fixture, service } = render(false);
    fixture.componentInstance.OnAnimationDone(enterDone(35));
    expect(service.BannerHeightPx()).toBe(35);
    expect(document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR)).toBe('35px');
  });

  it('publishes zero when the banner leaves and when it is destroyed', () => {
    const { fixture, service } = render(false);
    fixture.componentInstance.OnAnimationDone(enterDone(35));
    fixture.componentInstance.OnAnimationDone({ toState: 'void' } as Partial<AnimationEvent> as AnimationEvent);
    expect(service.BannerHeightPx()).toBe(0);

    fixture.componentInstance.OnAnimationDone(enterDone(35));
    fixture.destroy();
    expect(service.BannerHeightPx()).toBe(0);
    expect(document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR)).toBe('0px');
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
    TestBed.configureTestingModule({
      imports: [ConnectivityHostComponent],
      providers: [provideNoopAnimations(), { provide: ServerConnectivityService, useClass: ControllableConnectivityService }],
    });
    const service = TestBed.inject(ServerConnectivityService) as ControllableConnectivityService;
    const fixture = TestBed.createComponent(ConnectivityHostComponent);
    fixture.componentInstance.DropConnection = () => service.Connected$.next(false);

    // The default `detectChanges()` runs the dev-mode check-no-changes pass. Before the fix this
    // threw NG0100 "Previous value: '-1'" — the `@if` branch index meaning "no branch rendered".
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(query(fixture, '.connectivity-banner')).not.toBeNull();
  });
});

/**
 * MJ #4377. A host shaped like `MJExplorerAppComponent`: a binding derived from the banner's height,
 * beside the banner, with the height published while views are refreshing. In the running Explorer
 * the banner's `@slideDown.done` listener is invoked from the animation flush inside the
 * change-detection pass; here `ngAfterViewInit` calls `OnAnimationDone` at the same point. Read
 * from the DOM (`getComputedStyle` on the custom property), that binding threw NG0100
 * "Previous value for 'attr.data-top': '60'. Current value: '95'". Read from the service signal,
 * the write marks the host view dirty and Angular re-refreshes it within the same pass.
 */
@Component({
  standalone: true,
  imports: [ServerConnectivityBannerComponent],
  template: `<mj-server-connectivity-banner></mj-server-connectivity-banner><div class="top-boundary" [attr.data-top]="TopBoundaryPx"></div>`,
})
class BannerHeightReaderHostComponent implements AfterViewInit {
  @ViewChild(ServerConnectivityBannerComponent) public Banner: ServerConnectivityBannerComponent | null = null;
  private readonly connectivity = inject(ServerConnectivityService);

  /** Same expression as `MJExplorerAppComponent.ChatOverlayTopBoundaryPx`. */
  public get TopBoundaryPx(): number {
    return 60 + this.connectivity.BannerHeightPx();
  }

  ngAfterViewInit(): void {
    this.Banner?.OnAnimationDone(enterDone(35));
  }
}

describe('ServerConnectivityBannerComponent (height published mid-pass, MJ #4377)', () => {
  it('a binding on BannerHeightPx follows the height without NG0100', () => {
    TestBed.configureTestingModule({
      imports: [BannerHeightReaderHostComponent],
      providers: [provideNoopAnimations(), { provide: ServerConnectivityService, useClass: ControllableConnectivityService }],
    });
    (TestBed.inject(ServerConnectivityService) as ControllableConnectivityService).Connected$.next(false);
    const fixture = TestBed.createComponent(BannerHeightReaderHostComponent);

    expect(() => fixture.detectChanges()).not.toThrow();
    expect(query(fixture, '.top-boundary')?.getAttribute('data-top')).toBe('95');
  });
});
