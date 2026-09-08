import { describe, it, expect, afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { MJAccordionPanelComponent, MJAccordionTitleDirective, MJAccordionBodyDirective } from '@memberjunction/ng-ui-components';
import { ActiveTasksPanelComponent } from './active-tasks-panel.component';
import { ActiveTasksService, ActiveTask } from '../../services/active-tasks.service';

/**
 * DOM spec for <mj-active-tasks-panel> — the floating bottom-right panel of running
 * agent tasks. The component reads tasks$/taskCount$ from ActiveTasksService in its
 * constructor, so a stub service (fixed observables) drives every branch. The real
 * mj-accordion-panel + title/body directives are imported (standalone, no data deps)
 * so the disclosure header and lazily-instantiated body render for real.
 *
 * getElapsedTime() reads Date.now() from the template, so fake timers pin the clock —
 * both for deterministic output and to keep the dev-mode second CD pass NG0100-safe.
 */
describe('ActiveTasksPanelComponent (DOM)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const makeTask = (overrides: Partial<ActiveTask> = {}): ActiveTask => ({
    id: 't1',
    agentName: 'Sage',
    status: 'Working on it',
    relatedMessageId: 'm1',
    startTime: 9_000,
    ...overrides,
  });

  const render = (tasks: ActiveTask[]) => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    return renderComponentFixture(ActiveTasksPanelComponent, {
      imports: [MJAccordionPanelComponent, MJAccordionTitleDirective, MJAccordionBodyDirective],
      declarations: [ActiveTasksPanelComponent],
      providers: [{ provide: ActiveTasksService, useValue: { tasks$: of(tasks), taskCount$: of(tasks.length) } }],
    });
  };

  it('renders nothing when there are no active tasks', () => {
    const f = render([]);
    expect(query(f, '.active-tasks-panel')).toBeNull();
  });

  it('renders the panel with the task count in the accordion title', () => {
    const f = render([makeTask(), makeTask({ id: 't2', agentName: 'Scout' })]);
    expect(query(f, '.active-tasks-panel')).not.toBeNull();
    expect(text(f, '.mj-accordion-title')).toContain('Active Tasks (2)');
  });

  it('renders one row per task with agent name, elapsed time, and status (expanded by default)', () => {
    const f = render([makeTask({ agentName: 'Sage', status: 'Thinking hard' })]);
    const items = queryAll(f, '.task-item');
    expect(items.length).toBe(1);
    expect(text(f, '.task-agent')).toBe('Sage');
    expect(text(f, '.task-elapsed')).toBe('1s'); // startTime 9000, now 10000
    expect(text(f, '.task-status')).toBe('Thinking hard');
  });

  it('formats elapsed times over a minute as m:ss', () => {
    const f = render([makeTask({ startTime: 10_000 - 75_000 })]); // 75s ago
    expect(text(f, '.task-elapsed')).toBe('1:15');
  });

  it('truncates statuses longer than 50 characters with an ellipsis', () => {
    const longStatus = 'x'.repeat(60);
    const f = render([makeTask({ status: longStatus })]);
    const shown = text(f, '.task-status');
    expect(shown).toBe('x'.repeat(50) + '...');
  });

  it('collapses the task list when the accordion header is toggled', () => {
    const f = render([makeTask()]);
    expect(query(f, '.panel-content')).not.toBeNull();
    (query(f, '.mj-accordion-header') as HTMLButtonElement).click();
    f.detectChanges();
    expect(f.componentInstance.isExpanded).toBe(false);
    // body stays instantiated (lazy-once accordion) but the panel reports collapsed
    expect(query(f, '.mj-accordion-panel')?.classList.contains('mj-accordion-panel--expanded')).toBe(false);
  });
});
