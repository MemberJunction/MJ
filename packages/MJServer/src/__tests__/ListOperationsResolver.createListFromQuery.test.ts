/**
 * The CreateListFromQuery mutation's boundary converters: the GraphQL input as a `ListFromQuery`
 * request, and a `ListFromQuery` outcome as the GraphQL result.
 */
import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import type { ListFromQueryOutcome } from '@memberjunction/lists';

import { CreateListFromQueryInput, FromListFromQueryOutcome, ToListFromQueryRequest } from '../resolvers/ListOperationsResolver.js';

function input(overrides: Partial<CreateListFromQueryInput> = {}): CreateListFromQueryInput {
  return Object.assign(new CreateListFromQueryInput(), { ListName: ' Active members ', RefreshMode: 'Additive', AutoRefresh: false, ...overrides });
}

const RESULT = { Success: true, ResultCode: 'SUCCESS' as const, Message: 'Materialized list with 2 member(s)', CreatedListId: 'list-1', Counts: { Added: 2, Removed: 0, Failed: 0 } };

describe('ToListFromQueryRequest', () => {
  it('trims text, parses ParametersJSON and keeps the refresh settings', () => {
    expect(ToListFromQueryRequest(input({
      Description: '  ', EntityName: ' Persons ', KeyField: ' ID ', ParametersJSON: '{"EventCode":"CONF2026"}', RefreshMode: 'Sync', AutoRefresh: true,
    }))).toEqual({
      ListName: 'Active members', Description: undefined, CategoryID: undefined, Parameters: { EventCode: 'CONF2026' },
      EntityName: 'Persons', KeyField: 'ID', RefreshMode: 'Sync', AutoRefresh: true,
    });
  });

  it('refuses a missing name, an unknown refresh mode, and ParametersJSON that is not an object', () => {
    expect(ToListFromQueryRequest(input({ ListName: '  ' }))).toMatch(/ListName is required/);
    expect(ToListFromQueryRequest(input({ RefreshMode: 'Replace' as never }))).toMatch(/RefreshMode must be/);
    expect(ToListFromQueryRequest(input({ ParametersJSON: '[1]' }))).toMatch(/must be a JSON object/);
    expect(ToListFromQueryRequest(input({ ParametersJSON: 'nope' }))).toMatch(/must be a JSON object/);
  });
});

describe('FromListFromQueryOutcome', () => {
  it('reports a list linked to a newly saved query as one that refreshes', () => {
    const outcome: ListFromQueryOutcome = { Kind: 'Created', Result: RESULT, SourceQueryID: 'q-1', SourceQueryName: 'Active members', SavedNewQuery: true, StaticReason: null };
    expect(FromListFromQueryOutcome(outcome)).toMatchObject({
      Success: true, ResultCode: 'SUCCESS', CreatedListId: 'list-1', AddedCount: 2,
      SourceQueryID: 'q-1', SourceQueryName: 'Active members', SavedNewQuery: true, Refreshes: true, StaticReason: undefined,
    });
  });

  it("reports a list made without a query as one that won't refresh, with the reason", () => {
    const outcome: ListFromQueryOutcome = { Kind: 'Created', Result: RESULT, SourceQueryID: null, SourceQueryName: null, SavedNewQuery: false, StaticReason: 'no permission to create Queries' };
    expect(FromListFromQueryOutcome(outcome)).toMatchObject({ Refreshes: false, SourceQueryID: undefined, StaticReason: 'no permission to create Queries' });
  });

  it('passes a refusal through with its code', () => {
    expect(FromListFromQueryOutcome({ Kind: 'Refused', Code: 'PERMISSION_DENIED', Message: 'hidden column' })).toEqual({
      Success: false, ResultCode: 'PERMISSION_DENIED', Message: 'hidden column', SavedNewQuery: false, Refreshes: false,
    });
  });
});
