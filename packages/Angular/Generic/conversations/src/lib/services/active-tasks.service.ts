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
   * Add a new active task
   * @param task Task details (without id and startTime)
   * @returns The generated task ID
   */
  add(task: Omit<ActiveTask, 'id' | 'startTime'>): string {
    const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const current = this._tasks$.value;
    current.set(id, {
      ...task,
      id,
      startTime: Date.now()
    });
    this._tasks$.next(new Map(current));
    return id;
  }

  /**
   * Remove an active task
   * @param id The task ID to remove
   */
  remove(id: string): void {
    const current = this._tasks$.value;
    current.delete(id);
    this._tasks$.next(new Map(current));
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
   * Clear all active tasks
   */
  clear(): void {
    this._tasks$.next(new Map());
  }
}
