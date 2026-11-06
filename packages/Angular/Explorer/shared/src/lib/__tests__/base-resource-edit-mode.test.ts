import { describe, it, expect, vi } from 'vitest';
import { Subject } from 'rxjs';

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
   BaseEntity: class {},
}));

import { BaseResourceComponent } from '../base-resource-component';

/**
 * The edit-mode callback is how a hosted form's "edit started" reaches the
 * tab container, which promotes (pins) the records preview tab. Same shape as
 * ResourceCloseRequestedEvent: a settable callback the shell wires at creation.
 */
class TestResource extends BaseResourceComponent {
   async GetResourceDisplayName(): Promise<string> { return 'x'; }
   async GetResourceIconClass(): Promise<string> { return ''; }
   public editModeChanged(editing: boolean): void { this.NotifyEditModeChanged(editing); }
}

describe('BaseResourceComponent.NotifyEditModeChanged', () => {
   it('invokes the wired handler with the edit flag', () => {
      const r = new TestResource();
      const handler = vi.fn<(editing: boolean) => void>();
      r.ResourceEditModeChangedEvent = handler;
      r.editModeChanged(true);
      r.editModeChanged(false);
      expect(handler.mock.calls).toEqual([[true], [false]]);
   });

   it('is a no-op when nothing is wired (resources hosted outside the shell)', () => {
      const r = new TestResource();
      expect(() => r.editModeChanged(true)).not.toThrow();
   });

   it('keeps the IsEditing() fallback at its default of false', () => {
      expect(new TestResource().IsEditing()).toBe(false);
   });
});
