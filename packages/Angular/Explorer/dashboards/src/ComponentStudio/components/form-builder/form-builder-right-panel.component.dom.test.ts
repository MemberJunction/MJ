import { describe, it, expect } from 'vitest';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import type { FormCanvasModel } from '../../../component-studio.types';
import { FormBuilderRightPanelComponent } from './form-builder-right-panel.component';

/**
 * DOM coverage for <mj-form-builder-right-panel> — the form-builder inspector. With no selection and
 * no schema it shows an empty-state prompt; with an element selected (resolved from Canvas by
 * SelectedElementId) it enters inspector mode with a delete action that emits ElementDeleted. A
 * 'spacer' element is used so the inspector renders without needing the schema-backed field summary.
 * mj-empty-state imported. Single synchronous render.
 */

const canvasWith = (elementType: string) =>
  ({ title: 'F', entityName: 'E', sections: [{ id: 'sec1', title: 'S', elements: [{ id: 'el1', type: elementType }] }] }) as unknown as FormCanvasModel;

const render = (inputs: Record<string, unknown>) =>
  renderComponentFixture(FormBuilderRightPanelComponent, {
    imports: [MJEmptyStateComponent],
    declarations: [FormBuilderRightPanelComponent],
    inputs: { Canvas: null, Schema: null, SelectedElementId: null, SelectedSectionId: null, ...inputs },
  });

describe('FormBuilderRightPanelComponent (DOM)', () => {
  it('shows the empty-state prompt when nothing is selected and no schema is loaded', () => {
    const fixture = render({});
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
    expect(query(fixture, '.panel-header')).toBeNull();
  });

  it('enters inspector mode with an element-properties header when an element is selected', () => {
    const fixture = render({ Canvas: canvasWith('spacer'), SelectedElementId: 'el1' });
    expect(query(fixture, '.panel-header .header-title')?.textContent).toContain('Element Properties');
  });

  it('emits ElementDeleted with the element id when the delete button is clicked', () => {
    const fixture = render({ Canvas: canvasWith('spacer'), SelectedElementId: 'el1' });
    const deleted = capture(fixture.componentInstance.ElementDeleted);
    (query(fixture, '.panel-header .icon-btn') as HTMLElement).click();
    expect(deleted).toEqual(['el1']);
  });
});
