import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, forwardRef } from '@angular/core';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { SpecEditorComponent } from './spec-editor.component';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';

/**
 * DOM coverage for <mj-spec-editor> — edits a component spec in Form or JSON mode. Renders a
 * Form/JSON mode toggle, a form grid (Name/Type/Title/Description/Location/Example) bound to
 * the parsed EditableSpec, or a CodeMirror JSON editor. The heavy <mj-code-editor> is a
 * ControlValueAccessor stub. State (EditableSpec/IsEditingSpec/StateChanged) is faked.
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
  @Input() readonly = false;
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
  setDisabledState(): void {}
}

class FakeState {
  EditableSpec = JSON.stringify({ name: 'Widget', title: 'My Widget', type: 'Widget', location: 'embedded', description: 'desc' });
  IsEditingSpec = false;
  StateChanged = new EventEmitter<void>();
  ApplySpecChanges() {}
  InitializeEditors() {}
}

const render = (configure?: (s: FakeState) => void) => {
  const state = new FakeState();
  configure?.(state);
  const fixture = renderComponentFixture(SpecEditorComponent, {
    imports: [FormsModule, MJButtonDirective, CodeEditorStub],
    declarations: [SpecEditorComponent],
    providers: [{ provide: ComponentStudioStateService, useValue: state }],
  });
  return { fixture, state };
};

describe('SpecEditorComponent (DOM)', () => {
  it('starts in Form mode with the Form pill active and the form fields rendered from the spec', () => {
    const { fixture } = render();
    const modeButtons = queryAll(fixture, '.mode-btn');
    expect(modeButtons[0].classList.contains('active')).toBe(true);
    expect(query(fixture, '.form-mode')).not.toBeNull();
    // The Name field is populated from the parsed EditableSpec on init.
    expect(fixture.componentInstance.FormModel.name).toBe('Widget');
    expect(query(fixture, '.form-input')).not.toBeNull();
  });

  it('shows the code editor when switched to JSON mode', () => {
    const { fixture } = render();
    queryAll(fixture, '.mode-btn').find((b) => b.textContent?.includes('JSON'))!.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(query(fixture, '.json-mode mj-code-editor')).not.toBeNull();
    expect(query(fixture, '.form-mode')).toBeNull();
  });

  it('renders one option per component type in the Type select', () => {
    const { fixture } = render();
    const options = queryAll(fixture, '.form-select option');
    expect(options.map((o) => o.textContent?.trim())).toContain('Dashboard');
  });

  it('hides the Apply/Cancel actions until the spec is being edited', () => {
    const { fixture } = render();
    expect(query(fixture, '.action-buttons')).toBeNull();
  });

  it('shows the Apply/Cancel actions when IsEditingSpec is true', () => {
    const { fixture } = render((s) => { s.IsEditingSpec = true; });
    expect(query(fixture, '.action-buttons')).not.toBeNull();
    expect(text(fixture, '.action-buttons')).toContain('Apply');
  });
});
