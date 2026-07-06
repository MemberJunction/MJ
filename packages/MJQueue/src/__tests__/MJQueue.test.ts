/**
 * Unit tests for the MJQueue package.
 * Tests: TaskBase, TaskStatus, QueueBase task management, QueueManager singleton.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/core', () => {
  class MockBaseEntity {
    Fields: unknown[] = [];
    ID = '';
    GetAll() { return {}; }
    Save = vi.fn().mockResolvedValue(true);
    // Suppress the AssertEntityActiveStatus check
  }
  return {
    UserInfo: class { ID = 'user-1'; },
    BaseEntity: MockBaseEntity,
    Metadata: class {
      GetEntityObject = vi.fn();
    },
    RunView: class {
      RunView = vi.fn();
    },
    LogError: vi.fn(),
    LogStatus: vi.fn(),
  };
});

vi.mock('@memberjunction/core-entities', () => {
  class MockQueueEntity {
    ID = 'queue-1';
    Set = vi.fn();
    Save = vi.fn().mockResolvedValue(true);
    NewRecord = vi.fn();
  }
  class MockQueueTaskEntity {
    ID = 'task-1';
    Status = 'Pending';
    Output: string | null = null;
    ErrorMessage: string | null = null;
    Save = vi.fn().mockResolvedValue(true);
    Set = vi.fn();
  }
  class MockQueueTypeEntity {
    ID = 'type-1';
    Name = 'TestQueue';
    IsActive = true;
  }
  return {
    MJQueueEntity: MockQueueEntity,
    MJQueueTaskEntity: MockQueueTaskEntity,
    MJQueueTypeEntity: MockQueueTypeEntity,
  };
});

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    MJGlobal: {
      Instance: {
        GetGlobalObjectStore: vi.fn().mockReturnValue({}),
        ClassFactory: {
          CreateInstance: vi.fn(),
        },
      },
    },
  };
});

vi.mock('os', () => ({
  default: {
    networkInterfaces: () => ({
      eth0: [{ address: '127.0.0.1', mac: '00:00:00:00:00:00' }],
    }),
    type: () => 'Linux',
    release: () => '5.4.0',
    hostname: () => 'testhost',
    userInfo: () => ({ uid: 1000, username: 'testuser' }),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { TaskBase, TaskResult, TaskStatus, QueueBase } from '../generic/QueueBase';
import { MJQueueTaskEntity } from '@memberjunction/core-entities';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskStatus', () => {
  it('should have all expected statuses', () => {
    expect(TaskStatus.Pending).toBe('Pending');
    expect(TaskStatus.InProgress).toBe('InProgress');
    expect(TaskStatus.Complete).toBe('Complete');
    expect(TaskStatus.Failed).toBe('Failed');
    expect(TaskStatus.Cancelled).toBe('Cancelled');
  });
});

describe('TaskBase', () => {
  let task: TaskBase;
  let mockTaskRecord: MJQueueTaskEntity;

  beforeEach(() => {
    // Use a plain object to avoid BaseEntity constructor issues
    mockTaskRecord = { ID: 'task-1', Status: 'Pending', Save: vi.fn() } as unknown as MJQueueTaskEntity;
    task = new TaskBase(mockTaskRecord, { key: 'value' }, { priority: 1 });
  });

  it('should store data and options', () => {
    expect(task.Data).toEqual({ key: 'value' });
    expect(task.Options).toEqual({ priority: 1 });
  });

  it('should expose the task record', () => {
    expect(task.TaskRecord).toBe(mockTaskRecord);
  });

  it('should have Pending status by default', () => {
    expect(task.Status).toBe(TaskStatus.Pending);
  });

  it('should allow setting status', () => {
    task.Status = TaskStatus.InProgress;
    expect(task.Status).toBe(TaskStatus.InProgress);
  });

  it('should expose ID from task record', () => {
    expect(task.ID).toBe('task-1');
  });
});

describe('QueueBase', () => {
  let queue: QueueBase;

  // Create a concrete subclass for testing
  class TestQueue extends QueueBase {
    public processTaskCalls: TaskBase[] = [];
    protected async ProcessTask(task: TaskBase): Promise<TaskResult> {
      this.processTaskCalls.push(task);
      return { success: true, userMessage: 'done', output: 'ok', exception: null };
    }
  }

  beforeEach(() => {
    // Create mock records as plain objects cast to the expected types
    const queueRecord = { ID: 'queue-1', Save: vi.fn() } as unknown as import('@memberjunction/core-entities').MJQueueEntity;
    const user = { ID: 'user-1' } as InstanceType<typeof import('@memberjunction/core').UserInfo>;
    queue = new TestQueue(queueRecord, 'type-1', user);
  });

  it('AddTask should return true and add task to queue', () => {
    const taskRecord = { ID: 'task-1', Status: 'Pending', Save: vi.fn() } as unknown as MJQueueTaskEntity;
    const task = new TaskBase(taskRecord, {}, {});
    const result = queue.AddTask(task);
    expect(result).toBe(true);
  });

  it('FindTask should find a task by ID', () => {
    const taskRecord = { ID: 'task-1', Status: 'Pending', Save: vi.fn() } as unknown as MJQueueTaskEntity;
    const task = new TaskBase(taskRecord, {}, {});
    queue.AddTask(task);
    const found = queue.FindTask('task-1');
    expect(found).toBe(task);
  });

  it('FindTask should return undefined for unknown ID', () => {
    const found = queue.FindTask('nonexistent');
    expect(found).toBeUndefined();
  });

  it('QueueID should return the queue record ID', () => {
    expect(queue.QueueID).toBe('queue-1');
  });

  it('QueueTypeID should return the type ID', () => {
    expect(queue.QueueTypeID).toBe('type-1');
  });

  describe('Stop / Shutdown (memory-leak fix C4)', () => {
    it('IsStopped is false by default and true after Stop()', () => {
      expect(queue.IsStopped).toBe(false);
      queue.Stop();
      expect(queue.IsStopped).toBe(true);
    });

    it('Stop() is idempotent', () => {
      queue.Stop();
      queue.Stop();
      expect(queue.IsStopped).toBe(true);
    });

    it('Shutdown() is an alias for Stop()', () => {
      queue.Shutdown();
      expect(queue.IsStopped).toBe(true);
    });

    it('AddTask returns false once stopped (no further work scheduled)', () => {
      queue.Stop();
      const taskRecord = { ID: 't', Status: 'Pending', Save: vi.fn() } as unknown as MJQueueTaskEntity;
      const result = queue.AddTask(new TaskBase(taskRecord, {}, {}));
      expect(result).toBe(false);
    });

    it('Stop() cancels the pending ProcessTasks timer', async () => {
      vi.useFakeTimers();
      try {
        const taskRecord = { ID: 't', Status: 'Pending', Save: vi.fn() } as unknown as MJQueueTaskEntity;
        queue.AddTask(new TaskBase(taskRecord, {}, {}));
        // The first AddTask runs ProcessTasks once and schedules the next via setTimeout.
        const before = vi.getTimerCount();
        expect(before).toBeGreaterThan(0);
        queue.Stop();
        // After Stop, no timers remain pending.
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('exposes a ShutdownName containing the queue identity', () => {
      expect(queue.ShutdownName).toContain('QueueBase');
      expect(queue.ShutdownName).toContain('type-1');
    });
  });

  describe('_queue trimming (memory-leak fix D-critical-2)', () => {
    it('removes a task from the queue once it completes successfully', async () => {
      const taskRecord = { ID: 't1', Status: 'Pending', Save: vi.fn().mockResolvedValue(true) } as unknown as MJQueueTaskEntity;
      const task = new TaskBase(taskRecord, {}, {});

      expect(queue.QueueSize).toBe(0);
      queue.AddTask(task);
      // Flush the microtask queue so StartTask's awaited continuation runs.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queue.QueueSize).toBe(0);
      expect(queue.FindTask('t1')).toBeUndefined();
      expect(task.Status).toBe(TaskStatus.Complete);
    });

    it('removes a task from the queue once it fails (ProcessTask resolves success:false)', async () => {
      class FailingQueue extends QueueBase {
        protected async ProcessTask(): Promise<TaskResult> {
          return { success: false, userMessage: 'nope', output: null, exception: null };
        }
      }
      const queueRecord = { ID: 'queue-2', Save: vi.fn() } as unknown as import('@memberjunction/core-entities').MJQueueEntity;
      const user = { ID: 'user-1' } as InstanceType<typeof import('@memberjunction/core').UserInfo>;
      const failingQueue = new FailingQueue(queueRecord, 'type-1', user);

      const taskRecord = { ID: 't2', Status: 'Pending', Save: vi.fn().mockResolvedValue(true) } as unknown as MJQueueTaskEntity;
      const task = new TaskBase(taskRecord, {}, {});

      failingQueue.AddTask(task);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(failingQueue.QueueSize).toBe(0);
      expect(task.Status).toBe(TaskStatus.Failed);
      failingQueue.Stop();
    });

    it('removes a task from the queue and marks it Failed when ProcessTask throws (does not stay stuck InProgress)', async () => {
      class ThrowingQueue extends QueueBase {
        protected async ProcessTask(): Promise<TaskResult> {
          throw new Error('boom');
        }
      }
      const queueRecord = { ID: 'queue-3', Save: vi.fn() } as unknown as import('@memberjunction/core-entities').MJQueueEntity;
      const user = { ID: 'user-1' } as InstanceType<typeof import('@memberjunction/core').UserInfo>;
      const throwingQueue = new ThrowingQueue(queueRecord, 'type-1', user);

      const taskRecord = { ID: 't3', Status: 'Pending', Save: vi.fn().mockResolvedValue(true) } as unknown as MJQueueTaskEntity;
      const task = new TaskBase(taskRecord, {}, {});

      throwingQueue.AddTask(task);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Before the fix, a thrown ProcessTask left the task stuck at InProgress forever,
      // permanently occupying one of the queue's concurrency slots.
      expect(task.Status).toBe(TaskStatus.Failed);
      expect(throwingQueue.QueueSize).toBe(0);
      throwingQueue.Stop();
    });

    it('does not grow _queue without bound across many sequential completed tasks', async () => {
      vi.useFakeTimers();
      try {
        // _maxTasks defaults to 3, so this exercises multiple recursive ProcessTasks()
        // cycles (driven by the periodic setTimeout) rather than a single batch.
        for (let i = 0; i < 50; i++) {
          const taskRecord = { ID: `bulk-${i}`, Status: 'Pending', Save: vi.fn().mockResolvedValue(true) } as unknown as MJQueueTaskEntity;
          queue.AddTask(new TaskBase(taskRecord, {}, {}));
        }
        // Advance past enough recursive ProcessTasks() cycles (250ms each, 3 tasks per
        // cycle) to drain all 50 tasks. ProcessTasks reschedules itself forever while the
        // queue isn't stopped, so use a bounded advance rather than runAllTimersAsync().
        await vi.advanceTimersByTimeAsync(5000);

        expect(queue.QueueSize).toBe(0);
      } finally {
        queue.Stop();
        vi.useRealTimers();
      }
    });
  });
});
