/**
 * Tests the guarantee that the Explorer loading screen is ALWAYS released, even when a resource's
 * load throws or hangs — the two halves of the "one dashboard's error bricks the whole Explorer" fix:
 *
 *   1. BaseDashboard wraps initDashboard() + loadData() (ngOnInit) and loadData() (Refresh) in
 *      try/catch(LogError + Error.emit)/finally(NotifyLoadComplete). A throwing load still signals.
 *   2. BaseResourceComponent's load-complete watchdog FAILS OPEN — if a subclass never calls
 *      NotifyLoadComplete within the window (e.g. one whose own ngOnInit bypasses BaseDashboard's
 *      guarded lifecycle, or a hung load), the watchdog forces the signal so the shell can't hang.
 *
 * The shell's "loading done" signal is the LoadCompleteEvent callback, so every test asserts on that
 * (that's exactly what the loading screen waits for) plus the error side-channel.
 *
 * Follows this package's existing unit-test style (shared.test.ts): mock @angular/core to no-op
 * decorators + a real-ish EventEmitter, and instantiate the real base classes directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';

// --- Angular surface: no-op decorators, per-instance EventEmitter, inject() → a universal stub. ---
const injectStub = {
   // NavigationService usage: QueryParamChanged$.pipe(...).subscribe(...)
   QueryParamChanged$: new Subject<unknown>(),
   ObserveTabQueryParams: () => new Subject<unknown>(),
   // ChangeDetectorRef usage: markForCheck()
   markForCheck: vi.fn(),
};
vi.mock('@angular/core', () => ({
   Directive: () => (target: unknown) => target,
   Injectable: () => (target: unknown) => target,
   Input: () => () => {},
   Output: () => () => {},
   inject: () => injectStub,
   ChangeDetectorRef: class {},
   EventEmitter: class<T> {
      public emit = vi.fn<(value?: T) => void>();
   },
}));
vi.mock('@memberjunction/ng-base-types', () => ({ BaseAngularComponent: class {} }));
// Path is relative to the module doing the import (base-resource-component.ts in ../), not this test.
vi.mock('../navigation.service', () => ({ NavigationService: class {}, TabQueryParamUpdateGuard: class {} }));
vi.mock('@memberjunction/core-entities', () => ({
   ResourceData: class { public Configuration: Record<string, unknown> = {}; },
   MJDashboardEntityExtended: class {},
}));
// LogError is the error-logging half of the catch — spy on it.
const logErrorSpy = vi.fn();
vi.mock('@memberjunction/core', () => ({
   LogError: (...args: unknown[]) => logErrorSpy(...args),
   CompositeKey: class {},
   BaseEntity: class {},
}));

import { BaseDashboard } from '../base-dashboard';
import { BaseResourceComponent } from '../base-resource-component';

/** Minimal concrete dashboard whose init/load behavior each test sets. */
class TestDashboard extends BaseDashboard {
   public initThrows = false;
   public loadThrows = false;
   public loadResolved = false;
   protected initDashboard(): void {
      if (this.initThrows) throw new Error('initDashboard boom');
   }
   protected async loadData(): Promise<void> {
      if (this.loadThrows) throw new Error('loadData boom');
      this.loadResolved = true;
   }
}

/** A raw BaseResourceComponent subclass that NEVER signals load-complete — the watchdog's job. */
class SilentResource extends BaseResourceComponent {}

function makeShellReleaseSpy(cmp: BaseResourceComponent): ReturnType<typeof vi.fn> {
   const spy = vi.fn();
   // LoadCompleteEvent is precisely the callback the shell's loading screen waits on.
   (cmp as unknown as { LoadCompleteEvent: () => void }).LoadCompleteEvent = spy;
   return spy;
}

describe('Explorer loading-screen release guarantee', () => {
   beforeEach(() => {
      logErrorSpy.mockClear();
      injectStub.markForCheck.mockClear();
   });

   describe('BaseDashboard.ngOnInit — guaranteed NotifyLoadComplete', () => {
      it('releases the loading screen on the happy path', async () => {
         const d = new TestDashboard();
         const release = makeShellReleaseSpy(d);

         await d.ngOnInit();

         expect(d.loadResolved).toBe(true);
         expect(release).toHaveBeenCalledTimes(1);
         expect(d.Error.emit).not.toHaveBeenCalled();
         expect(logErrorSpy).not.toHaveBeenCalled();
      });

      it('STILL releases the loading screen when loadData() throws (the core bug)', async () => {
         const d = new TestDashboard();
         d.loadThrows = true;
         const release = makeShellReleaseSpy(d);

         await d.ngOnInit();

         expect(release).toHaveBeenCalledTimes(1);            // shell freed, not bricked
         expect(logErrorSpy).toHaveBeenCalledTimes(1);        // error logged
         expect(d.Error.emit).toHaveBeenCalledTimes(1);       // surfaced to container/subclass
         expect((d.Error.emit as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeInstanceOf(Error);
      });

      it('STILL releases the loading screen when initDashboard() throws (Matt: wrap initDashboard too)', async () => {
         const d = new TestDashboard();
         d.initThrows = true;
         const release = makeShellReleaseSpy(d);

         await d.ngOnInit();

         expect(release).toHaveBeenCalledTimes(1);
         expect(d.loadResolved).toBe(false);                  // load never reached
         expect(logErrorSpy).toHaveBeenCalledTimes(1);
         expect(d.Error.emit).toHaveBeenCalledTimes(1);
      });
   });

   describe('BaseDashboard.Refresh — guaranteed NotifyLoadComplete', () => {
      it('releases on success and re-releases on a throwing refresh', async () => {
         const d = new TestDashboard();
         const release = makeShellReleaseSpy(d);

         await d.Refresh();
         expect(release).toHaveBeenCalledTimes(1);
         expect(d.Error.emit).not.toHaveBeenCalled();

         d.loadThrows = true;
         await d.Refresh();
         expect(release).toHaveBeenCalledTimes(2);            // still fires on error
         expect(logErrorSpy).toHaveBeenCalledTimes(1);
         expect(d.Error.emit).toHaveBeenCalledTimes(1);
      });
   });

   describe('BaseResourceComponent watchdog — fail-open', () => {
      beforeEach(() => vi.useFakeTimers());
      afterEach(() => vi.useRealTimers());

      it('forces load-complete when a subclass never signals within the window', () => {
         const c = new SilentResource();
         const release = makeShellReleaseSpy(c);
         const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

         c.ngOnInit();                                        // starts the watchdog; never notifies
         expect(release).not.toHaveBeenCalled();              // ...still hung right up until the window

         vi.advanceTimersByTime(15_000);                      // LOAD_COMPLETE_WATCHDOG_MS

         expect(warn).toHaveBeenCalled();                     // names the culprit
         expect(String(warn.mock.calls[0][0])).toContain('FAILING OPEN');
         expect(release).toHaveBeenCalledTimes(1);            // shell released by the watchdog

         c.ngOnDestroy();
         warn.mockRestore();
      });

      it('does NOT fire the watchdog when the component signals in time', () => {
         const c = new SilentResource();
         const release = makeShellReleaseSpy(c);
         const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

         c.ngOnInit();
         (c as unknown as { NotifyLoadComplete: () => void }).NotifyLoadComplete(); // normal signal
         expect(release).toHaveBeenCalledTimes(1);

         vi.advanceTimersByTime(15_000);                      // watchdog window elapses

         expect(warn).not.toHaveBeenCalled();                 // cleared — no fail-open, no double release
         expect(release).toHaveBeenCalledTimes(1);

         c.ngOnDestroy();
         warn.mockRestore();
      });
   });
});
