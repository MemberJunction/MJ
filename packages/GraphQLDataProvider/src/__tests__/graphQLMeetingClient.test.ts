import { describe, expect, it, vi } from 'vitest';
import { GraphQLMeetingClient } from '../graphQLMeetingClient';
import type { GraphQLDataProvider } from '../graphQLDataProvider';

function makeProvider(reply: Record<string, unknown> | (() => never)) {
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  const provider = {
    ExecuteGQL: vi.fn(async (query: string, variables: Record<string, unknown>) => {
      calls.push({ query, variables });
      if (typeof reply === 'function') {
        reply();
      }
      return reply;
    }),
  } as unknown as GraphQLDataProvider;
  return { provider, calls };
}

describe('GraphQLMeetingClient', () => {
  it('calls MyMeetings and returns array', async () => {
    const { provider, calls } = makeProvider({
      MyMeetings: [
        { ID: 'm1', Title: 'Sprint Review', RoomName: 'mj-mtg-1', Status: 'Scheduled' },
      ],
    });
    const client = new GraphQLMeetingClient(provider);
    const result = await client.MyMeetings('Scheduled');
    expect(calls[0].variables).toEqual({ status: 'Scheduled' });
    expect(result.length).toBe(1);
    expect(result[0].Title).toBe('Sprint Review');
  });

  it('calls CreateMeeting and parses meeting result', async () => {
    const { provider, calls } = makeProvider({
      CreateMeeting: {
        Success: true,
        Meeting: { ID: 'm2', Title: 'Architecture Review', RoomName: 'mj-mtg-2', Status: 'Scheduled' },
      },
    });
    const client = new GraphQLMeetingClient(provider);
    const result = await client.CreateMeeting({ Title: 'Architecture Review' });
    expect(calls[0].variables).toEqual({ input: { Title: 'Architecture Review' } });
    expect(result.Success).toBe(true);
    expect(result.Meeting?.RoomName).toBe('mj-mtg-2');
  });

  it('calls StartMeeting and parses start result with client token', async () => {
    const { provider, calls } = makeProvider({
      StartMeeting: {
        Success: true,
        RoomName: 'mj-mtg-3',
        ClientToken: 'test-token',
        Meeting: { ID: 'm3', Title: 'Live Meeting', Status: 'Live' },
      },
    });
    const client = new GraphQLMeetingClient(provider);
    const result = await client.StartMeeting('m3');
    expect(calls[0].variables).toEqual({ meetingID: 'm3' });
    expect(result.Success).toBe(true);
    expect(result.ClientToken).toBe('test-token');
  });

  it('normalizes network errors without throwing', async () => {
    const { provider } = makeProvider(() => {
      throw new Error('Connection refused');
    });
    const client = new GraphQLMeetingClient(provider);
    const result = await client.CreateMeeting({ Title: 'Will Fail' });
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('Connection refused');
  });
});
