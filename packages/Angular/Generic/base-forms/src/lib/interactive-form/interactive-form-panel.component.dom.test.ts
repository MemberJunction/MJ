import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { BaseEntity } from '@memberjunction/core';
import { ReactBridgeService } from '@memberjunction/ng-react';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { InteractiveFormPanelComponent } from './interactive-form-panel.component';
import type { FormContributionRegistration } from '../panel-slot/form-contribution';
import type { BaseFormComponent } from '../base-form-component';

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

interface State { loadError?: string | null; componentSpec?: unknown; HostProps?: unknown }
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
      if (state.componentSpec !== undefined) inst.componentSpec = state.componentSpec as never;
      if (state.HostProps !== undefined) inst.HostProps = state.HostProps as never;
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
