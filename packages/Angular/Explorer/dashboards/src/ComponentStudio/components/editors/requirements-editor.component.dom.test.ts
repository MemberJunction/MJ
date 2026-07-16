import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { RequirementsEditorComponent } from './requirements-editor.component';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';

/**
 * DOM coverage for <mj-requirements-editor> — Preview/Edit toggle over a markdown field of the
 * spec (functionalRequirements or technicalDesign, chosen by @Input Field/Title). Empty state
 * shows when no component is selected; markdown preview vs code editor toggle otherwise.
 * <mj-markdown> and <mj-code-editor> are stubbed; state supplies SelectedComponent/EditableSpec.
 */

@Component({ standalone: true, selector: 'mj-markdown', template: '<div class="stub-md">{{ data }}</div>' })
class MarkdownStub {
  @Input() data = '';
  @Input() enableCodeCopy = false;
}

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
  EditableSpec = JSON.stringify({ functionalRequirements: '# Reqs', technicalDesign: '' });
  StateChanged = new EventEmitter<void>();
  UpdateSpec() {}
  InitializeEditors() {}
}

const render = (inputs: Record<string, unknown>, configure?: (s: FakeState) => void) => {
  const state = new FakeState();
  configure?.(state);
  const fixture = renderComponentFixture(RequirementsEditorComponent, {
    imports: [CommonModule, FormsModule, MJButtonDirective, MJEmptyStateComponent, MarkdownStub, CodeEditorStub],
    declarations: [RequirementsEditorComponent],
    providers: [{ provide: ComponentStudioStateService, useValue: state }],
    inputs,
  });
  return { fixture, state };
};

describe('RequirementsEditorComponent (DOM)', () => {
  it('renders the Title from the input in the header', () => {
    const { fixture } = render({ Field: 'functionalRequirements', Title: 'Functional Requirements' });
    expect(text(fixture, '.header-title')).toContain('Functional Requirements');
  });

  it('shows a "select a component" empty state when nothing is selected', () => {
    const { fixture } = render({ Field: 'functionalRequirements', Title: 'Functional Requirements' });
    expect(query(fixture, '.editor-body mj-empty-state')).not.toBeNull();
    expect(query(fixture, '.preview-container')).toBeNull();
  });

  it('renders the markdown preview of the selected field when a component is selected', () => {
    const { fixture } = render(
      { Field: 'functionalRequirements', Title: 'Functional Requirements' },
      (s) => { s.SelectedComponent = { id: '1' }; },
    );
    expect(query(fixture, '.stub-md')?.textContent).toContain('# Reqs');
  });

  it('switches to the code editor when Edit mode is selected', () => {
    const { fixture } = render(
      { Field: 'functionalRequirements', Title: 'Functional Requirements' },
      (s) => { s.SelectedComponent = { id: '1' }; },
    );
    queryAll(fixture, '.mode-btn').find((b) => b.textContent?.includes('Edit'))!.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(query(fixture, '.code-editor-container mj-code-editor')).not.toBeNull();
  });

  it('shows the empty-field preview state when the chosen field has no content', () => {
    const { fixture } = render(
      { Field: 'technicalDesign', Title: 'Technical Design' },
      (s) => { s.SelectedComponent = { id: '1' }; },
    );
    // technicalDesign is empty in the spec → empty preview inside the preview container
    expect(query(fixture, '.preview-container mj-empty-state')).not.toBeNull();
    expect(query(fixture, '.stub-md')).toBeNull();
  });
});
