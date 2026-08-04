import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { RegisterClass } from '@memberjunction/global';
import { renderComponentFixture, capture } from '@memberjunction/ng-test-utils';
import { EntityActionUXHostComponent } from './entity-action-ux-host.component';
import { BaseEntityActionRuntimeUX } from './base-entity-action-runtime-ux';
import type { EntityActionUXContext, EntityActionUXResult } from './runtime-ux-context';

/**
 * DOM coverage for <mj-entity-action-ux-host> — the host that resolves an entity action's
 * RuntimeUXDriverClass via the ClassFactory and dynamically mounts it, forwarding the driver's
 * Completed / Cancelled outputs (~4×). A fake driver is registered under a test key so we can verify
 * the resolve-and-mount path (Context wired, Start() called, outputs forwarded) and both
 * DriverNotFound branches (empty key / unregistered key).
 *
 * ⚠️ PROCESS-GLOBAL REGISTRATION — the fake driver is registered into MJGlobal's ClassFactory under a
 * unique test-only key and never removed (no unregister API). Safe: the key is obviously test-only and
 * vitest isolates each file's process.
 */

const TEST_KEY = 'ZZZ_TestEntityActionDriver';

@RegisterClass(BaseEntityActionRuntimeUX, TEST_KEY)
@Component({ standalone: true, selector: 'test-eaux-driver', template: '<div class="driver-mounted"></div>' })
class FakeDriver extends BaseEntityActionRuntimeUX {
  public Started = false;
  Start(): void {
    this.Started = true;
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const CONTEXT = {} as EntityActionUXContext;

async function render(inputs: Record<string, unknown>) {
  const f = renderComponentFixture(EntityActionUXHostComponent, {
    imports: [EntityActionUXHostComponent, FakeDriver],
    inputs,
  });
  await tick(); // ngAfterViewInit defers mount() one microtask
  f.detectChanges(false);
  return f;
}
type Fx = Awaited<ReturnType<typeof render>>;
const driver = (f: Fx) => f.debugElement.query(By.directive(FakeDriver))?.componentInstance as FakeDriver | undefined;

describe('EntityActionUXHostComponent (DOM)', () => {
  it('references the fake driver so its @RegisterClass runs (guard)', () => {
    expect(FakeDriver).toBeDefined();
  });

  it('mounts the resolved driver, wires the context, and calls Start()', async () => {
    const f = await render({ DriverClass: TEST_KEY, Context: CONTEXT });
    const d = driver(f);
    expect(d).toBeTruthy();
    expect(d!.Context).toBe(CONTEXT);
    expect(d!.Started).toBe(true);
  });

  it('forwards the mounted driver Completed output', async () => {
    const f = await render({ DriverClass: TEST_KEY, Context: CONTEXT });
    const out = capture(f.componentInstance.Completed);
    const result = { Completed: true } as EntityActionUXResult;
    driver(f)!.Completed.emit(result);
    expect(out).toEqual([result]);
  });

  it('forwards the mounted driver Cancelled output', async () => {
    const f = await render({ DriverClass: TEST_KEY, Context: CONTEXT });
    const out = capture(f.componentInstance.Cancelled);
    driver(f)!.Cancelled.emit();
    expect(out.length).toBe(1);
  });

  it('emits DriverNotFound with the key when the driver class is not registered', async () => {
    // mount() is deferred to a microtask, so capture before awaiting it
    const f = renderComponentFixture(EntityActionUXHostComponent, { imports: [EntityActionUXHostComponent], inputs: { DriverClass: 'ZZZ_UnregisteredDriver', Context: CONTEXT } });
    const out = capture(f.componentInstance.DriverNotFound);
    await tick();
    f.detectChanges(false);
    expect(out).toEqual(['ZZZ_UnregisteredDriver']);
    expect(driver(f)).toBeFalsy();
  });

  it('emits DriverNotFound("(empty)") when no driver class is provided', async () => {
    const f = renderComponentFixture(EntityActionUXHostComponent, { imports: [EntityActionUXHostComponent], inputs: { Context: CONTEXT } });
    const out = capture(f.componentInstance.DriverNotFound);
    await tick();
    f.detectChanges(false);
    expect(out).toEqual(['(empty)']);
  });
});
