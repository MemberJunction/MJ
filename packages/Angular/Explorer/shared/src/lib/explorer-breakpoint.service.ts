import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * The SHELL mobile chrome breakpoint. Matches the `@media (max-width: 768px)`
 * blocks in shell.component.css that flip the hamburger/drawer chrome on —
 * TS consumers (records mobile mode, the drawer's Records pill) must engage
 * at exactly the same width or the shell shows mobile chrome while the
 * records surface still renders its desktop strip (or vice versa).
 *
 * NOTE: the newer ui-components chrome (left-nav drawer, filter-popover
 * sheet, page-body) breaks at 700px — that's component-local chrome with its
 * own constant. This one is the shell's.
 */
export const EXPLORER_MOBILE_BREAKPOINT_PX = 768;

/**
 * Reactive "is the shell in mobile chrome?" signal.
 *
 * matchMedia's `change` event fires OUTSIDE the Angular zone; the handler
 * re-enters via zone.run (same pattern as mj-filter-popover) so template
 * flips driven by the emission are seen by change detection. Zoneless
 * subscribers should still call SafeDetectChanges after mutating their own
 * state in the subscription.
 */
@Injectable({ providedIn: 'root' })
export class ExplorerBreakpointService implements OnDestroy {
  private zone = inject(NgZone);

  private query: MediaQueryList | null =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(`(max-width: ${EXPLORER_MOBILE_BREAKPOINT_PX}px)`)
      : null;

  private isMobile$ = new BehaviorSubject<boolean>(this.query?.matches ?? false);

  private onChange = (e: MediaQueryListEvent): void => {
    this.zone.run(() => this.isMobile$.next(e.matches));
  };

  constructor() {
    this.query?.addEventListener('change', this.onChange);
  }

  /** Current value, synchronous. */
  public get IsMobile(): boolean {
    return this.isMobile$.value;
  }

  /** Emits the current value on subscribe, then every breakpoint crossing. */
  public get IsMobile$(): Observable<boolean> {
    return this.isMobile$.asObservable();
  }

  // Root providers are destroyed on ApplicationRef teardown (tests,
  // multi-bootstrap) — release the matchMedia listener with them
  ngOnDestroy(): void {
    this.query?.removeEventListener('change', this.onChange);
  }
}
