/**
 * QueueManager.AddTask writes the new task row through the generated typed properties (#3787),
 * so the `Status` value is checked against the generated value list at compile time.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeTaskRecord {
  ID: string;
  QueueID: string | null;
  Status: string | null;
  Data: string | null;
  Options: string | null;
  Set: ReturnType<typeof vi.fn>;
  Save: ReturnType<typeof vi.fn>;
}

const createdRecords: FakeTaskRecord[] = [];

vi.mock('@memberjunction/core', () => {
  class MockBaseEntity {}
  return {
    UserInfo: class { ID = 'user-1'; },
    BaseEntity: MockBaseEntity,
    Metadata: class {
      async GetEntityObject(): Promise<FakeTaskRecord> {
        const record: FakeTaskRecord = {
          ID: 'task-1',
          QueueID: null,
          Status: null,
          Data: null,
          Options: null,
          Set: vi.fn(),
          Save: vi.fn().mockResolvedValue(true),
        };
        createdRecords.push(record);
        return record;
      }
    },
    RunView: class {
      async RunView(): Promise<{ Success: boolean; Results: Array<{ ID: string; Name: string; IsActive: boolean }> }> {
        return { Success: true, Results: [{ ID: 'type-1', Name: 'TestQueue', IsActive: true }] };
      }
    },
    LogError: vi.fn(),
    LogStatus: vi.fn(),
  };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJQueueEntity: class {},
  MJQueueTaskEntity: class {},
  MJQueueTypeEntity: class {},
}));

import { QueueManager } from '../generic/QueueManager';
import { QueueBase, TaskBase } from '../generic/QueueBase';
import type { UserInfo } from '@memberjunction/core';

describe('QueueManager.AddTask (#3787)', () => {
  const user = { ID: 'user-1' } as UserInfo;
  const addedTasks: TaskBase[] = [];

  beforeEach(() => {
    createdRecords.length = 0;
    addedTasks.length = 0;
    const fakeQueue = {
      QueueID: 'queue-1',
      AddTask: (task: TaskBase) => {
        addedTasks.push(task);
        return true;
      },
    } as unknown as QueueBase;
    const proto = QueueManager.prototype as unknown as {
      CheckCreateQueue: () => Promise<QueueBase | undefined>;
    };
    vi.spyOn(proto, 'CheckCreateQueue').mockResolvedValue(fakeQueue);
  });

  it('saves the task with Status Pending through the typed properties, not Set()', async () => {
    const task = await QueueManager.AddTask('TestQueue', { a: 1 }, { b: 2 }, user);

    expect(task).toBeDefined();
    expect(createdRecords).toHaveLength(1);
    const record = createdRecords[0];
    expect(record.Status).toBe('Pending');
    expect(record.QueueID).toBe('queue-1');
    expect(record.Data).toBe(JSON.stringify({ a: 1 }));
    expect(record.Options).toBe(JSON.stringify({ b: 2 }));
    expect(record.Set).not.toHaveBeenCalled();
    expect(record.Save).toHaveBeenCalledTimes(1);
    expect(addedTasks).toHaveLength(1);
  });
});
