import { describe, it, expect } from 'vitest';
import { REALTIME_AGENT_AVATAR_ATTRIBUTE, REALTIME_AGENT_AVATAR_TRACK_NAME, REALTIME_AGENT_WATCHES_ATTRIBUTE } from '@memberjunction/ai';
import { IsAgentAvatarTrack, ReadAvatarAudioOnly } from '../agent-avatar';

/** An agent's bot's attributes with the avatar attribute set to a value. */
const avatar = (value: string) => ({ [REALTIME_AGENT_AVATAR_ATTRIBUTE]: value });

describe('ReadAvatarAudioOnly', () => {
  it('reads the reason the bot gives when the meeting cannot show the avatar', () => {
    expect(ReadAvatarAudioOnly(avatar('audio-only:bridged'))).toEqual({ Reason: 'bridged' });
    expect(ReadAvatarAudioOnly(avatar('audio-only:endpoint'))).toEqual({ Reason: 'endpoint' });
    expect(ReadAvatarAudioOnly(avatar('audio-only:no-binding'))).toEqual({ Reason: 'no-binding' });
    expect(ReadAvatarAudioOnly(avatar('audio-only:decoder-missing'))).toEqual({ Reason: 'decoder-missing' });
    expect(ReadAvatarAudioOnly(avatar('audio-only:decoder-failed'))).toEqual({ Reason: 'decoder-failed' });
    expect(ReadAvatarAudioOnly(avatar('audio-only:publish-failed'))).toEqual({ Reason: 'publish-failed' });
  });

  it('still reads audio only, without a reason, for a reason the room does not know or none at all', () => {
    expect(ReadAvatarAudioOnly(avatar('audio-only:some-newer-reason'))).toEqual({});
    expect(ReadAvatarAudioOnly(avatar('audio-only:'))).toEqual({});
  });

  it('never takes an object property name for a reason', () => {
    expect(ReadAvatarAudioOnly(avatar('audio-only:constructor'))).toEqual({});
    expect(ReadAvatarAudioOnly(avatar('audio-only:toString'))).toEqual({});
    expect(ReadAvatarAudioOnly(avatar('audio-only:__proto__'))).toEqual({});
  });

  it('says nothing while the avatar shows, when the agent asked for none, or for a value the bot does not write', () => {
    for (const value of ['on', '', 'off', 'true', 'audio-only', 'AUDIO-ONLY:bridged', 'audio-onlybridged', ' audio-only:bridged']) {
      expect(ReadAvatarAudioOnly(avatar(value))).toBeUndefined();
    }
    expect(ReadAvatarAudioOnly({})).toBeUndefined();
    expect(ReadAvatarAudioOnly(undefined)).toBeUndefined();
    expect(ReadAvatarAudioOnly(null)).toBeUndefined();
  });

  it("reads only the avatar attribute, not the bot's others", () => {
    expect(ReadAvatarAudioOnly({ [REALTIME_AGENT_WATCHES_ATTRIBUTE]: 'audio-only:bridged' })).toBeUndefined();
  });
});

describe('IsAgentAvatarTrack', () => {
  it("is an agent's camera track published under the avatar's name", () => {
    expect(IsAgentAvatarTrack('agent', REALTIME_AGENT_AVATAR_TRACK_NAME)).toBe(true);
  });

  it("is not a person's track by that name, nor an agent's track by another", () => {
    expect(IsAgentAvatarTrack('participant', REALTIME_AGENT_AVATAR_TRACK_NAME)).toBe(false);
    expect(IsAgentAvatarTrack('host', REALTIME_AGENT_AVATAR_TRACK_NAME)).toBe(false);
    expect(IsAgentAvatarTrack('agent', 'camera')).toBe(false);
    expect(IsAgentAvatarTrack('agent', undefined)).toBe(false);
  });
});
