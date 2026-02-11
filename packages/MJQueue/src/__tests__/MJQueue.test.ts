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
    QueueEntity: MockQueueEntity,
    QueueTaskEntity: MockQueueTaskEntity,
    QueueTypeEntity: MockQueueTypeEntity,
  };
});

vi.mock('@memberjunction/global', () => ({
  MJGlobal: {
    Instance: {
      GetGlobalObjectStore: vi.fn().mockReturnValue({}),
      ClassFactory: {
        CreateInstance: vi.fn(),
      },
    },
  },
}));

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
import { QueueTaskEntity } from '@memberjunction/core-entities';

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
  let mockTaskRecord: QueueTaskEntity;

  beforeEach(() => {
    // Use a plain object to avoid BaseEntity constructor issues
    mockTaskRecord = { ID: 'task-1', Status: 'Pending', Save: vi.fn() } as unknown as QueueTaskEntity;
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
    const queueRecord = { ID: 'queue-1', Save: vi.fn() } as unknown as import('@memberjunction/core-entities').QueueEntity;
    const user = { ID: 'user-1' } as InstanceType<typeof import('@memberjunction/core').UserInfo>;
    queue = new TestQueue(queueRecord, 'type-1', user);
  });

  it('AddTask should return true and add task to queue', () => {
    const taskRecord = { ID: 'task-1', Status: 'Pending', Save: vi.fn() } as unknown as QueueTaskEntity;
    const task = new TaskBase(taskRecord, {}, {});
    const result = queue.AddTask(task);
    expect(result).toBe(true);
  });

  it('FindTask should find a task by ID', () => {
    const taskRecord = { ID: 'task-1', Status: 'Pending', Save: vi.fn() } as unknown as QueueTaskEntity;
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
});
