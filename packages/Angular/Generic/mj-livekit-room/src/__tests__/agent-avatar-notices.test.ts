import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveKitAvatarAudioOnly, LiveKitParticipantView, LiveKitRoomState } from '@memberjunction/livekit-room-core';
import { AGENT_AVATAR_NOTICE_HIDE_MS, AgentAvatarNotices } from '../lib/agent-avatar-notices';

/** A remote participant: an agent unless `Person`, audio only when `AudioOnly` is given. */
function remote(identity: string, over: { AudioOnly?: LiveKitAvatarAudioOnly; Person?: boolean; Name?: string } = {}): LiveKitParticipantView {
  return {
    Identity: identity,
    DisplayName: over.Name ?? identity,
    IsLocal: false,
    Role: over.Person ? 'participant' : 'agent',
    IsSpeaking: false,
    AudioLevel: 0,
    HasAudio: true,
    HasVideo: false,
    IsScreenSharing: false,
    ConnectionQuality: 'good',
    ...(over.AudioOnly ? { AvatarAudioOnly: over.AudioOnly } : {}),
    Raw: {},
  } as unknown as LiveKitParticipantView;
}

function room(people: LiveKitParticipantView[]): LiveKitRoomState {
  return {
    Status: 'connected',
    Remote: people,
    ActiveSpeakerIdentities: [],
    LocalMedia: { MicrophoneEnabled: true, CameraEnabled: false, ScreenShareEnabled: false },
    AudioPlaybackBlocked: false,
    NoiseFilterEnabled: false,
    BackgroundEffect: { Kind: 'none' },
    E2EEEnabled: false,
  };
}

describe('AgentAvatarNotices', () => {
  let changes: number;
  let notices: AgentAvatarNotices;
  const identities = () => notices.Visible.map((n) => n.Identity);

  beforeEach(() => {
    vi.useFakeTimers();
    changes = 0;
    notices = new AgentAvatarNotices(() => changes++);
  });
  afterEach(() => {
    notices.Dispose();
    vi.useRealTimers();
  });

  it('shows a notice for an agent whose bot says audio only, named and with its reason', () => {
    notices.Update(room([remote('sage', { AudioOnly: { Reason: 'bridged' }, Name: 'Sage' })]));
    expect(notices.Visible).toEqual([{ Identity: 'sage', AgentName: 'Sage', Reason: 'bridged' }]);
    expect(changes).toBe(1);
  });

  it('carries no reason when the bot gave none the room knows', () => {
    notices.Update(room([remote('sage', { AudioOnly: {}, Name: 'Sage' })]));
    expect(notices.Visible).toEqual([{ Identity: 'sage', AgentName: 'Sage' }]);
  });

  it('shows none for an agent whose avatar shows, for a person, or for an empty room', () => {
    notices.Update(room([remote('sage'), remote('ada', { Person: true, AudioOnly: { Reason: 'bridged' } })]));
    notices.Update(room([]));
    expect(notices.Visible).toEqual([]);
    expect(changes).toBe(0);
  });

  it('shows one notice per agent, in the order they became audio only', () => {
    notices.Update(room([remote('sage', { AudioOnly: {} })]));
    notices.Update(room([remote('sage', { AudioOnly: {} }), remote('rowan', { AudioOnly: { Reason: 'bridged' } })]));
    expect(identities()).toEqual(['sage', 'rowan']);
  });

  it('shows it once per join: not again on later states, while it shows or after it hides', () => {
    const state = room([remote('sage', { AudioOnly: {} })]);
    notices.Update(state);
    notices.Update(room([remote('sage', { AudioOnly: { Reason: 'bridged' } })]));
    expect(identities()).toEqual(['sage']);
    expect(changes).toBe(1);
    notices.Dismiss('sage');
    notices.Update(state);
    expect(notices.Visible).toEqual([]);
  });

  it('hides a notice after the hide time, each on its own clock', () => {
    notices.Update(room([remote('sage', { AudioOnly: {} })]));
    vi.advanceTimersByTime(AGENT_AVATAR_NOTICE_HIDE_MS / 2);
    notices.Update(room([remote('sage', { AudioOnly: {} }), remote('rowan', { AudioOnly: {} })]));
    vi.advanceTimersByTime(AGENT_AVATAR_NOTICE_HIDE_MS / 2 - 1);
    expect(identities()).toEqual(['sage', 'rowan']);
    vi.advanceTimersByTime(1);
    expect(identities()).toEqual(['rowan']);
    vi.advanceTimersByTime(AGENT_AVATAR_NOTICE_HIDE_MS / 2);
    expect(notices.Visible).toEqual([]);
    expect(changes).toBe(4);
  });

  it('hides a dismissed notice at once and stops its clock', () => {
    notices.Update(room([remote('sage', { AudioOnly: {} })]));
    notices.Dismiss('sage');
    expect(notices.Visible).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    notices.Dismiss('sage');
    expect(changes).toBe(2);
  });

  it('drops the notice of an agent who leaves, and does not show it again if they come back in the same join', () => {
    notices.Update(room([remote('sage', { AudioOnly: {} })]));
    notices.Update(room([]));
    expect(notices.Visible).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    notices.Update(room([remote('sage', { AudioOnly: {} })]));
    expect(notices.Visible).toEqual([]);
  });

  it('starts a new join on Reset: nothing shows, and each agent can have its notice again', () => {
    const state = room([remote('sage', { AudioOnly: {} })]);
    notices.Update(state);
    notices.Reset();
    expect(notices.Visible).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    notices.Update(state);
    expect(identities()).toEqual(['sage']);
  });

  it('stops every clock on Dispose', () => {
    notices.Update(room([remote('sage', { AudioOnly: {} }), remote('rowan', { AudioOnly: {} })]));
    notices.Dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
