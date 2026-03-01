import { UserInfo, BaseEntity } from '@memberjunction/core';
import { MJQueueEntity, MJQueueTaskEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
//import { MJQueueTaskEntity, MJQueueEntity } from 'mj_generatedentities';

export class TaskResult {
  success: boolean
  userMessage: string
  output: any
  exception: any
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


export abstract class QueueBase  {  
  private _queue: TaskBase[] = [];
  private _queueTypeId: string;
  protected _contextUser: UserInfo
  private _maxTasks: number = 3; // move to metadata or config param
  private _checkInterval: number = 250; // move to metadata or config param
  private _queueRecord: MJQueueEntity

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

  private _processing: boolean = false;
  protected ProcessTasks() {
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
        setTimeout(() => {
          this.ProcessTasks()
        }, this._checkInterval); // setup the next check
      }
    }
  }

  AddTask(task: TaskBase): boolean {
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
      await task.TaskRecord.Save();

      // update the task status
      task.Status = result.success ? TaskStatus.Complete : TaskStatus.Failed; 

      return result;
    }
    catch (e) {
      console.log(e);
      return {
        success: false,
        output: null,
        userMessage: 'Execution Error: ' + e.message,
        exception: e
      }
    }
  }

  public FindTask(ID: string): TaskBase {
    return this._queue.find(t => UUIDsEqual(t.ID, ID));
  }
}
