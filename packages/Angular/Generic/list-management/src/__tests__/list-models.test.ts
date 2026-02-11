import { describe, it, expect } from 'vitest';
import type {
  ListManagementDialogConfig,
  ListManagementResult,
  ListOperationDetail,
  ListItemViewModel,
  ListFilterTab,
  ListSortOption,
  CreateListConfig,
  BatchOperationResult,
  RecordMembershipInfo
} from '../lib/models/list-management.models';

describe('ListManagementDialogConfig', () => {
  it('should construct add mode config', () => {
    const config: ListManagementDialogConfig = {
      mode: 'add',
      entityId: 'entity-1',
      entityName: 'Users',
      recordIds: ['rec-1', 'rec-2']
    };
    expect(config.mode).toBe('add');
    expect(config.recordIds).toHaveLength(2);
  });

  it('should support all mode types', () => {
    const modes: ListManagementDialogConfig['mode'][] = ['add', 'remove', 'manage'];
    expect(modes).toHaveLength(3);
  });

  it('should accept optional fields', () => {
    const config: ListManagementDialogConfig = {
      mode: 'manage',
      entityId: 'e1',
      entityName: 'Items',
      recordIds: ['r1'],
      allowCreate: true,
      allowRemove: true,
      showMembership: false,
      preSelectedListIds: ['l1'],
      dialogTitle: 'Manage Lists'
    };
    expect(config.allowCreate).toBe(true);
    expect(config.dialogTitle).toBe('Manage Lists');
  });
});

describe('ListManagementResult', () => {
  it('should represent cancelled result', () => {
    const result: ListManagementResult = {
      action: 'cancel',
      added: [],
      removed: [],
      newListsCreated: []
    };
    expect(result.action).toBe('cancel');
  });

  it('should represent applied result with operations', () => {
    const result: ListManagementResult = {
      action: 'apply',
      added: [{ listId: 'l1', listName: 'Favorites', recordIds: ['r1'] }],
      removed: [],
      newListsCreated: []
    };
    expect(result.added).toHaveLength(1);
    expect(result.added[0].listName).toBe('Favorites');
  });
});

describe('BatchOperationResult', () => {
  it('should track success, failed, and skipped counts', () => {
    const result: BatchOperationResult = {
      success: 8,
      failed: 1,
      skipped: 2,
      errors: ['Record r5 already in list']
    };
    expect(result.success).toBe(8);
    expect(result.errors).toHaveLength(1);
  });
});

describe('Filter and sort types', () => {
  it('should support all filter tabs', () => {
    const tabs: ListFilterTab[] = ['all', 'my-lists', 'shared', 'recent'];
    expect(tabs).toHaveLength(4);
  });

  it('should support all sort options', () => {
    const sorts: ListSortOption[] = ['name', 'recent', 'item-count'];
    expect(sorts).toHaveLength(3);
  });
});

describe('CreateListConfig', () => {
  it('should construct with required fields', () => {
    const config: CreateListConfig = {
      name: 'My New List',
      entityId: 'e1'
    };
    expect(config.name).toBe('My New List');
    expect(config.description).toBeUndefined();
  });
});
