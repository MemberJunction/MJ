import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import {
  LOOKUP_OPTIONAL_MESSAGE,
  ParseLookupCreateFields,
  ParseLookupPairs,
  SplitLookupReference,
} from '../lib/lookup-reference';
import { SyncEngine } from '../lib/sync-engine';

describe('SplitLookupReference', () => {
  it('splits entity, criteria and flags at the first "." and the first "?"', () => {
    expect(SplitLookupReference('MJ: Users.Email=@env:E&Status=Active?create&allowDefer&Name=New')).toEqual({
      EntityName: 'MJ: Users',
      CriteriaText: 'Email=@env:E&Status=Active',
      FlagsText: 'create&allowDefer&Name=New',
      FlagNames: new Set(['create', 'allowdefer', 'name']),
      UnknownBareFlags: [],
    });
  });

  it('gives empty flags without a "?"', () => {
    const split = SplitLookupReference('X.Name=@env:V');
    expect(split?.CriteriaText).toBe('Name=@env:V');
    expect(split?.FlagsText).toBe('');
    expect(split?.UnknownBareFlags).toEqual([]);
  });

  it('reports bare flags other than create and allowDefer', () => {
    expect(SplitLookupReference('X.Name=@env:V?optional')?.UnknownBareFlags).toEqual(['optional']);
    expect(SplitLookupReference('X.Name=@env:V?Optional&create')?.UnknownBareFlags).toEqual(['optional']);
    expect(SplitLookupReference('X.Name=@env:V? optional &create')?.UnknownBareFlags).toEqual(['optional']);
  });

  it('returns null without an entity', () => {
    expect(SplitLookupReference('.Name=X')).toBeNull();
    expect(SplitLookupReference('NoDot')).toBeNull();
  });
});

describe('ParseLookupPairs', () => {
  it('parses trimmed pairs and keeps "=" inside a value', () => {
    expect(ParseLookupPairs(' Email = a@b.c &Expr=x=y')).toEqual([
      { Name: 'Email', Value: 'a@b.c' },
      { Name: 'Expr', Value: 'x=y' },
    ]);
  });

  it('returns null when a pair has no "="', () => {
    expect(ParseLookupPairs('Name=A&Bad')).toBeNull();
  });
});

describe('ParseLookupCreateFields', () => {
  it('returns decoded key=value items and skips the known flags', () => {
    expect(ParseLookupCreateFields('create&allowDefer&Description=A%20B&Code=@env:C')).toEqual([
      { Name: 'Description', Value: 'A B' },
      { Name: 'Code', Value: '@env:C' },
    ]);
  });
});

describe('SyncEngine @lookup: on push', () => {
  let engine: SyncEngine;

  beforeEach(() => {
    engine = new SyncEngine(new UserInfo(null, { ID: 'user-1', Name: 'Test', Email: 'test@example.com' }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('throws Invalid @lookup reference for ?optional', async () => {
    const resolve = vi.spyOn(engine, 'ResolveLookup').mockResolvedValue('id-1');

    await expect(engine.ProcessFieldValue('@lookup:MJ: Users.Email=@env:MJ_LOOKUP_E?optional', '/tmp')).rejects.toThrow(
      `Invalid @lookup reference: @lookup:MJ: Users.Email=@env:MJ_LOOKUP_E?optional. ${LOOKUP_OPTIONAL_MESSAGE}`
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it('still resolves @env: criteria and create fields', async () => {
    vi.stubEnv('MJ_LOOKUP_E', 'admin@example.com');
    const resolve = vi.spyOn(engine, 'ResolveLookup').mockResolvedValue('id-1');

    const id = await engine.ProcessFieldValue('@lookup:MJ: Users.Email=@env:MJ_LOOKUP_E?create&Name=A%20B', '/tmp');

    expect(id).toBe('id-1');
    expect(resolve.mock.calls[0][0]).toBe('MJ: Users');
    expect(resolve.mock.calls[0][1]).toEqual([{ fieldName: 'Email', fieldValue: 'admin@example.com' }]);
    expect(resolve.mock.calls[0][2]).toBe(true);
    expect(resolve.mock.calls[0][3]).toEqual({ Name: 'A B' });
  });
});
