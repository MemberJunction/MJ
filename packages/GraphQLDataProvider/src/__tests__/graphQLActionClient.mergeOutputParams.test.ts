/**
 * `GraphQLActionClient.MergeOutputParams` (audit M5b-24): the caller's parameters with the action's output parameters
 * from the wire's `ResultData` applied — an output named like a parameter replaces it, any other is appended; the array
 * may arrive keyed by index; anything that is not a named parameter is ignored.
 */
import { describe, it, expect } from 'vitest';
import type { ActionParam } from '@memberjunction/actions-base';
import { GraphQLActionClient } from '../graphQLActionClient';

const input: ActionParam[] = [{ Name: 'ViewID', Value: 'V1', Type: 'Input' }, { Name: 'ListName', Value: 'L', Type: 'Both' }];

describe('GraphQLActionClient.MergeOutputParams', () => {
  it('replaces a same-named parameter (case-insensitive) and appends a new output', () => {
    const merged = GraphQLActionClient.MergeOutputParams(input, JSON.parse('[{"Name":"listname","Value":"L2","Type":"Both"},{"Name":"CreatedListID","Value":"LIST-1","Type":"Output"}]'));
    expect(merged).toEqual([
      { Name: 'ViewID', Value: 'V1', Type: 'Input' },
      { Name: 'ListName', Value: 'L2', Type: 'Both' },
      { Name: 'CreatedListID', Value: 'LIST-1', Type: 'Output' },
    ]);
  });

  it('reads an index-keyed object as the array MJAPI sent', () => {
    const merged = GraphQLActionClient.MergeOutputParams(input, JSON.parse('{"0":{"Name":"CreatedListID","Value":"LIST-1","Type":"Output"}}'));
    expect(merged.map((p) => p.Name)).toEqual(['ViewID', 'ListName', 'CreatedListID']);
  });

  it('ignores anything that is not a named parameter, and leaves the parameters as they were without result data', () => {
    expect(GraphQLActionClient.MergeOutputParams(input, JSON.parse('[null, 3, "x", {"Value": 1}, {"Name": 7}]'))).toEqual(input);
    expect(GraphQLActionClient.MergeOutputParams(input, undefined)).toEqual(input);
    expect(GraphQLActionClient.MergeOutputParams(input, JSON.parse('"text"'))).toEqual(input);
  });
});
