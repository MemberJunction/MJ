import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { CompositeKey, KeyValuePair, RecordDependency, type IMetadataProvider } from '@memberjunction/core';
import type { AppContext } from '../../types.js';
import type { PubSubEngine } from 'type-graphql';

vi.mock('../../util.js', () => ({
  GetReadOnlyProvider: vi.fn(),
  GetReadWriteProvider: vi.fn(),
}));

import { GetReadOnlyProvider } from '../../util.js';
import { RecordDependencyResolver, RecordDependencyResult } from '../MergeRecordsResolver.js';

describe('RecordDependencyResolver', () => {
  it('returns PrimaryKey, IsSoftLink, and EntityIDFieldName from metadata provider', async () => {
    const mockDep: RecordDependency = {
      EntityName: 'Users',
      RelatedEntityName: 'RecordChanges',
      FieldName: 'RecordID',
      PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'CHG-100')]),
      IsSoftLink: true,
      EntityIDFieldName: 'EntityID',
    };

    const mockProvider = {
      GetRecordDependencies: vi.fn().mockResolvedValue([mockDep]),
    } as unknown as IMetadataProvider;

    vi.mocked(GetReadOnlyProvider).mockReturnValue(mockProvider);

    const resolver = new RecordDependencyResolver();
    const mockContext = {
      dataSource: {},
      userPayload: {},
      providers: [],
    } as unknown as AppContext;
    const mockPubSub = {} as PubSubEngine;

    const result = await resolver.GetRecordDependencies(
      'Users',
      { KeyValuePairs: [{ FieldName: 'ID', Value: 'USER-1' }] },
      mockContext,
      mockPubSub
    );

    expect(result).toHaveLength(1);
    expect(result[0].EntityName).toBe('Users');
    expect(result[0].RelatedEntityName).toBe('RecordChanges');
    expect(result[0].FieldName).toBe('RecordID');
    expect(result[0].PrimaryKey).toBe(mockDep.PrimaryKey);
    expect(result[0].IsSoftLink).toBe(true);
    expect(result[0].EntityIDFieldName).toBe('EntityID');

    // The pre-6.2 name stays as a deprecated alias for one release, so older clients keep working
    expect(result[0].CompositeKey).toBe(mockDep.PrimaryKey);
  });

  it('handles hard foreign key dependencies with undefined soft-link flags', async () => {
    const mockDep: RecordDependency = {
      EntityName: 'Customers',
      RelatedEntityName: 'Orders',
      FieldName: 'CustomerID',
      PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'ORD-555')]),
    };

    const mockProvider = {
      GetRecordDependencies: vi.fn().mockResolvedValue([mockDep]),
    } as unknown as IMetadataProvider;

    vi.mocked(GetReadOnlyProvider).mockReturnValue(mockProvider);

    const resolver = new RecordDependencyResolver();
    const mockContext = {
      dataSource: {},
      userPayload: {},
      providers: [],
    } as unknown as AppContext;
    const mockPubSub = {} as PubSubEngine;

    const result = await resolver.GetRecordDependencies(
      'Customers',
      { KeyValuePairs: [{ FieldName: 'ID', Value: 'CUST-1' }] },
      mockContext,
      mockPubSub
    );

    expect(result).toHaveLength(1);
    expect(result[0].PrimaryKey).toBe(mockDep.PrimaryKey);
    expect(result[0].IsSoftLink).toBeUndefined();
    expect(result[0].EntityIDFieldName).toBeUndefined();
  });

  it('forwards contextUser and options to provider and maps FieldDisplayName', async () => {
    const mockDep: RecordDependency = {
      EntityName: 'Users',
      RelatedEntityName: 'MJ: Task Links',
      FieldName: 'RecordID',
      FieldDisplayName: 'Linked Record',
      PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'TL-200')]),
      IsSoftLink: true,
      EntityIDFieldName: 'EntityID',
    };

    const getRecordDepsSpy = vi.fn().mockResolvedValue([mockDep]);
    const mockProvider = {
      GetRecordDependencies: getRecordDepsSpy,
    } as unknown as IMetadataProvider;

    vi.mocked(GetReadOnlyProvider).mockReturnValue(mockProvider as never);

    const resolver = new RecordDependencyResolver();
    const mockUser = { ID: 'u-1', Email: 'test@example.com' };
    const mockContext = {
      dataSource: {},
      userPayload: { userRecord: mockUser },
      providers: [],
    } as unknown as AppContext;
    const mockPubSub = {} as PubSubEngine;
    const options = { LinkType: 'soft' as const, IncludeSystemEntities: false };

    const result = await resolver.GetRecordDependencies(
      'Users',
      { KeyValuePairs: [{ FieldName: 'ID', Value: 'USER-1' }] },
      mockContext,
      mockPubSub,
      options
    );

    expect(getRecordDepsSpy).toHaveBeenCalledTimes(1);
    expect(getRecordDepsSpy.mock.calls[0][0]).toBe('Users');
    expect(getRecordDepsSpy.mock.calls[0][2]).toBe(mockUser);
    expect(getRecordDepsSpy.mock.calls[0][3]).toEqual(options);
    expect(result[0].FieldDisplayName).toBe('Linked Record');
  });
});
