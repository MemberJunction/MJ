/**
 * GraphQLActionClient.RunAction returns the action's output parameters in `Params`, as the server-side ActionEngine
 * does: the RunAction mutation sends them as `ResultData` (the caller-projected output params), and a client reading
 * an output by name (e.g. `CreatedListID`) must find it there.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ActionParam } from '@memberjunction/actions-base';
import { GraphQLActionClient } from '../graphQLActionClient';
import { GraphQLDataProvider } from '../graphQLDataProvider';

/** A provider whose ExecuteGQL answers the RunAction mutation with `payload`. */
function providerAnswering(payload: { Success: boolean; Message: string; ResultData?: string }): GraphQLDataProvider {
  const provider: GraphQLDataProvider = Object.create(GraphQLDataProvider.prototype);
  provider.ExecuteGQL = vi.fn(async () => ({ RunAction: { ...payload, ResultCode: 'SUCCESS' } }));
  return provider;
}

const INPUTS: ActionParam[] = [
  { Name: 'ViewID', Value: 'VIEW-1', Type: 'Input' },
  { Name: 'ListName', Value: 'Q4', Type: 'Input' },
];

describe('GraphQLActionClient.RunAction', () => {
  it('returns the output parameters the server sent, after the inputs', async () => {
    const outputs: ActionParam[] = [{ Name: 'CreatedListID', Value: 'LIST-1', Type: 'Output' }, { Name: 'Added', Value: 22, Type: 'Output' }];
    const client = new GraphQLActionClient(providerAnswering({ Success: true, Message: 'ok', ResultData: JSON.stringify(outputs) }));
    const result = await client.RunAction('ACT-1', INPUTS);
    expect(result.Success).toBe(true);
    expect(result.Params.map((p) => [p.Name, p.Value, p.Type])).toEqual([
      ['ViewID', 'VIEW-1', 'Input'], ['ListName', 'Q4', 'Input'], ['CreatedListID', 'LIST-1', 'Output'], ['Added', 22, 'Output'],
    ]);
  });

  it('reads the outputs as MJAPI sends them: an object keyed by index (CopyScalarsAndArrays of the param array)', async () => {
    const wire = { 0: { Name: 'CreatedListID', Type: 'Output', Value: 'LIST-1' }, 1: { Name: 'Added', Type: 'Output', Value: 22 } };
    const client = new GraphQLActionClient(providerAnswering({ Success: true, Message: 'ok', ResultData: JSON.stringify(wire) }));
    const result = await client.RunAction('ACT-1', INPUTS);
    expect(result.Params.find((p) => p.Name === 'CreatedListID')?.Value).toBe('LIST-1');
    expect(result.Params).toHaveLength(4);
  });

  it('an output named like an input (Type Both) replaces it', async () => {
    const outputs: ActionParam[] = [{ Name: 'ListName', Value: 'Q4 (2)', Type: 'Both' }];
    const client = new GraphQLActionClient(providerAnswering({ Success: true, Message: 'ok', ResultData: JSON.stringify(outputs) }));
    const result = await client.RunAction('ACT-1', INPUTS);
    expect(result.Params.map((p) => [p.Name, p.Value])).toEqual([['ViewID', 'VIEW-1'], ['ListName', 'Q4 (2)']]);
  });

  it('keeps the inputs alone when the server sent no outputs', async () => {
    const client = new GraphQLActionClient(providerAnswering({ Success: true, Message: 'ok' }));
    const result = await client.RunAction('ACT-1', INPUTS);
    expect(result.Params).toEqual(INPUTS);
  });
});
