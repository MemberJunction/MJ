import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import type { EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, capture } from '@memberjunction/ng-test-utils';
import { MJEntityERDComponent } from './mj-entity-erd.component';

/**
 * DOM coverage for <mj-entity-erd> — the adapter that turns EntityInfo[] into ERD nodes and forwards
 * them to the <mj-erd-diagram> renderer, re-emitting its events (~6×). The heavy diagram renderer is
 * stubbed. Verifies the entities→nodes computation is passed through, the empty case, pass-through of
 * display inputs, and the deselect / refresh output forwarding.
 */

@Component({ standalone: true, selector: 'mj-erd-diagram', template: '' })
class DiagramStub {
  @Input() nodes: unknown[] = [];
  @Input() selectedNodeId: string | null = null;
  @Input() highlightedNodeIds: string[] = [];
  @Input() focusNodeId: string | null = null;
  @Input() focusDepth = 1;
  @Input() config: unknown; @Input() showHeader = true; @Input() headerTitle = '';
  @Input() isRefreshing = false; @Input() readOnly = false;
  @Output() nodeClick = new EventEmitter<unknown>();
  @Output() nodeDoubleClick = new EventEmitter<unknown>();
  @Output() nodeSelected = new EventEmitter<unknown>();
  @Output() nodeDeselected = new EventEmitter<void>();
  @Output() zoomChange = new EventEmitter<unknown>();
  @Output() stateChange = new EventEmitter<unknown>();
  @Output() refreshRequested = new EventEmitter<void>();
}

const entity = (id: string, name: string): EntityInfo =>
  ({ ID: id, Name: name, DisplayName: name, BaseTable: name, Description: '', SchemaName: 'dbo', Status: 'Active', Fields: [], RelatedEntities: [] } as unknown as EntityInfo);

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJEntityERDComponent, {
    imports: [DiagramStub],
    declarations: [MJEntityERDComponent],
    inputs,
  });
type Fx = ReturnType<typeof render>;
const diagram = (f: Fx) => f.debugElement.query(By.directive(DiagramStub)).componentInstance as DiagramStub;

describe('MJEntityERDComponent (DOM)', () => {
  it('computes one ERD node per entity and passes them to the diagram', () => {
    const ents = [entity('e1', 'Accounts'), entity('e2', 'Contacts')];
    const g = diagram(render({ entities: ents, allEntities: ents }));
    expect(g.nodes.length).toBe(2);
  });

  it('passes an empty node set to the diagram when there are no entities', () => {
    expect(diagram(render({ entities: [], allEntities: [] })).nodes.length).toBe(0);
  });

  it('passes display inputs (selectedEntityId, showHeader, headerTitle) through to the diagram', () => {
    const ents = [entity('e1', 'Accounts')];
    const g = diagram(render({ entities: ents, allEntities: ents, selectedEntityId: 'e1', showHeader: false, headerTitle: 'My ERD' }));
    expect(g.selectedNodeId).toBe('e1');
    expect(g.showHeader).toBe(false);
    expect(g.headerTitle).toBe('My ERD');
  });

  it('forwards the diagram nodeDeselected as entityDeselected', () => {
    const ents = [entity('e1', 'Accounts')];
    const f = render({ entities: ents, allEntities: ents });
    const out = capture(f.componentInstance.entityDeselected);
    diagram(f).nodeDeselected.emit();
    expect(out.length).toBe(1);
  });

  it('forwards the diagram refreshRequested', () => {
    const ents = [entity('e1', 'Accounts')];
    const f = render({ entities: ents, allEntities: ents });
    const out = capture(f.componentInstance.refreshRequested);
    diagram(f).refreshRequested.emit();
    expect(out.length).toBe(1);
  });
});
