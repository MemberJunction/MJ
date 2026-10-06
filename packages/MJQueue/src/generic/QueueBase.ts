import { UserInfo, BaseEntity, LogError, IMetadataProvider, Metadata } from '@memberjunction/core';
import { MJQueueEntity, MJQueueTaskEntity } from '@memberjunction/core-entities';
import { UUIDsEqual, IShutdownable } from '@memberjunction/global';
//import { MJQueueTaskEntity, MJQueueEntity } from 'mj_generatedentities';

/**
 * Why a task failed, when the driver knows retrying cannot help or the record was simply not there:
 *  - 'Fatal': deterministic (unrecognised task data, unknown entity) — never retry.
 *  - 'RecordNotFound': the referenced record did not load; it was deleted, or is not committed yet.
 * Absent on success and on ordinary failures, which a durable caller may retry.
 */
export type TaskFailureKind = 'Fatal' | 'RecordNotFound';

export class TaskResult {
  success: boolean  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  userMessage: string  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  output: any  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  exception: any  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  failureKind?: TaskFailureKind
}
 

export interface TaskOptions {
  priority?: number;
}

export const TaskStatus = {
  Pending: 'Pending',
  InProgress: 'InProgress',
  Complete: 'Complete',
  Failed: 'Failed',
  Cancelled: 'Cancelled',
} as const;

export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus];


export class TaskBase {
  private _options: TaskOptions;
  private _data: any; 
  private _taskRecord: MJQueueTaskEntity
  private _status: TaskStatus = TaskStatus.Pending;

  public get Options(): TaskOptions 
  {
    return this._options;
  }
  public get Data(): any 
  {
    return this._data;
  } 
  public get ID(): string {
    return this._taskRecord.ID;
  }
  constructor (taskRecord: MJQueueTaskEntity, data: any, options: TaskOptions) {
    this._taskRecord = taskRecord;
    this._options = options;
    this._data = data;
  }

  public get TaskRecord(): MJQueueTaskEntity {
    return this._taskRecord;
  }   

  public get Status(): TaskStatus {
    return this._status;
  }
  public set Status(value: TaskStatus) {
    this._status = value;
  }

}


export abstract class QueueBase implements IShutdownable {
  private _queue: TaskBase[] = [];
  private _queueTypeId: string;
  protected _contextUser: UserInfo
  private _maxTasks: number = 3; // move to metadata or config param
  private _checkInterval: number = 250; // move to metadata or config param
  private _queueRecord: MJQueueEntity
  private _stopped: boolean = false;
  private _pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private _executionProvider: IMetadataProvider | null = null;

  constructor(QueueRecord: MJQueueEntity, QueueTypeID: string, ContextUser: UserInfo) {
    this._queueRecord = QueueRecord;
    this._queueTypeId = QueueTypeID;
    this._contextUser = ContextUser;
  }

  public get QueueID(): string {
    return this._queueRecord.ID;
  }

  public get QueueTypeID(): string {
    return this._queueTypeId;
  }

  /**
   * The provider drivers use for data access. `ExecuteTask` sets it to the caller's provider (a work-queue
   * delivery's provider); the in-process loop keeps the process-wide provider.
   */
  protected get Provider(): IMetadataProvider {
    return this._executionProvider ?? Metadata.Provider; // global-provider-ok: legacy in-process queue has no per-request provider
  }

  /**
   * Runs one task through this driver's ProcessTask and returns its result. Unlike AddTask it does not use the
   * in-memory queue, does not start the processing loop and does not persist a QueueTask row — the caller owns
   * durability (the work queue's LegacyQueueDriverHandler).
   */
  public async ExecuteTask(task: TaskBase, contextUser: UserInfo, provider?: IMetadataProvider): Promise<TaskResult> {
    if (provider) {
      this._executionProvider = provider;
    }
    return this.ProcessTask(task, contextUser);
  }

  /**
   * `IShutdownable` identity, surfaced in shutdown logs.
   */
  public get ShutdownName(): string {
    return `QueueBase[${this._queueRecord?.Name ?? this._queueTypeId}]`;
  }

  /**
   * Whether `Stop()` has been invoked. Once stopped, no further `ProcessTasks`
   * iterations are scheduled and `AddTask` is rejected.
   */
  public get IsStopped(): boolean {
    return this._stopped;
  }

  /**
   * Stops the recursive `ProcessTasks` loop, cancels any pending timer, and
   * marks the queue as stopped so subsequent `AddTask` calls fail-fast. Idempotent.
   * Implements `IShutdownable.Shutdown` so `ShutdownRegistry.ShutdownAll()` can
   * drain queues during graceful shutdown.
   */
  public Stop(): void {
    this._stopped = true;
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
  }

  /**
   * `IShutdownable` entry point. Aliased to `Stop()`.
   */
  public Shutdown(): void {
    this.Stop();
  }

  private _processing: boolean = false;
  protected ProcessTasks() {
    if (this._stopped) {
      return; // Don't reschedule once stopped.
    }
    if (!this._processing) {
      try {
        this._processing = true;
        // this method will be called upon instantiation of the queue and will check for pending tasks
        // it will re-run itself with a timer to check for new tasks
        // this will be the main loop for the queue
        if (this._queue.length > 0) {
          let processing: TaskBase[] = this._queue.filter(t => t.Status === TaskStatus.InProgress);
          let pending: TaskBase[] = this._queue.filter(t => t.Status === TaskStatus.Pending);

          // we have room to process one or more additional tasks now
          while (processing.length < this._maxTasks && pending.length > 0) {
            let task = pending.shift();
            this.StartTask(task, this._contextUser); // INTENTIONAL - do not await as we want to fire off all the tasks we can do, and then move on
          }
        }
      }
      catch (e) {
        console.log(e);
      }
      finally {
        this._processing = false;
        if (!this._stopped) {
          this._pendingTimer = setTimeout(() => {
            this._pendingTimer = null;
            this.ProcessTasks();
          }, this._checkInterval); // setup the next check
        }
      }
    }
  }

  AddTask(task: TaskBase): boolean {
    if (this._stopped) {
      return false;
    }
    try {
      // Add a task to the queue
      this._queue.push(task);

      // fire off the process tasks function immediately but don't wait for it to finish
      this.ProcessTasks();

      return true;
    }
    catch (e) {
      return false;
    }
  }

  protected abstract ProcessTask(task: TaskBase, contextUser: UserInfo): Promise<TaskResult>;

  protected async StartTask(task: TaskBase, contextUser: UserInfo): Promise<TaskResult> {
    // the process function is responsible for calling the processor function
    try {
      task.Status = TaskStatus.InProgress; // immediately flag this task so it isn't picked up again...

      // run the task
      let result = await this.ProcessTask(task, contextUser);

      // now set the record data for the DB
      task.TaskRecord.Status = result.success ? "Completed" : "Failed";
      task.TaskRecord.Output = result.output;
      task.TaskRecord.ErrorMessage = result.exception ? JSON.stringify(result.exception) : null;
      // Save() returns false on failure — it does not throw. Ignoring that return left the row at
      // whatever status it held before the run while the in-memory task still reported Complete, so
      // anything polling the database for the transition waited for a write that never happened.
      const persisted = await task.TaskRecord.Save();
      if (!persisted) {
        LogError(
          `[QueueBase] Could not persist terminal status for task ${task.ID}: ` +
          `${task.TaskRecord.LatestResult?.CompleteMessage ?? 'unknown error'}`
        );
      }

      // Only claim Complete when the DB actually recorded it. A terminal status that never persisted
      // leaves the row at its prior (non-terminal) status, so a caller polling the row would wait
      // forever — reflecting the persist failure as Failed keeps in-memory state honest. The
      // dispatcher only re-picks Pending tasks, so this never re-runs the task.
      task.Status = persisted && result.success ? TaskStatus.Complete : TaskStatus.Failed;

      return result;
    }
    catch (e) {
      console.log(e);
      // Without this, a task whose ProcessTask() rejects stays stuck at InProgress
      // forever, permanently occupying one of the queue's _maxTasks concurrency slots.
      task.Status = TaskStatus.Failed;
      return {
        success: false,
        output: null,
        userMessage: 'Execution Error: ' + e.message,
        exception: e
      }
    }
    finally {
      // Terminal tasks are no longer picked up by ProcessTasks(); drop them from
      // _queue so a long-lived queue doesn't retain every task it has ever run.
      this.removeCompletedTask(task);
    }
  }

  private removeCompletedTask(task: TaskBase): void {
    const idx = this._queue.indexOf(task);
    if (idx !== -1) {
      this._queue.splice(idx, 1);
    }
  }

  /**
   * Current number of tasks retained in the in-memory queue (pending + in-progress).
   * Completed/failed tasks are removed once terminal, so this does not grow unbounded.
   */
  public get QueueSize(): number {
    return this._queue.length;
  }

  public FindTask(ID: string): TaskBase {
    return this._queue.find(t => UUIDsEqual(t.ID, ID));
  }
}
