import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Subject } from 'rxjs';

const injectStub = {
   QueryParamChanged$: new Subject<unknown>(),
   ResourceReattached$: new Subject<unknown>(),
   ObserveTabQueryParams: () => new Subject<unknown>(),
   markForCheck: vi.fn(),
};
const globalEvents = vi.hoisted(() => ({ subject: null as null | { next(v: unknown): void } }));
vi.mock('@angular/core', () => ({
   Directive: () => (target: unknown) => target,
   Injectable: () => (target: unknown) => target,
   Input: () => () => {},
   Output: () => () => {},
   inject: () => injectStub,
   ChangeDetectorRef: class {},
   EventEmitter: class<T> { public emit = vi.fn<(value?: T) => void>(); },
}));
vi.mock('@memberjunction/ng-base-types', () => ({ BaseAngularComponent: class {} }));
vi.mock('../navigation.service', () => ({ NavigationService: class {}, TabQueryParamUpdateGuard: class {} }));
vi.mock('@memberjunction/core-entities', () => ({
   ResourceData: class { public Configuration: Record<string, unknown> = {}; },
   MJDashboardEntityExtended: class {},
}));
vi.mock('@memberjunction/core', () => ({
   LogError: vi.fn(),
   CompositeKey: class {},
   BaseEntity: class { static BaseEventCode = 'BaseEntityEvent'; },
   BaseEntityEvent: class {},
}));
vi.mock('@memberjunction/global', async () => {
   const { Subject: RxSubject } = await import('rxjs');
   const subject = new RxSubject<unknown>();
   globalEvents.subject = subject;
   return {
      MJEventType: { ComponentEvent: 'ComponentEvent' },
      MJGlobal: { Instance: { GetEventListener: () => subject.asObservable() } },
   };
});

import { BaseResourceComponent } from '../base-resource-component';

/**
 * A cached tab or nav item reattaches without re-running init. The base class tells the
 * component (OnReattached), and a component that watches entities reloads only when one of them
 * changed while it was away (OnStaleOnReattach).
 */
class TestResource extends BaseResourceComponent {
   public Reattached = 0;
   public Stale = 0;
   public Watch(...names: string[]): void { this.WatchEntities(...names); }
   protected override OnStaleOnReattach(): void { this.Stale++; }
   async GetResourceDisplayName(): Promise<string> { return 'x'; }
   async GetResourceIconClass(): Promise<string> { return ''; }
}

class CountingResource extends TestResource {
   protected override OnReattached(): void { this.Reattached++; }
}

function entityEvent(entityName: string, type: string): unknown {
   return { event: 'ComponentEvent', eventCode: 'BaseEntityEvent', args: { type, entityName } };
}

async function flush(): Promise<void> {
   for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('BaseResourceComponent reattach', () => {
   let resources: BaseResourceComponent[];
   beforeEach(() => {
      vi.useFakeTimers();
      resources = [];
   });
   const make = <T extends BaseResourceComponent>(r: T): T => {
      r.ngOnInit();
      resources.push(r);
      return r;
   };
   const cleanup = () => { resources.forEach(r => r.ngOnDestroy()); vi.useRealTimers(); };

   it('calls OnReattached for this instance only', async () => {
      const mine = make(new CountingResource());
      const other = make(new CountingResource());
      injectStub.ResourceReattached$.next(mine);
      await flush();
      expect(mine.Reattached).toBe(1);
      expect(other.Reattached).toBe(0);
      cleanup();
   });

   it('reloads once on the next reattach after a watched entity is saved', async () => {
      const r = make(new TestResource());
      r.Watch('MJ: Credentials');
      globalEvents.subject!.next(entityEvent('MJ: Credentials', 'save'));
      injectStub.ResourceReattached$.next(r);
      await flush();
      injectStub.ResourceReattached$.next(r);
      await flush();
      expect(r.Stale).toBe(1);
      cleanup();
   });

   it('does not reload for other entities or for events that are not saves or deletes', async () => {
      const r = make(new TestResource());
      r.Watch('MJ: Credentials');
      globalEvents.subject!.next(entityEvent('MJ: Users', 'save'));
      globalEvents.subject!.next(entityEvent('MJ: Credentials', 'load_complete'));
      injectStub.ResourceReattached$.next(r);
      await flush();
      expect(r.Stale).toBe(0);
      cleanup();
   });

   it('reloads after a watched entity is deleted, matching the name without case', async () => {
      const r = make(new TestResource());
      r.Watch('MJ: Credentials');
      globalEvents.subject!.next(entityEvent('mj: credentials', 'delete'));
      injectStub.ResourceReattached$.next(r);
      await flush();
      expect(r.Stale).toBe(1);
      cleanup();
   });
});
