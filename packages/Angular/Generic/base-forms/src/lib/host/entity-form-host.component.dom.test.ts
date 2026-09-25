import { describe, it, expect, vi } from 'vitest';
import { Component } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, text, createFakeProvider, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { BaseEntity, EntityInfo, IMetadataProvider, LogError } from '@memberjunction/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MjEntityFormHostComponent } from './entity-form-host.component';
import { BaseFormComponent } from '../base-form-component';
import { EntityFormMode, FormResolution, FormResolverService } from '../resolver/form-resolver.service';
import { FormNotificationEvent } from '../types/form-types';

// Only LogError is doubled (the missing-standard-form path must log); everything else stays real.
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: vi.fn() };
});

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

// ── Standard-form switch (#4755) ─────────────────────────────────────────────
//
// The resolver is stubbed so each test controls the FormResolution; the two forms are real
// BaseFormComponent subclasses with the favorites/form-state bootstrap in ngOnInit skipped (it
// needs a live provider and is irrelevant to which form the host mounts).

@Component({ standalone: true, selector: 'test-gen-form', template: '<p class="gen">generated</p>' })
class GenForm extends BaseFormComponent {
  override async ngOnInit(): Promise<void> { /* skip provider-backed bootstrap */ }
}

@Component({ standalone: true, selector: 'test-custom-form', template: '<p class="custom">custom</p>' })
class CustomForm extends BaseFormComponent {
  override async ngOnInit(): Promise<void> { /* skip provider-backed bootstrap */ }
}

/** A custom form holding unsaved work its record doesn't show (e.g. a canvas/designer section). */
@Component({ standalone: true, selector: 'test-busy-custom-form', template: '<p class="custom">custom</p>' })
class BusyCustomForm extends BaseFormComponent {
  override async ngOnInit(): Promise<void> { /* skip provider-backed bootstrap */ }
  override get HasAdditionalUnsavedChanges(): boolean { return true; }
}

const ENTITY_NAME = 'Test Switch Entities';

function makeEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000001-0000-0000-0000-00000000A755',
    Name: ENTITY_NAME,
    Status: 'Active',
    BaseTable: 'TestSwitchEntity',
    BaseView: 'vwTestSwitchEntities',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true },
    ],
  });
}

/** A real BaseEntity whose saved-state is controllable (IsSaved is otherwise only set by a real save/load). */
class SwitchRecord extends BaseEntity {
  public Saved = true;
  override get IsSaved(): boolean { return this.Saved; }
}

function makeRecord(entityInfo: EntityInfo): SwitchRecord {
  const record = new SwitchRecord(entityInfo);
  record.SetMany({ ID: '11111111-2222-3333-4444-555555555555', Name: 'Original' }, true, true);
  return record;
}

const classResolution = (standard: typeof GenForm | null, subClass: typeof GenForm | typeof CustomForm | typeof BusyCustomForm = CustomForm): FormResolution =>
  ({ kind: 'class', subClass, variants: [], standard });

function stubResolver(resolution: FormResolution): Pick<FormResolverService, 'ResolveFormForEntity' | 'SetExplicitDefault' | 'SetSelectedVariant'> {
  return {
    ResolveFormForEntity: async () => resolution,
    SetExplicitDefault: () => undefined,
    SetSelectedVariant: () => undefined,
  };
}

interface SwitchHarness {
  f: ComponentFixture<MjEntityFormHostComponent>;
  modeChanges: EntityFormMode[];
  notifications: FormNotificationEvent[];
}

async function settle(f: ComponentFixture<MjEntityFormHostComponent>): Promise<void> {
  for (let i = 0; i < 4; i++) await tick();
  f.detectChanges(false);
}

async function mountSwitchHost(opts: {
  resolution: FormResolution;
  record?: BaseEntity;
  provider?: IMetadataProvider;
  inputs?: Record<string, unknown>;
}): Promise<SwitchHarness> {
  const entityInfo = makeEntityInfo();
  const modeChanges: EntityFormMode[] = [];
  const notifications: FormNotificationEvent[] = [];
  const provider = opts.provider ?? createFakeProvider({ entityByName: (n) => (n === ENTITY_NAME ? entityInfo : undefined) });
  const recordInput = opts.provider ? {} : { Record: opts.record ?? makeRecord(entityInfo) };
  const f = renderComponentFixture(MjEntityFormHostComponent, {
    imports: [StubLoadingComponent, MJButtonDirective],
    declarations: [MjEntityFormHostComponent],
    providers: [{ provide: FormResolverService, useValue: stubResolver(opts.resolution) }],
    inputs: { Provider: provider, ...recordInput, ...(opts.inputs ?? {}) },
    setup: (c) => {
      c.FormModeChange.subscribe((m) => modeChanges.push(m));
      c.Notification.subscribe((n) => notifications.push(n));
    },
  });
  await settle(f);
  return { f, modeChanges, notifications };
}

const switchButton = (f: ComponentFixture<MjEntityFormHostComponent>): HTMLButtonElement | null =>
  query(f, '.mj-form-host-mode-switch') as HTMLButtonElement | null;

describe('MjEntityFormHostComponent — standard-form switch (DOM)', () => {
  it('offers the standard form above a custom class form', async () => {
    const { f } = await mountSwitchHost({ resolution: classResolution(GenForm) });
    expect(query(f, '.mj-form-host-mode-strip')).not.toBeNull();
    expect(switchButton(f)?.textContent?.trim()).toBe('Open standard form');
    expect(query(f, '.custom')).not.toBeNull();
    expect(query(f, '.gen')).toBeNull();
  });

  it('clicking the switch mounts the standard form and emits FormModeChange', async () => {
    const { f, modeChanges } = await mountSwitchHost({ resolution: classResolution(GenForm) });
    switchButton(f)?.click();
    await settle(f);
    expect(query(f, '.gen')).not.toBeNull();
    expect(query(f, '.custom')).toBeNull();
    expect(modeChanges).toEqual(['standard']);
    expect(f.componentInstance.FormMode).toBe('standard');
    expect(switchButton(f)?.textContent?.trim()).toBe('Back to custom view');
  });

  it('switching back returns to the custom form', async () => {
    const { f, modeChanges } = await mountSwitchHost({ resolution: classResolution(GenForm) });
    expect(f.componentInstance.SwitchFormMode('standard')).toBe(true);
    await settle(f);
    expect(f.componentInstance.SwitchFormMode('default')).toBe(true);
    await settle(f);
    expect(query(f, '.custom')).not.toBeNull();
    expect(query(f, '.gen')).toBeNull();
    expect(modeChanges).toEqual(['standard', 'default']);
  });

  it("FormMode='standard' at mount renders the standard form immediately", async () => {
    const { f } = await mountSwitchHost({ resolution: classResolution(GenForm), inputs: { FormMode: 'standard' } });
    expect(query(f, '.gen')).not.toBeNull();
    expect(query(f, '.custom')).toBeNull();
    expect(switchButton(f)?.textContent?.trim()).toBe('Back to custom view');
  });

  it('shows no strip when the only form is the generated one', async () => {
    const { f } = await mountSwitchHost({ resolution: classResolution(GenForm, GenForm) });
    expect(query(f, '.gen')).not.toBeNull();
    expect(query(f, '.mj-form-host-mode-strip')).toBeNull();
    expect(f.componentInstance.HasStandardFormAlternative).toBe(false);
  });

  it('ShowFormModeSwitch=false hides the strip even over a custom form', async () => {
    const { f } = await mountSwitchHost({ resolution: classResolution(GenForm), inputs: { ShowFormModeSwitch: false } });
    expect(query(f, '.custom')).not.toBeNull();
    expect(query(f, '.mj-form-host-mode-strip')).toBeNull();
  });

  it('refuses to switch away from unsaved edits and warns instead', async () => {
    const record = makeRecord(makeEntityInfo());
    const { f, modeChanges, notifications } = await mountSwitchHost({ resolution: classResolution(GenForm), record });
    record.SetMany({ Name: 'Edited' });
    expect(record.Dirty).toBe(true);
    expect(f.componentInstance.SwitchFormMode('standard')).toBe(false);
    await settle(f);
    expect(notifications.length).toBe(1);
    expect(notifications[0].Type).toBe('warning');
    expect(modeChanges).toEqual([]);
    expect(query(f, '.custom')).not.toBeNull();
    expect(query(f, '.gen')).toBeNull();
  });

  it('a brand-new record switches (not blocked as dirty) and keeps the same record instance', async () => {
    const entityInfo = makeEntityInfo();
    const record = makeRecord(entityInfo);
    record.Saved = false; // new record: BaseEntity.Dirty is always true until the first save
    let loads = 0;
    const provider = Object.assign(
      createFakeProvider({ entityByName: (n) => (n === ENTITY_NAME ? entityInfo : undefined) }),
      { GetEntityObject: async () => { loads++; return record; } },
    );
    // No Record input → the host loads a new record itself (empty PrimaryKey → NewRecord()).
    const { f, notifications } = await mountSwitchHost({ resolution: classResolution(GenForm), provider, inputs: { EntityName: ENTITY_NAME } });
    expect(query(f, '.custom')).not.toBeNull();
    expect(f.componentInstance.SwitchFormMode('standard')).toBe(true);
    await settle(f);
    expect(notifications).toEqual([]);
    expect(query(f, '.gen')).not.toBeNull();
    expect(loads).toBe(1); // the live new record was carried across, not re-created
    expect(f.componentInstance.Form?.record).toBe(record);
  });

  it("FormMode='standard' with no standard form registered falls back to the default and logs", async () => {
    const { f } = await mountSwitchHost({ resolution: classResolution(null), inputs: { FormMode: 'standard' } });
    expect(query(f, '.custom')).not.toBeNull();
    expect(query(f, '.mj-form-host-mode-strip')).toBeNull();
    expect(query(f, '.mj-form-host-error')).toBeNull();
    expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining(ENTITY_NAME));
  });

  it('refuses to switch while the form holds unsaved work its record does not show', async () => {
    const { f, modeChanges, notifications } = await mountSwitchHost({ resolution: classResolution(GenForm, BusyCustomForm) });
    expect(f.componentInstance.SwitchFormMode('standard')).toBe(false);
    await settle(f);
    expect(notifications.map((n) => n.Type)).toEqual(['warning']);
    expect(modeChanges).toEqual([]);
    expect(query(f, '.custom')).not.toBeNull();
  });

  it('refuses a new record whose form holds unsaved work (only its own fields are carried across)', async () => {
    const record = makeRecord(makeEntityInfo());
    record.Saved = false;
    const { f, notifications } = await mountSwitchHost({ resolution: classResolution(GenForm, BusyCustomForm), record });
    expect(f.componentInstance.SwitchFormMode('standard')).toBe(false);
    expect(notifications.map((n) => n.Type)).toEqual(['warning']);
  });

  it('returns keyboard focus to the switch button after a strip-initiated switch', async () => {
    const { f } = await mountSwitchHost({ resolution: classResolution(GenForm) });
    const before = switchButton(f);
    before?.focus();
    before?.click();
    f.detectChanges(false); // the post-click CD pass the app's zone would run: the strip unmounts while loading
    expect(query(f, '.mj-form-host-mode-strip')).toBeNull();
    await settle(f);
    const after = switchButton(f);
    expect(after?.textContent?.trim()).toBe('Back to custom view');
    expect(document.activeElement).toBe(after);
  });

  it('announces the mode text politely and is not a landmark', async () => {
    const { f } = await mountSwitchHost({ resolution: classResolution(GenForm) });
    expect(query(f, '.mj-form-host-mode-text')?.getAttribute('aria-live')).toBe('polite');
    expect(query(f, '.mj-form-host-mode-strip')?.getAttribute('role')).toBeNull();
  });

  it('hides the strip when the record then fails to load', async () => {
    const entityInfo = makeEntityInfo();
    const provider = Object.assign(
      createFakeProvider({ entityByName: (n) => (n === ENTITY_NAME ? entityInfo : undefined) }),
      { GetEntityObject: async () => null },
    );
    const { f } = await mountSwitchHost({ resolution: classResolution(GenForm), provider, inputs: { EntityName: ENTITY_NAME } });
    expect(query(f, '.mj-form-host-error')).not.toBeNull();
    expect(query(f, '.mj-form-host-mode-strip')).toBeNull();
    expect(f.componentInstance.HasStandardFormAlternative).toBe(false);
  });

  it('a FormMode input change after init mounts the standard form without echoing FormModeChange', async () => {
    const { f, modeChanges } = await mountSwitchHost({ resolution: classResolution(GenForm) });
    f.componentRef.setInput('FormMode', 'standard');
    await settle(f);
    expect(query(f, '.gen')).not.toBeNull();
    expect(query(f, '.custom')).toBeNull();
    expect(modeChanges).toEqual([]);
  });

  it('picking a variant while on the standard form flips back to default and emits', async () => {
    // A variant pick drops the bound record and reloads it, so the host loads through the provider.
    const entityInfo = makeEntityInfo();
    const provider = Object.assign(
      createFakeProvider({ entityByName: (n) => (n === ENTITY_NAME ? entityInfo : undefined) }),
      { GetEntityObject: async () => makeRecord(entityInfo) },
    );
    const { f, modeChanges } = await mountSwitchHost({ resolution: classResolution(GenForm), provider, inputs: { EntityName: ENTITY_NAME } });
    expect(f.componentInstance.SwitchFormMode('standard')).toBe(true);
    await settle(f);
    f.componentInstance.Form?.OnVariantChanged(null);
    await settle(f);
    expect(modeChanges).toEqual(['standard', 'default']);
    expect(f.componentInstance.FormMode).toBe('default');
    expect(query(f, '.custom')).not.toBeNull();
  });
});
