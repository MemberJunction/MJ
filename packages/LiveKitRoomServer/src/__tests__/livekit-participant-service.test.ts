import { describe, it, expect, vi } from 'vitest';
import { ParticipantInfo, TwirpError } from 'livekit-server-sdk';
import { LiveKitParticipantService, type ParticipantUpdateClientLike } from '../livekit-participant-service';

const CONFIG = { ServerUrl: 'wss://test.livekit.cloud', ApiKey: 'devkey', ApiSecret: 'devsecretdevsecretdevsecret123456' };

/** A room service client that records each update, or fails with the given error. */
function makeClient(failWith?: Error) {
  const updateParticipant = vi.fn(async (room: string, identity: string) => {
    if (failWith) {
      throw failWith;
    }
    return new ParticipantInfo({ identity, name: room });
  });
  const client = { updateParticipant } satisfies ParticipantUpdateClientLike;
  return { client, updateParticipant };
}

describe('LiveKitParticipantService.SetAgentVision', () => {
  it("sets the person's mj.agentCanSee attribute to 'true' when they allow it", async () => {
    const { client, updateParticipant } = makeClient();
    const result = await new LiveKitParticipantService(CONFIG, client).SetAgentVision('room-1', 'user-u1', true);
    expect(result).toEqual({ Success: true });
    expect(updateParticipant).toHaveBeenCalledWith('room-1', 'user-u1', { attributes: { 'mj.agentCanSee': 'true' } });
  });

  it("removes the attribute ('') when they withdraw it", async () => {
    const { client, updateParticipant } = makeClient();
    await new LiveKitParticipantService(CONFIG, client).SetAgentVision('room-1', 'user-u1', false);
    expect(updateParticipant).toHaveBeenCalledWith('room-1', 'user-u1', { attributes: { 'mj.agentCanSee': '' } });
  });

  it('reports a person who is not in the room, without throwing', async () => {
    const { client } = makeClient(new TwirpError('Not Found', 'participant not found', 404, 'not_found'));
    const result = await new LiveKitParticipantService(CONFIG, client).SetAgentVision('room-1', 'user-u1', true);
    expect(result).toEqual({ Success: false, NotInRoom: true, ErrorMessage: 'user-u1 is not in room room-1.' });
  });

  it('does not take a bare 404 for "not in the room" (more likely a wrong server URL)', async () => {
    const { client } = makeClient(new TwirpError('Not Found', '404 page not found', 404));
    const result = await new LiveKitParticipantService(CONFIG, client).SetAgentVision('room-1', 'user-u1', true);
    expect(result).toEqual({ Success: false, ErrorMessage: '404 page not found' });
  });

  it("reports LiveKit's other refusals as they are, without throwing", async () => {
    const { client } = makeClient(new TwirpError('Unauthorized', 'invalid token', 401, 'unauthenticated'));
    const result = await new LiveKitParticipantService(CONFIG, client).SetAgentVision('room-1', 'user-u1', true);
    expect(result).toEqual({ Success: false, ErrorMessage: 'invalid token' });
  });

  it('refuses without calling LiveKit when the server has no LiveKit credentials', async () => {
    const { client, updateParticipant } = makeClient();
    const result = await new LiveKitParticipantService({ ServerUrl: '', ApiKey: '', ApiSecret: '' }, client).SetAgentVision('room-1', 'user-u1', true);
    expect(result).toEqual({ Success: false, ErrorMessage: 'LiveKit is not configured on this server.' });
    expect(updateParticipant).not.toHaveBeenCalled();
  });
});
