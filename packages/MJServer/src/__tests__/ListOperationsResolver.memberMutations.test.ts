/**
 * The bulk member mutations of ListOperationsResolver: each one must hand its GraphQL arguments
 * to the matching `ListOperations` method unchanged.
 */
import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import type { ApplyResult } from '@memberjunction/lists-base';

import { CreateListFromRecordsInput, ListOperationsResolver } from '../resolvers/ListOperationsResolver.js';
import type { AppContext } from '../types.js';

const OK: ApplyResult = { Success: true, ResultCode: 'SUCCESS', Message: 'OK' };
const CTX = {} as AppContext;

function makeResolver() {
  const ops = {
    AddRecordsToList: vi.fn(async (..._args: unknown[]) => OK),
    RemoveRecordsFromList: vi.fn(async (..._args: unknown[]) => OK),
    DuplicateList: vi.fn(async (..._args: unknown[]) => OK),
    CopyRecordsToList: vi.fn(async (..._args: unknown[]) => OK),
    SetRecordStatus: vi.fn(async (..._args: unknown[]) => OK),
    CreateListFromRecords: vi.fn(async (..._args: unknown[]) => OK),
  };
  const resolver = new ListOperationsResolver();
  Object.defineProperty(resolver, 'buildOps', { value: () => ops });
  return { resolver, ops };
}

describe('ListOperationsResolver bulk member mutations', () => {
  it('AddRecordsToList passes the status and the sequence option', async () => {
    const { resolver, ops } = makeResolver();

    await resolver.AddRecordsToList('L1', ['a', 'b'], CTX, 'Active', true);
    await resolver.AddRecordsToList('L1', ['a'], CTX);

    expect(ops.AddRecordsToList.mock.calls).toEqual([
      ['L1', ['a', 'b'], { Status: 'Active', SequenceFromOrder: true }],
      ['L1', ['a'], { Status: undefined, SequenceFromOrder: false }],
    ]);
  });

  it('RemoveRecordsFromList passes the list and the records', async () => {
    const { resolver, ops } = makeResolver();

    await resolver.RemoveRecordsFromList('L1', ['a', 'b'], CTX);

    expect(ops.RemoveRecordsFromList.mock.calls).toEqual([['L1', ['a', 'b']]]);
  });

  it('DuplicateList passes the name, or no name when none is given', async () => {
    const { resolver, ops } = makeResolver();

    await resolver.DuplicateList('L1', 'Copy of L1', CTX);
    await resolver.DuplicateList('L1', null, CTX);

    expect(ops.DuplicateList.mock.calls).toEqual([
      ['L1', { ListName: 'Copy of L1' }],
      ['L1', { ListName: undefined }],
    ]);
  });

  it('CopyRecordsToList passes removeFromSource as given', async () => {
    const { resolver, ops } = makeResolver();

    await resolver.CopyRecordsToList('SRC', 'DST', ['a'], true, CTX);
    await resolver.CopyRecordsToList('SRC', 'DST', ['a'], false, CTX);

    expect(ops.CopyRecordsToList.mock.calls).toEqual([
      ['SRC', 'DST', ['a'], { RemoveFromSource: true }],
      ['SRC', 'DST', ['a'], { RemoveFromSource: false }],
    ]);
  });

  it('SetListRecordStatus passes the status', async () => {
    const { resolver, ops } = makeResolver();

    await resolver.SetListRecordStatus('L1', ['a'], 'Complete', CTX);

    expect(ops.SetRecordStatus.mock.calls).toEqual([['L1', ['a'], 'Complete']]);
  });

  it('CreateListFromRecords passes the entity, the records and the list options', async () => {
    const { resolver, ops } = makeResolver();
    const options = Object.assign(new CreateListFromRecordsInput(), { ListName: 'Picked', Description: 'd', CategoryId: 'cat-1' });

    await resolver.CreateListFromRecords('Contacts', ['a'], options, CTX);

    expect(ops.CreateListFromRecords.mock.calls).toEqual([
      ['Contacts', ['a'], { ListName: 'Picked', Description: 'd', CategoryId: 'cat-1' }],
    ]);
  });
});
