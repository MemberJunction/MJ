import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, createFakeProvider, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { MjEntityFormHostComponent } from './entity-form-host.component';

/**
 * DOM coverage for <mj-entity-form-host> — the host that resolves + loads an entity form and mounts it
 * (~7×). Full resolve/mount needs real metadata + a form component, so these exercise the two chrome
 * states the host owns directly: the loading state (default, before any entity resolves) and the error
 * state via the real fail() path (an unknown entity name against a fake provider), including the
 * LoadError output. A fake provider is supplied through the [Provider] input.
 */

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('MjEntityFormHostComponent (DOM)', () => {
  it('shows the loading state while no entity has resolved', async () => {
    const f = renderComponentFixture(MjEntityFormHostComponent, {
      imports: [StubLoadingComponent],
      declarations: [MjEntityFormHostComponent],
      inputs: { Provider: createFakeProvider({ entities: [] }) }, // no EntityName → loadAndMount early-returns, loading stays true
    });
    await tick();
    f.detectChanges(false);
    expect(query(f, '.mj-form-host-loading')).not.toBeNull();
    expect(query(f, 'mj-loading')).not.toBeNull();
    expect(query(f, '.mj-form-host-error')).toBeNull();
  });

  it('shows the error state and emits LoadError when the entity is not found', async () => {
    // fail() emits LoadError synchronously inside ngAfterViewInit's loadAndMount, so subscribe in
    // `setup` (before the first CD) rather than after render.
    const loadError: Array<{ title: string; detail: string }> = [];
    const f = renderComponentFixture(MjEntityFormHostComponent, {
      imports: [StubLoadingComponent],
      declarations: [MjEntityFormHostComponent],
      inputs: { EntityName: 'ZZZ_NoSuchEntity', Provider: createFakeProvider({ entities: [] }) },
      setup: (c) => c.LoadError.subscribe((e) => loadError.push(e)),
    });
    await tick();
    f.detectChanges(false);
    expect(query(f, '.mj-form-host-error')).not.toBeNull();
    expect(text(f, '.mj-form-host-error-title')).toContain('ZZZ_NoSuchEntity');
    expect(query(f, '.mj-form-host-loading')).toBeNull();
    expect(loadError.length).toBe(1);
    expect(loadError[0].title).toContain('ZZZ_NoSuchEntity');
  });

  it('renders the error detail text for a missing entity', async () => {
    const f = renderComponentFixture(MjEntityFormHostComponent, {
      imports: [StubLoadingComponent],
      declarations: [MjEntityFormHostComponent],
      inputs: { EntityName: 'ZZZ_Missing', Provider: createFakeProvider({ entities: [] }) },
    });
    await tick();
    f.detectChanges(false);
    expect(text(f, '.mj-form-host-error-detail').length).toBeGreaterThan(0);
  });
});
