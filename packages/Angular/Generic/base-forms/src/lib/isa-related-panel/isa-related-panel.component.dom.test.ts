import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import type { BaseEntity, CompositeKey } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { MjIsaRelatedPanelComponent } from './isa-related-panel.component';
import type { IsaRelatedItem } from './isa-hierarchy-utils';
import type { EntityHierarchyNavigationEvent } from '../types/navigation-events';

/**
 * DOM coverage for <mj-isa-related-panel> — the side panel that lists IS-A sibling/child records next
 * to a form (~4×). Its RelatedItems come from an async metadata-walking discovery (DiscoverRelatedItems
 * on Record change), so these bypass discovery by setting Record + RelatedItems directly via `setup`
 * (no bound inputs → ngOnChanges doesn't fire and reset them) and stubbing the inner card. Verifies the
 * "has items && not edit mode" gate, one card per item, the collapsed icon-strip vs expanded cards, the
 * shared-PK / current-record-name wiring, and the card → panel Navigate relay.
 */

@Component({ standalone: true, selector: 'mj-isa-related-card', template: '' })
class IsaCardStub {
  @Input() EntityName = '';
  @Input() PrimaryKey: CompositeKey | null = null;
  @Input() CurrentRecordName = '';
  @Input() Relationship = '';
  @Input() Depth = 0;
  @Input() Children: IsaRelatedItem[] = [];
  @Output() Navigate = new EventEmitter<EntityHierarchyNavigationEvent>();
}

const PK = { ToConcatenatedString: () => 'PK1' } as unknown as CompositeKey;
const RECORD = { GetRecordName: () => 'Acme', PrimaryKey: PK, EntityInfo: {} } as unknown as BaseEntity;
const item = (name: string, rel: 'sibling' | 'child' = 'child'): IsaRelatedItem => ({ EntityName: name, Relationship: rel, Depth: 0, Children: [] });

function render(state: Partial<{ items: IsaRelatedItem[]; EditMode: boolean; Collapsed: boolean }> = {}) {
  return renderComponentFixture(MjIsaRelatedPanelComponent, {
    imports: [IsaCardStub],
    declarations: [MjIsaRelatedPanelComponent],
    // set state directly (not via bound inputs) so ngOnChanges' Record-change discovery doesn't reset RelatedItems
    setup: (c) => {
      c.Record = RECORD;
      c.RelatedItems = state.items ?? [];
      c.EditMode = state.EditMode ?? false;
      c.Collapsed = state.Collapsed ?? false;
    },
  });
}
type Fx = ReturnType<typeof render>;
const cards = (f: Fx) => f.debugElement.queryAll(By.directive(IsaCardStub)).map((d) => d.componentInstance as IsaCardStub);

describe('MjIsaRelatedPanelComponent (DOM)', () => {
  it('renders nothing when there are no related items', () => {
    expect(query(render({ items: [] }), '.mj-isa-panel')).toBeNull();
  });

  it('renders the panel with one card per related item (expanded, view mode)', () => {
    const f = render({ items: [item('Members'), item('Speakers', 'sibling')] });
    expect(query(f, '.mj-isa-panel')).not.toBeNull();
    expect(cards(f).length).toBe(2);
    expect(cards(f)[0].EntityName).toBe('Members');
  });

  it('hides the panel entirely in edit mode even with related items', () => {
    expect(query(render({ items: [item('Members')], EditMode: true }), '.mj-isa-panel')).toBeNull();
  });

  it('renders the collapsed icon strip (no cards) when collapsed', () => {
    const f = render({ items: [item('Members'), item('Speakers')], Collapsed: true });
    expect(query(f, '.mj-isa-panel--collapsed')).not.toBeNull();
    expect(queryAll(f, '.mj-isa-panel__collapsed-icon').length).toBe(2);
    expect(cards(f).length).toBe(0);
  });

  it('passes the shared primary key and current record name to each card', () => {
    const c = cards(render({ items: [item('Members')] }))[0];
    expect(c.PrimaryKey).toBe(PK);
    expect(c.CurrentRecordName).toBe('Acme');
  });

  it('relays a card Navigate event through the panel Navigate output', () => {
    const f = render({ items: [item('Members')] });
    const out = capture(f.componentInstance.Navigate);
    const evt = { EntityName: 'Members' } as unknown as EntityHierarchyNavigationEvent;
    cards(f)[0].Navigate.emit(evt);
    expect(out).toEqual([evt]);
  });
});
