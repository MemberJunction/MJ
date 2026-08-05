import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { TaskComponent } from './task.component';

/**
 * DOM-level spec for <mj-task> — the compound component that hosts the header/view-toggle
 * and switches between the Simple and Gantt viewers.
 *
 * We test ONLY in the default 'simple' viewMode. Switching to 'gantt' renders
 * <mj-gantt-task-viewer>, which boots the dhtmlx-gantt canvas library in ngAfterViewInit
 * (not jsdom-friendly) — that path is deferred. So we assert the toggle's wiring via the
 * "List" button (which keeps viewMode === 'simple') and the @Output, never by rendering gantt.
 */
describe('TaskComponent (DOM)', () => {
  it('renders the header with title and description when showHeader is true', () => {
    const f = renderComponentFixture(TaskComponent, {
      inputs: { tasks: [], title: 'My Work', description: 'Things to do' },
    });
    expect(query(f, '.task-header')).not.toBeNull();
    expect(text(f, '.task-title')).toBe('My Work');
    expect(text(f, '.task-description')).toBe('Things to do');
  });

  it('hides the header entirely when showHeader is false', () => {
    const f = renderComponentFixture(TaskComponent, {
      inputs: { tasks: [], showHeader: false, title: 'Hidden' },
    });
    expect(query(f, '.task-header')).toBeNull();
    expect(query(f, '.task-title')).toBeNull();
  });

  it('omits the title element when no title is provided', () => {
    const f = renderComponentFixture(TaskComponent, { inputs: { tasks: [] } });
    expect(query(f, '.task-header')).not.toBeNull();
    expect(query(f, '.task-title')).toBeNull();
  });

  it('renders the view toggle by default and marks the List button active in simple mode', () => {
    const f = renderComponentFixture(TaskComponent, { inputs: { tasks: [] } });
    const buttons = queryAll(f, '.toggle-btn');
    expect(buttons.length).toBe(2);
    const [ganttBtn, listBtn] = buttons;
    // default viewMode === 'simple' → List active, Gantt not
    expect(listBtn.classList.contains('active')).toBe(true);
    expect(ganttBtn.classList.contains('active')).toBe(false);
  });

  it('hides the view toggle when showViewToggle is false', () => {
    const f = renderComponentFixture(TaskComponent, { inputs: { tasks: [], showViewToggle: false } });
    expect(query(f, '.view-toggle')).toBeNull();
  });

  it('renders the simple viewer in the default simple mode', () => {
    const f = renderComponentFixture(TaskComponent, { inputs: { tasks: [] } });
    expect(query(f, 'mj-simple-task-viewer')).not.toBeNull();
    expect(query(f, 'mj-gantt-task-viewer')).toBeNull();
  });

  it('emits viewModeChanged when the (already-active) List toggle is clicked, staying in simple mode', () => {
    const f = renderComponentFixture(TaskComponent, { inputs: { tasks: [] } });
    const changed = capture(f.componentInstance.viewModeChanged);

    // second toggle button is "List" → setViewMode('simple'); keeps us out of the gantt render path
    const listBtn = queryAll(f, '.toggle-btn')[1] as HTMLButtonElement;
    listBtn.click();
    f.detectChanges();

    expect(changed).toHaveLength(1);
    expect(changed[0]).toBe('simple');
    expect(query(f, 'mj-gantt-task-viewer')).toBeNull();
  });
});
