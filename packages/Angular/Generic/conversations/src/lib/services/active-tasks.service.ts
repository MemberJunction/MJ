import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Represents an active agent task that is currently running
 */
export interface ActiveTask {
  id: string;
  agentName: string;
  status: string;
  relatedMessageId: string;
  conversationDetailId?: string;  // The ConversationDetail that tracks this task
  conversationId?: string; // The conversation this task belongs to
  conversationName?: string | null; // Display name of the conversation
  startTime: number;
}

/**
 * Service for tracking active agent tasks across the application.
 * Maintains a live list of running agents and their status.
 */
@Injectable({
  providedIn: 'root'
})
export class ActiveTasksService {
  private _tasks$ = new BehaviorSubject<Map<string, ActiveTask>>(new Map());
  private _conversationIdsWithTasks$ = new BehaviorSubject<Set<string>>(new Set());

  /**
   * Observable of all active tasks as an array
   */
  public readonly tasks$: Observable<ActiveTask[]> = this._tasks$.pipe(
    map(taskMap => Array.from(taskMap.values()))
  );

  /**
   * Observable of the count of active tasks
   */
  public readonly taskCount$: Observable<number> = this.tasks$.pipe(
    map(tasks => tasks.length)
  );

  /**
   * Observable of conversation IDs that have 1+ active tasks
   * Use this for quick lookups in conversation lists
   */
  public readonly conversationIdsWithTasks$: Observable<Set<string>> = this._conversationIdsWithTasks$.asObservable();

  /**
   * Observable of tasks grouped by conversation ID
   * Returns Map<conversationId, ActiveTask[]>
   */
  public readonly tasksByConversationId$: Observable<Map<string, ActiveTask[]>> = this.tasks$.pipe(
    map(tasks => {
      const grouped = new Map<string, ActiveTask[]>();
      for (const task of tasks) {
        if (task.conversationId) {
          const existing = grouped.get(task.conversationId) || [];
          existing.push(task);
          grouped.set(task.conversationId, existing);
        }
      }
      return grouped;
    })
  );

  /**
   * Add a new active task
   * @param task Task details (without id and startTime)
   * @returns The generated task ID
   */
  add(task: Omit<ActiveTask, 'id' | 'startTime'>): string {
    const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const fullTask = {
      ...task,
      id,
      startTime: Date.now()
    };
    const current = this._tasks$.value;
    current.set(id, fullTask);
    this._tasks$.next(new Map(current));

    // Update conversation IDs set
    if (fullTask.conversationId) {
      this.updateConversationIdsSet();
    }

    return id;
  }

  /**
   * Remove an active task
   * @param id The task ID to remove
   */
  remove(id: string): void {
    const current = this._tasks$.value;
    const task = current.get(id);
    current.delete(id);
    this._tasks$.next(new Map(current));

    // Update conversation IDs set if this was the last task for a conversation
    if (task?.conversationId) {
      this.updateConversationIdsSet();
    }
  }

  /**
   * Update the set of conversation IDs with active tasks
   * @private
   */
  private updateConversationIdsSet(): void {
    const conversationIds = new Set<string>();
    for (const task of this._tasks$.value.values()) {
      if (task.conversationId) {
        conversationIds.add(task.conversationId);
      }
    }
    this._conversationIdsWithTasks$.next(conversationIds);
  }

  /**
   * Update the status of an active task
   * @param id The task ID
   * @param status The new status text
   */
  updateStatus(id: string, status: string): void {
    const current = this._tasks$.value;
    const task = current.get(id);
    if (task) {
      task.status = status;
      this._tasks$.next(new Map(current));
    }
  }

  /**
   * Get an active task by its conversation detail ID
   * @param conversationDetailId The conversation detail ID
   * @returns The task if found, undefined otherwise
   */
  getByConversationDetailId(conversationDetailId: string): ActiveTask | undefined {
    const tasks = Array.from(this._tasks$.value.values());
    return tasks.find(task => task.conversationDetailId === conversationDetailId);
  }

  /**
   * Update the status of a task by its conversation detail ID
   * @param conversationDetailId The conversation detail ID
   * @param status The new status text
   * @returns true if task was found and updated, false otherwise
   */
  updateStatusByConversationDetailId(conversationDetailId: string, status: string): boolean {
    const task = this.getByConversationDetailId(conversationDetailId);
    if (task) {
      this.updateStatus(task.id, status);
      return true;
    }
    return false;
  }

  /**
   * Clear all active tasks
   */
  clear(): void {
    this._tasks$.next(new Map());
  }
}
