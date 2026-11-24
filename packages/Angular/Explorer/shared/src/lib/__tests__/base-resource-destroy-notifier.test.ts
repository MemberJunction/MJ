/**
 * Memory-leak audit Round 23: a `takeUntil(this.destroy$)` attached AFTER a resource component was
 * destroyed must end immediately.
 *
 * Resource components routinely `await` their data in `ngOnInit` and only then subscribe to root
 * services, engines or the MJGlobal event bus. If the tab is closed during that await, `ngOnDestroy`
 * has already run by the time the subscription is made. `takeUntil` stops only when its notifier
 * EMITS — it ignores a notifier that merely completed — so with a plain `Subject` that was already
 * `next()`ed and `complete()`d, the late subscription never ended and pinned the dead component for
 * the rest of the session. `BaseResourceComponent.ngOnDestroy` now swaps in a notifier that has
 * already fired and replays it.
 *
 * Follows this package's unit-test style (base-dashboard-loadcomplete.test.ts): mock `@angular/core`
 * to no-op decorators and instantiate the real base class directly.
 */
import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

const injectStub = {
   QueryParamChanged$: new Subject<unknown>(),
   ObserveTabQueryParams: () => new Subject<unknown>(),
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
}));
vi.mock('@memberjunction/core', () => ({
   LogError: vi.fn(),
   BaseEntity: class {},
}));

import { BaseResourceComponent } from '../base-resource-component';

/** A long-lived source, standing in for a root service or the MJGlobal event bus. */
type SessionSource = BehaviorSubject<number>;

/** A resource that subscribes to a session-lived source the way subclasses do. */
class LateSubscribingResource extends BaseResourceComponent {
   public Received: number[] = [];

   public async GetResourceDisplayName(): Promise<string> {
      return 'Test';
   }

   public async GetResourceIconClass(): Promise<string> {
      return '';
   }

   /** What a subclass does after its `await` in `ngOnInit`. */
   public SubscribeTo(source: SessionSource): void {
      source.pipe(takeUntil(this.destroy$)).subscribe((value) => this.Received.push(value));
   }
}

/** Mirrors the many subclasses that redeclare `destroy$` with their own Subject. */
class RedeclaringResource extends LateSubscribingResource {
   protected override destroy$ = new Subject<void>();
}

describe('BaseResourceComponent destroy notifier', () => {
   it('ends a subscription made before destroy when the component is destroyed', () => {
      const source: SessionSource = new BehaviorSubject(1);
      const resource = new LateSubscribingResource();

      resource.SubscribeTo(source);
      expect(source.observed).toBe(true);

      resource.ngOnDestroy();

      expect(source.observed).toBe(false);
      source.next(2);
      expect(resource.Received).toEqual([1]);
   });

   it('ends a subscription made AFTER destroy immediately, so it never reaches the dead component', () => {
      const source: SessionSource = new BehaviorSubject(1);
      const resource = new LateSubscribingResource();

      // The tab closes while ngOnInit is still awaiting its data...
      resource.ngOnDestroy();
      // ...then the await settles and the subclass subscribes.
      resource.SubscribeTo(source);

      expect(source.observed).toBe(false);
      source.next(2);
      expect(resource.Received).toEqual([]);
   });

   it('covers subclasses that redeclare destroy$ with their own Subject', () => {
      const source: SessionSource = new BehaviorSubject(1);
      const resource = new RedeclaringResource();

      resource.ngOnDestroy();
      resource.SubscribeTo(source);

      expect(source.observed).toBe(false);
      source.next(2);
      expect(resource.Received).toEqual([]);
   });

   it('stays inert when a subclass signals destroy$ again after super.ngOnDestroy()', () => {
      const resource = new RedeclaringResource();
      resource.ngOnDestroy();

      const notifier = (resource as unknown as { destroy$: Subject<void> }).destroy$;
      expect(() => {
         notifier.next();
         notifier.complete();
      }).not.toThrow();

      const source: SessionSource = new BehaviorSubject(1);
      resource.SubscribeTo(source);
      expect(source.observed).toBe(false);
   });
});
