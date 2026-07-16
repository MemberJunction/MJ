import { describe, it, expect } from 'vitest';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import type { FormCanvasModel } from '../../services/form-canvas-model';
import { FormBuilderCanvasComponent } from './form-builder-canvas.component';

/**
 * DOM coverage for <mj-form-builder-canvas> — the form-builder canvas: empty state when no form is
 * loaded, otherwise a title field + entity badge + one draggable section per Canvas.sections, with
 * Deselected (background click) and SectionSelected (section header click) emissions. Uses CDK
 * drag-drop (DragDropModule) + mj-empty-state. Single synchronous render.
 */

const CANVAS = {
  title: 'Member Form',
  entityName: 'Members',
  sections: [
    { id: 's1', title: 'Basics', elements: [] },
    { id: 's2', title: 'Contact', elements: [] },
  ],
} as unknown as FormCanvasModel;

const render = (Canvas: FormCanvasModel | null) =>
  renderComponentFixture(FormBuilderCanvasComponent, {
    imports: [DragDropModule, MJEmptyStateComponent],
    declarations: [FormBuilderCanvasComponent],
    inputs: { Canvas },
  });

describe('FormBuilderCanvasComponent (DOM)', () => {
  it('shows the empty state when no form is loaded', () => {
    const fixture = render(null);
    expect(query(fixture, 'mj-empty-state.canvas-empty')).not.toBeNull();
    expect(query(fixture, '.canvas-sections-host')).toBeNull();
  });

  it('renders the title field and entity badge for a loaded form', () => {
    const fixture = render(CANVAS);
    expect((query(fixture, '.canvas-title') as HTMLInputElement).value).toBe('Member Form');
    expect(query(fixture, '.canvas-entity-badge')?.textContent).toContain('Members');
  });

  it('renders one section per Canvas.sections', () => {
    const sections = queryAll(render(CANVAS), '.canvas-section');
    expect(sections.length).toBe(2);
    expect(sections[0].textContent).toContain('Basics');
  });

  it('emits Deselected when the canvas background is clicked', () => {
    const fixture = render(CANVAS);
    const deselected = capture(fixture.componentInstance.Deselected);
    (query(fixture, '.canvas-root') as HTMLElement).click();
    expect(deselected.length).toBe(1);
  });

  it('emits SectionSelected with the section id when a section header is clicked', () => {
    const fixture = render(CANVAS);
    const selected = capture(fixture.componentInstance.SectionSelected);
    (query(fixture, '.section-header') as HTMLElement).click();
    expect(selected).toEqual(['s1']);
  });
});
