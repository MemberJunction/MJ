import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Directive, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import type { EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { ERDCompositeComponent } from './erd-composite.component';

/**
 * DOM coverage for <mj-erd-composite> — the split-layout ERD workspace combining a filter panel, the
 * diagram, and an entity-details panel (~6×). loadData() pulls entities from a provider, so it's stubbed;
 * the angular-split layout and the three mj-* children are stubbed. Covers the always-present diagram,
 * the filter-panel visibility gate, the details panel appearing only for a selected entity, and the
 * entityOpened / openRecord output forwarding from the children.
 */

@Component({ standalone: true, selector: 'as-split', template: '<ng-content></ng-content>' })
class SplitStub { @Output() dragEnd = new EventEmitter<unknown>(); }
@Component({ standalone: true, selector: 'as-split-area', template: '<ng-content></ng-content>' })
class SplitAreaStub { @Input() size: unknown; @Input() minSize: unknown; @Input() maxSize: unknown; }

// A permissive stub carrying every data input the three children bind (extra inputs are harmless).
// @Directive() so Angular collects the @Input()s for inheritance by the concrete stub components.
@Directive()
class ChildInputs {
  @Input() allEntities: unknown; @Input() allEntityFields: unknown; @Input() config: unknown; @Input() depth = 1;
  @Input() entities: unknown; @Input() fieldsSectionExpanded = false; @Input() filteredEntities: unknown;
  @Input() filters: unknown; @Input() focusEntityId: unknown; @Input() includeIncoming = true;
  @Input() includeOutgoing = true; @Input() isRefreshing = false; @Input() relationshipsSectionExpanded = false;
  @Input() selectedEntityId: unknown; @Input() selectedEntity: unknown; @Input() showHeader = true;
}
@Component({ standalone: true, selector: 'mj-entity-filter-panel', template: '' })
class FilterPanelStub extends ChildInputs {
  @Output() filtersChange = new EventEmitter<unknown>(); @Output() filterChange = new EventEmitter<void>();
  @Output() resetFilters = new EventEmitter<void>(); @Output() closePanel = new EventEmitter<void>();
}
@Component({ standalone: true, selector: 'mj-entity-erd', template: '<div class="erd-stub"></div>' })
class ErdStub extends ChildInputs {
  @Output() entitySelected = new EventEmitter<unknown>(); @Output() entityDeselected = new EventEmitter<void>();
  @Output() openRecord = new EventEmitter<unknown>(); @Output() stateChange = new EventEmitter<unknown>();
}
@Component({ standalone: true, selector: 'mj-entity-details', template: '' })
class DetailsStub extends ChildInputs {
  @Output() openEntity = new EventEmitter<EntityInfo>(); @Output() closePanel = new EventEmitter<void>();
  @Output() fieldsSectionToggle = new EventEmitter<void>(); @Output() relationshipsSectionToggle = new EventEmitter<void>();
  @Output() entitySelected = new EventEmitter<unknown>(); @Output() openRecord = new EventEmitter<{ EntityName: string; RecordID: string }>();
}

const CHILDREN = [SplitStub, SplitAreaStub, FilterPanelStub, ErdStub, DetailsStub];
type LoadProto = { loadData: () => Promise<void> };
const tick = () => new Promise((r) => setTimeout(r, 0));
const ENTITY = { Name: 'Accounts' } as unknown as EntityInfo;

async function render(inputs: Record<string, unknown> = {}, setup?: (c: ERDCompositeComponent) => void) {
  vi.spyOn(ERDCompositeComponent.prototype as unknown as LoadProto, 'loadData').mockResolvedValue(undefined);
  const f = renderComponentFixture(ERDCompositeComponent, {
    imports: CHILDREN,
    declarations: [ERDCompositeComponent],
    inputs,
    setup,
  });
  await tick(); // async ngOnInit (loadData stubbed)
  f.detectChanges(false);
  return f;
}
type Fx = Awaited<ReturnType<typeof render>>;
const details = (f: Fx) => f.debugElement.query(By.directive(DetailsStub))?.componentInstance as DetailsStub | undefined;

afterEach(() => vi.restoreAllMocks());

describe('ERDCompositeComponent (DOM)', () => {
  it('always renders the ERD diagram pane', async () => {
    expect(query(await render(), '.erd-stub')).not.toBeNull();
  });

  it('shows the filter panel when showFilterPanel is true', async () => {
    const f = await render({ showFilterPanel: true });
    expect(f.debugElement.query(By.directive(FilterPanelStub))).not.toBeNull();
  });

  it('hides the filter panel when showFilterPanel is false', async () => {
    const f = await render({ showFilterPanel: false });
    expect(f.debugElement.query(By.directive(FilterPanelStub))).toBeNull();
  });

  it('hides the entity-details panel when no entity is selected', async () => {
    expect(details(await render())).toBeFalsy();
  });

  it('shows the entity-details panel when an entity is selected', async () => {
    const withSel = await render({}, (c) => { (c as unknown as { selectedEntity: EntityInfo }).selectedEntity = ENTITY; });
    expect(details(withSel)).toBeTruthy();
  });

  it('forwards the details openEntity as entityOpened', async () => {
    const f = await render({}, (c) => { (c as unknown as { selectedEntity: EntityInfo }).selectedEntity = ENTITY; });
    const out = capture(f.componentInstance.entityOpened);
    details(f)!.openEntity.emit(ENTITY);
    expect(out).toEqual([ENTITY]);
  });

  it('forwards a child openRecord as openRecord', async () => {
    const f = await render({}, (c) => { (c as unknown as { selectedEntity: EntityInfo }).selectedEntity = ENTITY; });
    const out = capture(f.componentInstance.openRecord);
    const evt = { EntityName: 'Accounts', RecordID: '1' };
    details(f)!.openRecord.emit(evt);
    expect(out).toEqual([evt]);
  });
});
