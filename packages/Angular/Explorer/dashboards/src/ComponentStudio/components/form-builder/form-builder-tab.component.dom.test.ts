import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { FormBuilderTabComponent } from './form-builder-tab.component';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/**
 * DOM coverage for <mj-form-builder-tab> — the visual form-builder tab (OnPush). With no
 * target entity it shows an empty state prompting entity selection; the toolbar exposes an
 * entity picker, View/Edit/Create mode pills bound to state.FormPreviewMode, and View
 * Code / Open in Chat handoffs. State + notifications are faked; the canvas child is stubbed.
 */

@Component({
  standalone: true,
  selector: 'mj-form-builder-canvas',
  template: '<div class="stub-canvas"></div>',
})
class FormBuilderCanvasStub {
  @Input() Canvas: unknown;
  @Input() Schema: unknown;
  @Input() SelectedElementId: string | null = null;
  @Input() SelectedSectionId: string | null = null;
  @Output() CanvasChanged = new EventEmitter();
  @Output() ElementSelected = new EventEmitter();
  @Output() SectionSelected = new EventEmitter();
  @Output() Deselected = new EventEmitter();
}

function makeState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    StateChanged: new EventEmitter<void>(),
    OpenInChatRequested: new EventEmitter<void>(),
    FormTargetEntityName: null,
    FormPreviewMode: 'view',
    FormCanvas: null,
    FormSchema: null,
    FormCodeOnlySectionsDetected: false,
    FormSelectedElementId: null,
    FormSelectedSectionId: null,
    HasUnsavedChanges: false,
    Provider: { Entities: [] },
    BuildFormSchema: () => null,
    ...overrides,
  } as unknown as ComponentStudioStateService;
}

const render = (state: ComponentStudioStateService) =>
  renderComponentFixture(FormBuilderTabComponent, {
    imports: [FormBuilderCanvasStub, MJEmptyStateComponent],
    declarations: [FormBuilderTabComponent],
    providers: [
      { provide: ComponentStudioStateService, useValue: state },
      { provide: MJNotificationService, useValue: { CreateSimpleNotification: () => {} } },
    ],
  });

describe('FormBuilderTabComponent (DOM)', () => {
  it('shows the "pick an entity" empty state when no target entity is set', () => {
    const fixture = render(makeState());
    expect(query(fixture, 'mj-empty-state.fbt-empty')).not.toBeNull();
    expect(query(fixture, 'mj-form-builder-canvas')).toBeNull();
  });

  it('renders the three preview-mode pills', () => {
    const fixture = render(makeState());
    const labels = queryAll(fixture, '.fbt-mode-pill').map((b) => b.textContent?.trim());
    expect(labels).toEqual(['View', 'Edit', 'Create']);
  });

  it('marks the pill matching state.FormPreviewMode as active', () => {
    const fixture = render(makeState({ FormPreviewMode: 'edit' }));
    const active = queryAll(fixture, '.fbt-mode-pill.active');
    expect(active.length).toBe(1);
    expect(active[0].textContent?.trim()).toBe('Edit');
  });

  it('renders the canvas (not the empty state) once a target entity is set', () => {
    const fixture = render(makeState({ FormTargetEntityName: 'Members', FormCanvas: { title: 'X', sections: [] } }));
    expect(query(fixture, 'mj-form-builder-canvas')).not.toBeNull();
    expect(query(fixture, 'mj-empty-state.fbt-empty')).toBeNull();
  });

  it('emits RequestCodeTab when View Code is clicked', () => {
    const fixture = render(makeState());
    const requested = capture(fixture.componentInstance.RequestCodeTab);
    queryAll(fixture, '.fbt-tool-btn').find((b) => b.textContent?.includes('View Code'))!.dispatchEvent(new Event('click'));
    expect(requested.length).toBe(1);
  });

  it('emits OpenInChatRequested (local + state) when Open in Chat is clicked', () => {
    const state = makeState({ FormTargetEntityName: 'Members', FormCanvas: { title: 'X', sections: [] } });
    const fixture = render(state);
    const local = capture(fixture.componentInstance.OpenInChatRequested);
    const onState = capture(state.OpenInChatRequested);
    queryAll(fixture, '.fbt-tool-btn').find((b) => b.textContent?.includes('Open in Chat'))!.dispatchEvent(new Event('click'));
    expect(local.length).toBe(1);
    expect(onState.length).toBe(1);
  });
});
