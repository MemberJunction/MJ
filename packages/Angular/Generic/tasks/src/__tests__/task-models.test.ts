import { describe, it, expect } from 'vitest';
import type { TaskViewMode, GanttTask } from '../lib/models/task-view.models';

describe('TaskViewMode', () => {
  it('should accept simple mode', () => {
    const mode: TaskViewMode = 'simple';
    expect(mode).toBe('simple');
  });

  it('should accept gantt mode', () => {
    const mode: TaskViewMode = 'gantt';
    expect(mode).toBe('gantt');
  });
});

describe('GanttTask', () => {
  it('should construct a basic gantt task', () => {
    const task: GanttTask = {
      id: 'task-1',
      name: 'Design Phase',
      start: '2026-01-01',
      end: '2026-01-15',
      progress: 75
    };
    expect(task.id).toBe('task-1');
    expect(task.progress).toBe(75);
    expect(task.dependencies).toBeUndefined();
  });

  it('should support dependencies and custom class', () => {
    const task: GanttTask = {
      id: 'task-2',
      name: 'Implementation',
      start: '2026-01-16',
      end: '2026-02-15',
      progress: 30,
      dependencies: 'task-1',
      custom_class: 'critical-task'
    };
    expect(task.dependencies).toBe('task-1');
    expect(task.custom_class).toBe('critical-task');
  });

  it('should handle zero progress', () => {
    const task: GanttTask = {
      id: 'task-3',
      name: 'Future Task',
      start: '2026-03-01',
      end: '2026-03-30',
      progress: 0
    };
    expect(task.progress).toBe(0);
  });
});
