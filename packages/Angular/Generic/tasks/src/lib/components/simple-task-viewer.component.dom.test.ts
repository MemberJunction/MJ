import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { SimpleTaskViewerComponent } from './simple-task-viewer.component';

/**
 * DOM-level spec for <mj-simple-task-viewer>. tasks/@Input is MJTaskEntity[]; the template
 * only reads plain fields, so plain objects via `inputs` suffice.
 *
 * Clicking a task sets selectedTask and renders the child <mj-task-detail-panel>. That child's
 * ngOnInit only touches AIEngineBase when task.AgentID is set, so all task fixtures here OMIT
 * AgentID — no engine/backend call. selectedTask is set via a real (click) DOM event, which
 * marks the view dirty the zoneless-correct way (guide §5), so the follow-up render is clean.
 */
describe('SimpleTaskViewerComponent (DOM)', () => {
  const tasks = [
    { ID: 'a1b2c3d4-0000-0000-0000-000000000001', Name: 'First task', Status: 'In Progress', PercentComplete: 30 },
    { ID: 'a1b2c3d4-0000-0000-0000-000000000002', Name: 'Second task', Status: 'Complete', PercentComplete: 100 },
  ];

  it('renders one row per task with its title', () => {
    const f = renderComponentFixture(SimpleTaskViewerComponent, { inputs: { tasks } });
    const items = queryAll(f, '.task-item');
    expect(items.length).toBe(2);
    const titles = queryAll(f, '.task-title').map((el) => el.textContent?.trim());
    expect(titles[0]).toContain('First task');
    expect(titles[1]).toContain('Second task');
  });

  it('marks the completed task with the completed class and check icon', () => {
    const f = renderComponentFixture(SimpleTaskViewerComponent, { inputs: { tasks } });
    const items = queryAll(f, '.task-item');
    expect(items[0].classList.contains('completed')).toBe(false);
    expect(items[1].classList.contains('completed')).toBe(true);
    // completed-check icon only renders for the Complete task
    expect(items[0].querySelector('.completed-check')).toBeNull();
    expect(items[1].querySelector('.completed-check')).not.toBeNull();
  });

  it('renders the compact progress fill width from PercentComplete', () => {
    const f = renderComponentFixture(SimpleTaskViewerComponent, { inputs: { tasks } });
    const fills = queryAll(f, '.progress-fill-compact') as HTMLElement[];
    expect(fills[0].style.width).toBe('30%');
    expect(fills[1].style.width).toBe('100%');
    // the completed task's fill carries the .complete modifier
    expect(fills[1].classList.contains('complete')).toBe(true);
  });

  it('shows the empty state when there are no tasks', () => {
    const f = renderComponentFixture(SimpleTaskViewerComponent, { inputs: { tasks: [] } });
    expect(query(f, '.no-tasks')).not.toBeNull();
    expect(text(f, '.no-tasks p')).toBe('No tasks to display');
    expect(queryAll(f, '.task-item').length).toBe(0);
  });

  it('emits taskClicked and selects the row when a task is clicked', () => {
    const f = renderComponentFixture(SimpleTaskViewerComponent, { inputs: { tasks } });
    const clicked = capture(f.componentInstance.taskClicked);

    click(f, '.task-item'); // first row
    f.detectChanges(); // re-render after click set selectedTask (view already marked dirty by the event)

    expect(clicked).toHaveLength(1);
    expect(clicked[0].Name).toBe('First task');
    // selecting a task adds .selected to the first row and reveals the detail panel
    expect(queryAll(f, '.task-item')[0].classList.contains('selected')).toBe(true);
    expect(query(f, 'mj-task-detail-panel')).not.toBeNull();
  });

  it('does not render the detail panel before any task is selected', () => {
    const f = renderComponentFixture(SimpleTaskViewerComponent, { inputs: { tasks } });
    expect(query(f, 'mj-task-detail-panel')).toBeNull();
    expect(hasClass(f, '.task-list', 'with-detail')).toBe(false);
  });
});
