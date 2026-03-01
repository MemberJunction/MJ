//import { MJQueueEntity, MJQueueTaskEntity, MJQueueTypeEntity } from "mj_generatedentities";
import { TaskBase, QueueBase } from "./QueueBase";
import { LogError, Metadata, RunView, UserInfo, BaseEntity } from "@memberjunction/core";
import { MJQueueEntity, MJQueueTaskEntity, MJQueueTypeEntity } from "@memberjunction/core-entities";
import { MJGlobal, UUIDsEqual } from "@memberjunction/global";
import os from 'os';

/**
 *QueueManager class is a generic manager of all active queues for the process.
 *
 *Whenever a new task is added, the queue manager will see if the TYPE of task already has a queue running
 *or not. If that type of queue isn't running, it will start one up.
 *
 *Then, a new task is processed by logging into the database the new task and then it will be assigned
 *to the queue that is responsible for processing that type of task.
 *
 *The queue manager is also responseible for updating all of its active Queues in the DB with heartbeat
 *information. Heartbeat information is used to determine if a queue has crashed or not by other processes 
 *or not. After a heartbeat timeout is reached, other queues can pick up tasks from a crashed process.
 */
export class QueueManager { 
  private _queueTypes: MJQueueTypeEntity[] = [];
  private _queues: QueueBase[] = [];
  private static _instance: QueueManager | null = null;
  private static _globalInstanceKey = '__mj_queue_manager_instance__';

  public static get QueueTypes(): MJQueueTypeEntity[] {
    return QueueManager.Instance._queueTypes;
  }

  public static get Instance(): QueueManager {
    if (QueueManager._instance === null)
      QueueManager._instance = new QueueManager();

    return QueueManager._instance;
  }

  private configPromise: Promise<void> | null = null;
  public async Config(contextUser: UserInfo): Promise<void> {
    if (this._queueTypes.length === 0) {
      if (!this.configPromise) {
        this.configPromise = this.loadQueueTypes(contextUser);
      }

      try {
        await this.configPromise;
      } finally {
        this.configPromise = null;
      }
    }
  }

  public static async Config(contextUser: UserInfo): Promise<void> {
    await QueueManager.Instance.Config(contextUser);
  }

  protected async loadQueueTypes(contextUser: UserInfo): Promise<void> {
    // load all of the queue types from the database
    const rv = new RunView();
    const queueTypes = await rv.RunView({
      EntityName: 'MJ: Queue Types',
    }, contextUser);
    QueueManager.Instance._queueTypes = queueTypes.Results;
  }

  constructor() {
    if (QueueManager._instance === null) {
      // check the global object first to see if we have an instance there since multiple modules might load this code
      // and the static instance colud be different for each module based on JS import paths
      const g = MJGlobal.Instance.GetGlobalObjectStore();
      if (g && g[QueueManager._globalInstanceKey]) {
        QueueManager._instance = g[QueueManager._globalInstanceKey];
      } 
      else {
        if (g)
          g[QueueManager._globalInstanceKey] = this; // save the instance to the global object store if we have a global object store

        QueueManager._instance = this; // and save our new instance to the static member for future use
      }
    }

    return QueueManager._instance;
  }

  public static async AddTask(QueueType: string, data: any, options: any, contextUser: UserInfo): Promise<TaskBase | undefined> {
    await QueueManager.Config(contextUser);
    const queueType = QueueManager.QueueTypes.find(qt => qt.Name == QueueType);
    if (queueType == null)
      throw new Error(`Queue Type ${QueueType} not found.`)
    
    return QueueManager.Instance.AddTask(queueType.ID, data, options, contextUser);
  }

  public async AddTask(QueueTypeID: string, data: any, options: any, contextUser: UserInfo): Promise<TaskBase | undefined> {
    try {
      // STEP 1: Find the queue type
      const queueType = QueueManager.QueueTypes.find(qt => UUIDsEqual(qt.ID, QueueTypeID));
      if (queueType == null) 
        throw new Error(`Queue Type ID ${QueueTypeID} not found.`)

      if (queueType.IsActive === false)
        throw new Error(`Queue Type ID ${QueueTypeID} is not active.`)

      // STEP 2: Find the queue for this type, create it if we don't have one running yet for the specified queue type
      const queue = await this.CheckCreateQueue(queueType, contextUser);
      if (queue) {
        // STEP 3: Create a task in the database for this new task
        const md = new Metadata();
        const taskRecord = <MJQueueTaskEntity>await md.GetEntityObject('MJ: Queue Tasks', contextUser);
        taskRecord.Set('QueueID', queue.QueueID);
        taskRecord.Set('Status', 'Pending');
        taskRecord.Set('Data', JSON.stringify(data));
        taskRecord.Set('Options', JSON.stringify(options));
        if (await taskRecord.Save()) {
          // db save worked, now we can create a taskBase object
          const task = new TaskBase(taskRecord, data, options);
          queue.AddTask(task);
          return task;
        }
        else
          throw new Error(`Failed to save new task to the database.`);
      }
    }
    catch (e: any) {
      LogError(e.message);
    }
  }


  // Initialize a map to hold ongoing queue creation promises
  private ongoingQueueCreations = new Map<string, Promise<QueueBase>>();

  protected async CheckCreateQueue(queueType: MJQueueTypeEntity, contextUser: UserInfo): Promise<QueueBase | undefined> {
    let queue = this._queues.find(q => q.QueueTypeID == queueType.ID);

    if (queue === null || queue === undefined) {
      // If a queue creation for this type is not already in progress, start one
      if (!this.ongoingQueueCreations.has(queueType.ID)) {
        this.ongoingQueueCreations.set(queueType.ID, this.CreateQueue(queueType, contextUser));
      }

      try {
        // Wait for the ongoing queue creation to finish
        queue = await this.ongoingQueueCreations.get(queueType.ID);
      } catch (error) {
        // If there's an error, remove the promise from the map and rethrow the error
        this.ongoingQueueCreations.delete(queueType.ID);
        throw error;
      }

      // Once the queue creation has completed successfully, remove the promise from the map
      this.ongoingQueueCreations.delete(queueType.ID);
    }

    return queue;
  }


  protected async CreateQueue(queueType: MJQueueTypeEntity, contextUser: UserInfo): Promise<QueueBase | null | undefined> {
    try {
      // create a new queue, based on the Queue Type metadata and process info
      const md = new Metadata();
      const newQueueRecord = <MJQueueEntity>await md.GetEntityObject('MJ: Queues', contextUser);
      newQueueRecord.NewRecord();
      newQueueRecord.Set('QueueTypeID', queueType.ID);
      newQueueRecord.Set('Name', queueType.Name);
      newQueueRecord.Set('IsActive', true);
      newQueueRecord.Set('ProcessPID', process.pid);
      newQueueRecord.Set('ProcessPlatform', process.platform);
      newQueueRecord.Set('ProcessVersion', process.version);
      newQueueRecord.Set('ProcessCwd', process.cwd());

      const networkInterfaces = os.networkInterfaces();
      const interfaceNames = Object.keys(networkInterfaces);
      
      if (interfaceNames.length > 0) {
        const firstInterfaceName = interfaceNames[0];
        const firstInterface = networkInterfaces[firstInterfaceName];
        if (firstInterface && firstInterface.length > 0) {
          newQueueRecord.Set('ProcessIPAddress', firstInterface[0].address);
          newQueueRecord.Set('ProcessMacAddress', firstInterface[0].mac);
        }
      }

      newQueueRecord.Set('ProcessOSName', os.type());
      newQueueRecord.Set('ProcessOSVersion', os.release());
      newQueueRecord.Set('ProcessHostName', os.hostname());
      newQueueRecord.Set('ProcessUserID', os.userInfo().uid.toString());
      newQueueRecord.Set('ProcessUserName', os.userInfo().username); 

      newQueueRecord.Set('LastHeartbeat', new Date());

      if (await newQueueRecord.Save()) {
        const newQueue = MJGlobal.Instance.ClassFactory.CreateInstance<QueueBase>(QueueBase, queueType.Name, newQueueRecord, queueType.ID, contextUser)   
        if (newQueue) 
          this._queues.push(newQueue);
        return newQueue;
      }
      else
        throw new Error(`Unable to create new queue for Queue Type ID ${queueType.ID}.`);
    }
    catch (e: any) {
      LogError(e.message);
      return null;
    }
  }

  protected get Queues(): QueueBase[] {
    return this._queues;
  }
}
  