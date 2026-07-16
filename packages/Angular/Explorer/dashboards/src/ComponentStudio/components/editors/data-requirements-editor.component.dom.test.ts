import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, forwardRef } from '@angular/core';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { DataRequirementsEditorComponent } from './data-requirements-editor.component';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';

/**
 * DOM coverage for <mj-data-requirements-editor> — a JSON editor for a spec's dataRequirements
 * with a summary bar (entity/query counts + mode badge) computed from the parsed JSON. Empty
 * state when no component is selected. <mj-code-editor> is a CVA stub; state supplies
 * SelectedComponent / EditableSpec.
 */

@Component({
  standalone: true,
  selector: 'mj-code-editor',
  template: '',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CodeEditorStub), multi: true }],
})
class CodeEditorStub implements ControlValueAccessor {
  @Input() language = '';
  @Input() indentWithTab = false;
  @Input() placeholder = '';
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
  setDisabledState(): void {}
}

class FakeState {
  SelectedComponent: unknown = null;
  EditableSpec = JSON.stringify({
    dataRequirements: { mode: 'views', entities: [{ name: 'A' }, { name: 'B' }], queries: [{ name: 'Q' }] },
  });
  StateChanged = new EventEmitter<void>();
  UpdateSpec() {}
}

const render = (configure?: (s: FakeState) => void) => {
  const state = new FakeState();
  configure?.(state);
  const fixture = renderComponentFixture(DataRequirementsEditorComponent, {
    imports: [FormsModule, MJButtonDirective, MJEmptyStateComponent, CodeEditorStub],
    declarations: [DataRequirementsEditorComponent],
    providers: [{ provide: ComponentStudioStateService, useValue: state }],
  });
  return { fixture, state };
};

describe('DataRequirementsEditorComponent (DOM)', () => {
  it('renders the Data Requirements header title', () => {
    const { fixture } = render();
    expect(text(fixture, '.header-title')).toContain('Data Requirements');
  });

  it('shows an empty state when no component is selected', () => {
    const { fixture } = render();
    expect(query(fixture, '.editor-body mj-empty-state')).not.toBeNull();
    expect(query(fixture, '.json-editor-container')).toBeNull();
  });

  it('renders the JSON editor when a component is selected', () => {
    const { fixture } = render((s) => { s.SelectedComponent = { id: '1' }; });
    expect(query(fixture, '.json-editor-container mj-code-editor')).not.toBeNull();
  });

  it('shows a summary bar with the entity and query counts from the parsed JSON', () => {
    const { fixture } = render((s) => { s.SelectedComponent = { id: '1' }; });
    const summary = query(fixture, '.summary-bar');
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain('2 entities');
    expect(summary?.textContent).toContain('1 query');
  });

  it('renders the data mode badge from the parsed JSON', () => {
    const { fixture } = render((s) => { s.SelectedComponent = { id: '1' }; });
    expect(text(fixture, '.mode-badge')).toContain('views');
  });
});
