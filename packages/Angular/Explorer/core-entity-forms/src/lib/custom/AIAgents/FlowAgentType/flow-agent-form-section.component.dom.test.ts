import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseEntity } from '@memberjunction/core';
import { renderComponentFixture, query, attr } from '@memberjunction/ng-test-utils';
import { FlowAgentFormSectionComponent } from './flow-agent-form-section.component';

/**
 * DOM coverage for <mj-flow-agent-form-section> — a thin BaseFormSectionComponent (standalone:false)
 * that wraps the flow editor. It's cheaply unit-DOM-testable: `record`/`EditMode` are plain properties
 * (not @Input, so set them in `setup`, not via setInput), and the template just branches on the
 * `AgentID` getter (record.ID):
 *   - AgentID present  → renders <mj-flow-agent-editor> with AgentID/EditMode/FullScreen bound;
 *   - AgentID absent    → renders the "save first" <mj-empty-state>.
 * The two children are replaced with light standalone stubs exposing the bound inputs/outputs, so we
 * assert THIS component's branching + binding, and its OnFullScreenToggled handler flipping IsFullScreen.
 * No async init, no entity metadata, no form host — a single synchronous render per test.
 */

@Component({
  selector: 'mj-flow-agent-editor',
  standalone: true,
  template: '<span class="stub-editor">editor</span>',
})
class StubFlowEditor {
  @Input() AgentID: string | null = null;
  @Input() EditMode = false;
  @Input() FullScreen = false;
  @Output() FlowSaved = new EventEmitter<void>();
  @Output() FullScreenToggled = new EventEmitter<boolean>();
}
@Component({ selector: 'mj-empty-state', standalone: true, template: '<span class="stub-empty-title">{{ Title }}</span>' })
class StubEmptyState {
  @Input() Variant = '';
  @Input() Icon = '';
  @Input() Title = '';
}

/** Minimal record fake — the getter only reads `'ID' in record` + record.ID. */
const recordWithId = (id: string) => ({ ID: id }) as unknown as BaseEntity;

const render = (setup: (i: FlowAgentFormSectionComponent) => void) =>
  renderComponentFixture(FlowAgentFormSectionComponent, {
    imports: [CommonModule, StubFlowEditor, StubEmptyState],
    declarations: [FlowAgentFormSectionComponent],
    setup,
  });

describe('FlowAgentFormSectionComponent (DOM)', () => {
  it('renders the flow editor once a record with an ID is present', () => {
    const fixture = render((i) => {
      i.record = recordWithId('agent-123');
      i.EditMode = true;
    });
    expect(query(fixture, 'mj-flow-agent-editor')).not.toBeNull();
    expect(query(fixture, 'mj-empty-state')).toBeNull();
  });

  it('binds AgentID and EditMode through to the flow editor', () => {
    const fixture = render((i) => {
      i.record = recordWithId('agent-123');
      i.EditMode = true;
    });
    const editor = query(fixture, 'mj-flow-agent-editor')!;
    const editorInstance = fixture.debugElement.query((el) => el.name === 'mj-flow-agent-editor')?.componentInstance as StubFlowEditor;
    expect(editorInstance.AgentID).toBe('agent-123');
    expect(editorInstance.EditMode).toBe(true);
    expect(editor).not.toBeNull();
  });

  it('renders the "save first" empty-state when there is no record', () => {
    const fixture = render(() => {
      /* no record → AgentID getter returns null */
    });
    expect(query(fixture, 'mj-flow-agent-editor')).toBeNull();
    const empty = query(fixture, 'mj-empty-state');
    expect(empty).not.toBeNull();
    expect(query(fixture, '.stub-empty-title')?.textContent).toContain('Save the agent first');
  });

  it('exposes the empty-state class on the host element for the no-record branch', () => {
    const fixture = render(() => {});
    expect(attr(fixture, 'mj-empty-state', 'class')).toContain('flow-empty-state');
  });

  it('OnFullScreenToggled flips IsFullScreen and re-binds FullScreen to the editor', () => {
    const fixture = render((i) => {
      i.record = recordWithId('agent-123');
    });
    expect(fixture.componentInstance.IsFullScreen).toBe(false);
    fixture.componentInstance.OnFullScreenToggled(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.IsFullScreen).toBe(true);
    const editorInstance = fixture.debugElement.query((el) => el.name === 'mj-flow-agent-editor')?.componentInstance as StubFlowEditor;
    expect(editorInstance.FullScreen).toBe(true);
  });
});
