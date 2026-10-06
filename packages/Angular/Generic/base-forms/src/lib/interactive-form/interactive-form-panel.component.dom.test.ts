import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BaseEntity } from '@memberjunction/core';
import { ReactBridgeService, type MJReactComponent } from '@memberjunction/ng-react';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { InteractiveFormsEngine, type MJComponentEntity } from '@memberjunction/core-entities';
import { InteractiveFormPanelComponent } from './interactive-form-panel.component';
import type { FormContributionRegistration } from '../panel-slot/form-contribution';
import type { BaseFormComponent } from '../base-form-component';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { FormPanelEventNames, type FormPanelHostProps } from '@memberjunction/interactive-component-types/forms';
import { FormFieldEditCoordinator, type FormFieldEdit } from '../form-field-edit.coordinator';

const logError = vi.hoisted(() => vi.fn());
vi.mock('@memberjunction/core', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LogError: (...args: unknown[]) => logError(...args),
}));

/**
 * DOM coverage for <mj-interactive-form-panel> — the generic BaseFormPanel that renders a
 * metadata contribution's React component. Spec loading (engine + React bridge) lives in
 * ngOnInit and is stubbed; these cover the host's own chrome decisions: bare vs panel wrapping,
 * loading / error / mounted states, and the section identity handed to the collapsible panel.
 */

@Component({ standalone: true, selector: 'mj-react-component', template: '<div class="react-stub"></div>' })
class ReactStub { @Input() component: unknown; @Input() componentProps: unknown;
  @Output() componentEvent = new EventEmitter<unknown>(); @Output() openEntityRecord = new EventEmitter<unknown>(); }
@Component({ standalone: true, selector: 'mj-alert', template: '<ng-content></ng-content>' })
class AlertStub { @Input() Variant = ''; }
@Component({ standalone: true, selector: 'mj-collapsible-panel', template: '<section class="panel-stub" [attr.data-key]="SectionKey" [attr.data-name]="SectionName"><ng-content></ng-content></section>' })
class PanelStub { @Input() SectionKey = ''; @Input() SectionName = ''; @Input() Icon = ''; @Input() Variant = ''; @Input() Form: unknown; @Input() FormContext: unknown; @Input() DefaultExpanded: unknown; @Input() Order: number | null = null; }

const RECORD = { EntityInfo: { Name: 'MJ_BizApps_Common: People' }, Fields: [], GetAll: () => ({}), PrimaryKey: { HasValue: false } } as unknown as BaseEntity;
const FORM = { EditMode: false, UserCanEdit: true, UserCanDelete: false, UserCanCreate: false, IsSectionExpanded: () => true, SetSectionRowCount: vi.fn(), formContext: {} } as unknown as BaseFormComponent;

function contribution(over: Partial<FormContributionRegistration> = {}): FormContributionRegistration {
  return {
    Priority: 0, Source: 'metadata', ComponentID: 'comp-1', RowID: 'row-1', Title: 'Lifetime value', Presentation: 'panel',
    Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'after-fields', contributionKey: 'skip:person-ltv' },
    ...over,
  };
}

interface State {
  loadError?: string | null;
  componentSpec?: Pick<ComponentSpec, 'name'>;
  HostProps?: Pick<FormPanelHostProps, 'record'>;
}
type OnInitProto = { ngOnInit: () => Promise<void> };
function render(c: FormContributionRegistration, state: State = {}) {
  vi.spyOn(InteractiveFormPanelComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockResolvedValue(undefined);
  return renderComponentFixture(InteractiveFormPanelComponent, {
    imports: [ReactStub, AlertStub, PanelStub],
    declarations: [InteractiveFormPanelComponent],
    providers: [{ provide: ReactBridgeService, useValue: {} }],
    inputs: { Contribution: c, Record: RECORD, FormComponent: FORM },
    setup: (inst) => {
      if (state.loadError !== undefined) inst.loadError = state.loadError;
      if (state.componentSpec !== undefined) inst.componentSpec = state.componentSpec as ComponentSpec;
      if (state.HostProps !== undefined) inst.HostProps = state.HostProps as FormPanelHostProps;
    },
  });
}

afterEach(() => vi.restoreAllMocks());

describe('InteractiveFormPanelComponent (DOM)', () => {
  it('wraps a panel-presentation contribution in a collapsible panel keyed by the contribution key', () => {
    const f = render(contribution());
    const panel = query(f, '.panel-stub');
    expect(panel?.getAttribute('data-key')).toBe('skip:person-ltv');
    expect(panel?.getAttribute('data-name')).toBe('Lifetime value');
  });

  it('renders a bare contribution with no collapsible panel', () => {
    const f = render(contribution({ Presentation: 'bare' }));
    expect(query(f, '.panel-stub')).toBeNull();
    expect(query(f, '.mj-loading-state')).not.toBeNull();
  });

  // One TestBed per test: `renderComponentFixture` configures the testing module, and a
  // second call inside the same `it` throws "test module has already been instantiated".
  it('shows the loading state while the spec is still resolving', () => {
    const f = render(contribution());
    expect(query(f, '.react-stub')).toBeNull();
    expect(query(f, '.mj-loading-state')).not.toBeNull();
  });

  it('mounts the React component once spec and props exist', () => {
    const mounted = render(contribution(), { componentSpec: { name: 'X' }, HostProps: { record: {} } });
    expect(query(mounted, '.react-stub')).not.toBeNull();
    expect(query(mounted, '.mj-loading-state')).toBeNull();
  });

  it('shows the load error instead of the React component', () => {
    const f = render(contribution(), { loadError: 'Component comp-1 not found.' });
    expect(text(f, 'mj-alert')).toContain('Component comp-1 not found.');
    expect(query(f, '.react-stub')).toBeNull();
  });

  it('uses the related-entity variant when the contribution claims a grid', () => {
    const f = render(contribution({ Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'after-related', relatedEntity: 'MJ_BizApps_Orders: Event Order Lines' } }));
    expect(f.componentInstance.Variant).toBe('related-entity');
    expect(f.componentInstance.SectionKey).toBe('related:MJ_BizApps_Orders: Event Order Lines:');
  });
});


/**
 * A form sequences its panels with CSS `order` taken from its section order, and a
 * contribution's key is never in that list — `getSectionDisplayOrder` answers with the
 * section count, the highest order on the form, so the panel rendered last whatever slot it
 * mounted in. The slot has to decide the order instead.
 */
describe('InteractiveFormPanelComponent (DOM) — order follows the slot', () => {
  const at = (slot: string) => render(contribution({
    Metadata: { entity: 'MJ_BizApps_Common: People', slot, contributionKey: 'skip:person-ltv' },
  } as Partial<FormContributionRegistration>));

  it('passes a slot-derived order to the panel rather than leaving it to the section lookup', () => {
    const f = at('before-fields');
    const stub = f.debugElement.query(By.directive(PanelStub)).componentInstance as PanelStub;
    expect(stub.Order).toBe(f.componentInstance.DisplayOrder);
    expect(stub.Order).toBeLessThan(0);
  });
});

/** A record with real field values, for the tests that read or write them. */
function editableRecord(values: Record<string, unknown>) {
  const fields = Object.keys(values).map((name) => ({ Name: name, Value: values[name] }));
  return {
    EntityInfo: { Name: 'MJ_BizApps_Common: People', DisplayName: 'People' },
    Fields: fields.map((f) => ({ ...f, EntityFieldInfo: { Name: f.Name } })),
    GetAll() { return Object.fromEntries(this.Fields.map((f: { Name: string; Value: unknown }) => [f.Name, f.Value])); },
    Set(name: string, value: unknown) { const f = this.Fields.find((x: { Name: string }) => x.Name === name); if (f) f.Value = value; },
    PrimaryKey: { HasValue: false },
  };
}
type PanelInternals = { loadSpec(): Promise<void>; applyFieldChange(name: string, value: unknown): void };

/**
 * A panel's component is a Widget the forms engine does not load with the forms. The engine
 * fetches it once by ID, so a second mount of the same panel costs no query.
 */
describe('InteractiveFormPanelComponent (DOM) — loading its component', () => {
  it('asks the forms engine for the component by ID', async () => {
    vi.spyOn(InteractiveFormsEngine.Instance, 'Config').mockResolvedValue(undefined);
    const lookup = vi.spyOn(InteractiveFormsEngine.Instance, 'GetComponentByID').mockResolvedValue({
      Name: 'LTV strip', Specification: JSON.stringify({ name: 'LTV', componentRole: 'form-panel' }),
    } as unknown as MJComponentEntity);
    const f = render(contribution());
    await (f.componentInstance as unknown as PanelInternals).loadSpec();
    expect(lookup).toHaveBeenCalledWith('comp-1', undefined, undefined);
    expect(f.componentInstance.componentSpec?.name).toBe('LTV');
    expect(f.componentInstance.loadError).toBeNull();
  });

  it('reports a component the engine cannot find', async () => {
    vi.spyOn(InteractiveFormsEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(InteractiveFormsEngine.Instance, 'GetComponentByID').mockResolvedValue(null);
    const f = render(contribution());
    await (f.componentInstance as unknown as PanelInternals).loadSpec();
    expect(f.componentInstance.loadError).toBe('Component comp-1 not found.');
  });
});

/**
 * A panel writes to the parent record only where the user handed it a field, and only while the
 * user is editing. Without the check, a panel in view mode could change any field of the record.
 */
describe('InteractiveFormPanelComponent (DOM) — writing a parent field', () => {
  const claimsEmail = () => contribution({
    Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'after-fields', contributionKey: 'skip:email', replacesFieldNames: ['Email'] },
  } as Partial<FormContributionRegistration>);

  function renderEditable(editMode: boolean, providers: Provider[] = []) {
    const record = editableRecord({ Email: 'old@x.io', Notes: 'keep' });
    vi.spyOn(InteractiveFormPanelComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockResolvedValue(undefined);
    const f = renderComponentFixture(InteractiveFormPanelComponent, {
      imports: [ReactStub, AlertStub, PanelStub],
      declarations: [InteractiveFormPanelComponent],
      providers: [{ provide: ReactBridgeService, useValue: {} }, ...providers],
      inputs: { Contribution: claimsEmail(), Record: record as unknown as BaseEntity, FormComponent: { ...FORM, EditMode: editMode } as unknown as BaseFormComponent },
    });
    return { f, record };
  }

  it('writes a claimed field in edit mode', () => {
    const { f, record } = renderEditable(true);
    (f.componentInstance as unknown as PanelInternals).applyFieldChange('email', 'new@x.io');
    expect(record.Fields.find((x) => x.Name === 'Email')?.Value).toBe('new@x.io');
  });

  it('ignores a field the panel does not claim', () => {
    const { f, record } = renderEditable(true);
    (f.componentInstance as unknown as PanelInternals).applyFieldChange('Notes', 'overwritten');
    expect(record.Fields.find((x) => x.Name === 'Notes')?.Value).toBe('keep');
  });

  it('ignores every write while the form is in view mode', () => {
    const { f, record } = renderEditable(false);
    (f.componentInstance as unknown as PanelInternals).applyFieldChange('Email', 'new@x.io');
    expect(record.Fields.find((x) => x.Name === 'Email')?.Value).toBe('old@x.io');
  });

  it('tells the form a claimed field was edited', () => {
    const { f } = renderEditable(true, [FormFieldEditCoordinator]);
    const edits: FormFieldEdit[] = [];
    TestBed.inject(FormFieldEditCoordinator).Edited$.subscribe((edit) => edits.push(edit));

    (f.componentInstance as unknown as PanelInternals).applyFieldChange('email', 'new@x.io');

    expect(edits).toEqual([{ FieldName: 'Email' }]);
  });

  it('logs a write the record refuses, without rejecting or reporting an edit', async () => {
    logError.mockClear();
    const { f, record } = renderEditable(true, [FormFieldEditCoordinator]);
    const edits: FormFieldEdit[] = [];
    TestBed.inject(FormFieldEditCoordinator).Edited$.subscribe((edit) => edits.push(edit));
    record.Set = () => { throw new Error('Field Email is disabled'); };

    const handled = f.componentInstance.OnReactComponentEvent({
      type: FormPanelEventNames.FieldChanged,
      payload: { fieldName: 'Email', newValue: 'new@x.io' },
    });

    await expect(handled).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Field Email is disabled'));
    expect(edits).toEqual([]);
  });

  it('hands the panel the new value when the user edits a field elsewhere on the form', () => {
    const { f, record } = renderEditable(true);
    f.componentInstance.RebuildHostProps();
    expect(f.componentInstance.HostProps?.record['Email']).toBe('old@x.io');
    record.Set('Email', 'typed@x.io');
    f.componentInstance.ngDoCheck();
    expect(f.componentInstance.HostProps?.record['Email']).toBe('typed@x.io');
  });

  it('keeps the same props while nothing changed', () => {
    const { f } = renderEditable(true);
    f.componentInstance.RebuildHostProps();
    f.componentInstance.ngDoCheck();
    const before = f.componentInstance.HostProps;
    f.componentInstance.ngDoCheck();
    expect(f.componentInstance.HostProps).toBe(before);
  });
});

/**
 * A panel's Validate may be async. The host has to await it, or it reads a Promise as "no
 * opinion" and lets an invalid record save.
 */
describe('InteractiveFormPanelComponent (DOM) — validating', () => {
  it('awaits an async validator and reports its failure', async () => {
    const f = render(contribution());
    f.componentInstance.ReactComponent = {
      hasMethod: () => true,
      invokeMethod: () => Promise.resolve({ isValid: false, errors: ['x'] }),
    } as unknown as MJReactComponent;

    const result = await f.componentInstance.Validate();

    expect(result.Success).toBe(false);
    expect(result.Errors[0]).toMatchObject({ Source: 'skip:person-ltv', Message: 'x' });
  });
});

/**
 * A React panel is runtime content, so a validator that throws does not block the save by itself.
 * The failure shows in the panel instead, as does an error the React host reports.
 */
describe('InteractiveFormPanelComponent (DOM) — a failure inside the panel', () => {
  const mounted = () => render(contribution(), { componentSpec: { name: 'X' }, HostProps: { record: {} } });
  const handle = (invoke: () => unknown) => ({ hasMethod: () => true, invokeMethod: invoke }) as unknown as MJReactComponent;
  const reported = (isValid: boolean, errors: string[]) =>
    ({ type: FormPanelEventNames.ValidationChanged, payload: { isValid, errors } });

  it('does not block when Validate rejects, and shows the failure naming the panel', async () => {
    const f = mounted();
    f.componentInstance.ReactComponent = handle(() => Promise.reject(new Error('boom')));

    const result = await f.componentInstance.Validate();
    f.detectChanges();

    expect(result.Success).toBe(true);
    expect(text(f, 'mj-alert')).toContain('Lifetime value');
    expect(query(f, '.react-stub')).not.toBeNull();
  });

  it('treats a Validate that throws synchronously the same way', async () => {
    const f = mounted();
    f.componentInstance.ReactComponent = handle(() => { throw new Error('boom'); });

    const result = await f.componentInstance.Validate();

    expect(result.Success).toBe(true);
    expect(f.componentInstance.RenderError).toContain('Lifetime value');
  });

  it('still blocks on a failure the panel reported before its Validate threw', async () => {
    const f = mounted();
    await f.componentInstance.OnReactComponentEvent(reported(false, ['Amount required']));
    f.componentInstance.ReactComponent = handle(() => Promise.reject(new Error('boom')));

    const result = await f.componentInstance.Validate();

    expect(result.Success).toBe(false);
    expect(result.Errors[0]).toMatchObject({ Source: 'skip:person-ltv', Message: 'Amount required' });
  });

  it('clears the failure when a later Validate answers', async () => {
    const f = mounted();
    f.componentInstance.ReactComponent = handle(() => Promise.reject(new Error('boom')));
    await f.componentInstance.Validate();
    f.detectChanges();
    expect(query(f, 'mj-alert'), 'precondition').not.toBeNull();

    f.componentInstance.ReactComponent = handle(() => ({ isValid: true, errors: [] }));
    await f.componentInstance.Validate();
    f.detectChanges();

    expect(f.componentInstance.RenderError).toBeNull();
    expect(query(f, 'mj-alert')).toBeNull();
  });

  it('shows an error the React host reports', () => {
    const f = mounted();
    const react = f.debugElement.query(By.directive(ReactStub)).componentInstance as ReactStub;

    react.componentEvent.emit({ type: 'error', payload: { error: 'Render blew up', source: 'react' } });
    f.detectChanges();

    expect(text(f, 'mj-alert')).toContain('Render blew up');
    expect(text(f, 'mj-alert')).toContain('Lifetime value');
  });

  it('answers LastKnownValidation from the last state the panel reported', async () => {
    const f = render(contribution());
    await f.componentInstance.OnReactComponentEvent(reported(false, ['Amount required']));

    const result = f.componentInstance.LastKnownValidation();

    expect(result.Success).toBe(false);
    expect(result.Errors[0]).toMatchObject({ Source: 'skip:person-ltv', Message: 'Amount required' });
  });
});
