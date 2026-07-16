import { describe, it, expect } from 'vitest';
import { Component, Input, forwardRef } from '@angular/core';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { CodeEditorPanelComponent } from './code-editor-panel.component';
import { ComponentStudioStateService, CodeSection } from '../../services/component-studio-state.service';

/**
 * DOM coverage for <mj-code-editor-panel> — a per-code-section tab bar + Current/Original/Diff
 * view toggle over a CodeMirror editor, with a modified-dot on dirty sections and an
 * empty-state when there are no sections. <mj-code-editor> is a CVA stub; state supplies
 * CodeSections / IsEditingCode.
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
  @Input() placeholder = '';
  @Input() extensions: unknown[] = [];
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
  setDisabledState(): void {}
}

const section = (title: string, code: string, original = code): CodeSection =>
  ({ title, code, originalCode: original, isDependency: false } as unknown as CodeSection);

class FakeState {
  CodeSections: CodeSection[] = [];
  IsEditingCode = false;
  ApplyCodeChanges() {}
  InitializeEditors() {}
}

const render = (configure?: (s: FakeState) => void) => {
  const state = new FakeState();
  configure?.(state);
  const fixture = renderComponentFixture(CodeEditorPanelComponent, {
    imports: [FormsModule, MJButtonDirective, MJEmptyStateComponent, CodeEditorStub],
    declarations: [CodeEditorPanelComponent],
    providers: [{ provide: ComponentStudioStateService, useValue: state }],
  });
  return { fixture, state };
};

describe('CodeEditorPanelComponent (DOM)', () => {
  it('shows the empty state when there are no code sections', () => {
    const { fixture } = render();
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
    expect(queryAll(fixture, '.code-tab').length).toBe(0);
  });

  it('renders one tab per code section', () => {
    const { fixture } = render((s) => { s.CodeSections = [section('main.js', 'a'), section('dep.js', 'b')]; });
    const tabs = queryAll(fixture, '.code-tab');
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent).toContain('main.js');
  });

  it('shows a modified dot on a section whose code differs from the original', () => {
    const { fixture } = render((s) => { s.CodeSections = [section('main.js', 'changed', 'orig')]; });
    expect(query(fixture, '.modified-dot')).not.toBeNull();
  });

  it('renders the current-mode editor by default and switches to original mode on click', () => {
    const { fixture } = render((s) => { s.CodeSections = [section('main.js', 'a')]; });
    expect(query(fixture, '.editor-pane mj-code-editor')).not.toBeNull();
    queryAll(fixture, '.mode-btn').find((b) => b.textContent?.includes('Original'))!.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(fixture.componentInstance.ViewMode).toBe('original');
  });

  it('hides the Apply/Cancel buttons until code is being edited', () => {
    const { fixture: hidden } = render((s) => { s.CodeSections = [section('main.js', 'a')]; });
    expect(query(hidden, '.action-buttons')).toBeNull();
  });

  it('shows the Apply/Cancel buttons when IsEditingCode is true', () => {
    const { fixture } = render((s) => { s.CodeSections = [section('main.js', 'a')]; s.IsEditingCode = true; });
    expect(query(fixture, '.action-buttons')).not.toBeNull();
  });
});
