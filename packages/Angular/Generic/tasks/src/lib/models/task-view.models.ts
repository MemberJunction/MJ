import { MJTaskEntity } from '@memberjunction/core-entities';

/**
 * View mode for task display
 */
export type TaskViewMode = 'simple' | 'gantt';

/**
 * Gantt bar data for Frappe Gantt
 */
export interface GanttTask {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  dependencies?: string;
  custom_class?: string;
}
