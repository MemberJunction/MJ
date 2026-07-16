import { describe, it, expect } from 'vitest';
import { Component, EventEmitter } from '@angular/core';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { EditorTabsComponent } from './editor-tabs.component';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';

/**
 * DOM coverage for <mj-editor-tabs> — the editor tab strip. It renders a fixed set of tab
 * pills (Spec/Code/Requirements/Design/Data) plus a conditional Form Builder pill for
 * form-role specs, tracks the active pill from `state.ActiveTab`, and @switches the tab
 * body between stubbed child editors. State comes from a fake ComponentStudioStateService.
 * Module-declared component → child editor selectors are replaced with empty stubs.
 */

@Component({ standalone: true, selector: 'mj-spec-editor', template: '<div class="stub-spec"></div>' })
class SpecEditorStub {}
@Component({ standalone: true, selector: 'mj-code-editor-panel', template: '<div class="stub-code"></div>' })
class CodeEditorPanelStub {}
@Component({ standalone: true, selector: 'mj-requirements-editor', template: '<div class="stub-req"></div>', inputs: ['Field', 'Title'] })
class RequirementsEditorStub {}
@Component({ standalone: true, selector: 'mj-data-requirements-editor', template: '<div class="stub-data"></div>' })
class DataRequirementsEditorStub {}
@Component({ standalone: true, selector: 'mj-form-builder-tab', template: '<div class="stub-fb"></div>' })
class FormBuilderTabStub {
  RequestCodeTab = new EventEmitter<void>();
}

class FakeState {
  ActiveTab = 0;
  StateChanged = new EventEmitter<void>();
  private _isForm = false;
  setForm(v: boolean) { this._isForm = v; }
  GetCurrentSpec() { return this._isForm ? { componentRole: 'form' } : { componentRole: 'report' }; }
}

const render = (configure?: (s: FakeState) => void) => {
  const state = new FakeState();
  configure?.(state);
  const fixture = renderComponentFixture(EditorTabsComponent, {
    imports: [SpecEditorStub, CodeEditorPanelStub, RequirementsEditorStub, DataRequirementsEditorStub, FormBuilderTabStub],
    declarations: [EditorTabsComponent],
    providers: [{ provide: ComponentStudioStateService, useValue: state }],
  });
  return { fixture, state };
};

const pillLabels = (f: ReturnType<typeof render>['fixture']) =>
  queryAll(f, '.tab-pill').map((b) => b.textContent?.trim());

describe('EditorTabsComponent (DOM)', () => {
  it('renders the five base tab pills and no Form Builder pill for a non-form spec', () => {
    const { fixture } = render();
    const labels = pillLabels(fixture);
    expect(labels).toEqual(['Spec', 'Code', 'Requirements', 'Design', 'Data']);
    expect(labels).not.toContain('Form Builder');
  });

  it('adds the Form Builder pill for a form-role spec', () => {
    const { fixture } = render((s) => s.setForm(true));
    expect(pillLabels(fixture)).toContain('Form Builder');
  });

  it('marks the pill matching state.ActiveTab as active and shows its body', () => {
    const { fixture } = render((s) => { s.ActiveTab = 1; });
    const active = queryAll(fixture, '.tab-pill.active');
    expect(active.length).toBe(1);
    expect(active[0].textContent?.trim()).toBe('Code');
    expect(query(fixture, '.stub-code')).not.toBeNull();
    expect(query(fixture, '.stub-spec')).toBeNull();
  });

  it('switches the active tab (and body) when another pill is clicked', () => {
    const { fixture, state } = render();
    queryAll(fixture, '.tab-pill').find((b) => b.textContent?.trim() === 'Data')!.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(state.ActiveTab).toBe(4);
    expect(query(fixture, '.stub-data')).not.toBeNull();
  });

  it('renders the spec editor body by default (ActiveTab 0)', () => {
    const { fixture } = render();
    expect(query(fixture, '.stub-spec')).not.toBeNull();
  });
});
