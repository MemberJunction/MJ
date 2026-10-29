import { describe, expect, it, vi } from 'vitest';

import { GraphQLIntegrationClient } from '../graphQLIntegrationClient';
import type { GraphQLDataProvider } from '../graphQLDataProvider';

function makeClient(impl: (query: string, variables: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  const ExecuteGQL = vi.fn(impl);
  const client = new GraphQLIntegrationClient({ ExecuteGQL } as unknown as GraphQLDataProvider);
  return { client, ExecuteGQL };
}

describe('GraphQLIntegrationClient archive seed', () => {
  it('StartArchiveSeed sends the input and returns the server payload', async () => {
    const reply = { IntegrationArchiveSeedStart: { Success: true, Message: 'ok', JobID: 'j1', RunID: 'r1', CompanyIntegrationID: 'c1' } };
    const { client, ExecuteGQL } = makeClient(async () => reply);
    const input = { CompanyID: 'co', ConnectionName: 'Conn', BackupUrls: 'https://x/a.bak' };
    const result = await client.StartArchiveSeed(input);
    expect(String(ExecuteGQL.mock.calls[0][0])).toContain('IntegrationArchiveSeedStart');
    expect(ExecuteGQL.mock.calls[0][1]).toEqual({ input });
    expect(result).toEqual(reply.IntegrationArchiveSeedStart);
  });

  it('SelectArchiveSeedTables sends jobID and tableNames', async () => {
    const { client, ExecuteGQL } = makeClient(async () => ({ IntegrationArchiveSeedSelectTables: { Success: true, Message: 'ok' } }));
    const result = await client.SelectArchiveSeedTables('j1', ['A', 'B']);
    expect(String(ExecuteGQL.mock.calls[0][0])).toContain('IntegrationArchiveSeedSelectTables');
    expect(ExecuteGQL.mock.calls[0][1]).toEqual({ jobID: 'j1', tableNames: ['A', 'B'] });
    expect(result.Success).toBe(true);
  });

  it('FinishArchiveSeed sends jobID and dropStaging', async () => {
    const { client, ExecuteGQL } = makeClient(async () => ({ IntegrationArchiveSeedFinish: { Success: true, Message: 'ok' } }));
    await client.FinishArchiveSeed('j1', true);
    expect(String(ExecuteGQL.mock.calls[0][0])).toContain('IntegrationArchiveSeedFinish');
    expect(ExecuteGQL.mock.calls[0][1]).toEqual({ jobID: 'j1', dropStaging: true });
  });

  it('CancelArchiveSeed sends jobID', async () => {
    const { client, ExecuteGQL } = makeClient(async () => ({ IntegrationArchiveSeedCancel: { Success: true, Message: 'Archive seed cancelled.' } }));
    const result = await client.CancelArchiveSeed('j1');
    expect(String(ExecuteGQL.mock.calls[0][0])).toContain('IntegrationArchiveSeedCancel');
    expect(ExecuteGQL.mock.calls[0][1]).toEqual({ jobID: 'j1' });
    expect(result.Success).toBe(true);
  });

  it('GetArchiveSeedState maps the flat response into State', async () => {
    const flat = {
      Success: true, Message: 'ok', JobID: 'j1', CompanyIntegrationID: 'c1', State: 'AwaitingSelection',
      Tables: [{ Name: 'T', ColumnCount: 3, HasPrimaryKey: true }],
    };
    const { client, ExecuteGQL } = makeClient(async () => ({ IntegrationArchiveSeedState: flat }));
    const result = await client.GetArchiveSeedState('j1');
    expect(String(ExecuteGQL.mock.calls[0][0])).toContain('IntegrationArchiveSeedState');
    expect(ExecuteGQL.mock.calls[0][1]).toEqual({ jobID: 'j1' });
    expect(result.Success).toBe(true);
    expect(result.State?.JobID).toBe('j1');
    expect(result.State?.State).toBe('AwaitingSelection');
    expect(result.State?.Tables?.[0].Name).toBe('T');
  });

  it('GetArchiveSeedState omits State when the server reports failure', async () => {
    const { client } = makeClient(async () => ({ IntegrationArchiveSeedState: { Success: false, Message: 'Unknown job' } }));
    const result = await client.GetArchiveSeedState('nope');
    expect(result).toEqual({ Success: false, Message: 'Unknown job' });
    expect(result.State).toBeUndefined();
  });

  it('returns Success false on an empty response', async () => {
    const { client } = makeClient(async () => ({}));
    expect((await client.StartArchiveSeed({ CompanyID: 'a', ConnectionName: 'b', BackupUrls: 'c' })).Success).toBe(false);
    expect((await client.GetArchiveSeedState('j')).Message).toBe('No response');
  });

  it('returns Success false when ExecuteGQL throws', async () => {
    const { client } = makeClient(async () => { throw new Error('boom'); });
    expect(await client.StartArchiveSeed({ CompanyID: 'a', ConnectionName: 'b', BackupUrls: 'c' })).toEqual({ Success: false, Message: 'boom' });
    expect(await client.SelectArchiveSeedTables('j', [])).toEqual({ Success: false, Message: 'boom' });
    expect(await client.FinishArchiveSeed('j', false)).toEqual({ Success: false, Message: 'boom' });
    expect(await client.GetArchiveSeedState('j')).toEqual({ Success: false, Message: 'boom' });
  });
});
