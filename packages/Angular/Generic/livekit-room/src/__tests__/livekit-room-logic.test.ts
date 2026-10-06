import { describe, it, expect } from 'vitest';
import type { LiveKitParticipantView, LiveKitRoomState } from '@memberjunction/livekit-room-core';
import {
  DeriveAgentState,
  IsAgentVisualState,
  SelectAllParticipants,
  SelectDisplayParticipants,
  SelectFilmstrip,
  SelectScreenShare,
  SelectSpotlight,
  SelectSplitSpeaker,
} from '../lib/livekit-room-logic';

/** Builds a minimal participant view for logic tests (Raw is irrelevant to selection logic). */
function view(identity: string, overrides: Partial<LiveKitParticipantView> = {}): LiveKitParticipantView {
  return {
    Identity: identity,
    DisplayName: identity,
    IsLocal: false,
    Role: 'participant',
    IsSpeaking: false,
    AudioLevel: 0,
    HasAudio: true,
    HasVideo: false,
    IsScreenSharing: false,
    ConnectionQuality: 'good',
    // Empty double — tests never touch Raw; derive the type from the view so it
    // tracks the real field.
    Raw: {} as LiveKitParticipantView['Raw'],
    ...overrides,
  };
}

function state(overrides: Partial<LiveKitRoomState> = {}): LiveKitRoomState {
  return {
    Status: 'connected',
    Remote: [],
    ActiveSpeakerIdentities: [],
    LocalMedia: { MicrophoneEnabled: true, CameraEnabled: false, ScreenShareEnabled: false },
    AudioPlaybackBlocked: false,
    NoiseFilterEnabled: false,
    BackgroundEffect: { Kind: 'none' },
    E2EEEnabled: false,
    ...overrides,
  };
}

describe('selectDisplayParticipants', () => {
  it('includes local first when ShowSelfView is true', () => {
    const s = state({ Local: view('me', { IsLocal: true }), Remote: [view('r1')] });
    const list = SelectDisplayParticipants(s, true);
    expect(list.map((p) => p.Identity)).toEqual(['me', 'r1']);
  });
  it('excludes local when ShowSelfView is false', () => {
    const s = state({ Local: view('me', { IsLocal: true }), Remote: [view('r1')] });
    expect(SelectDisplayParticipants(s, false).map((p) => p.Identity)).toEqual(['r1']);
  });
});

describe('selectAllParticipants', () => {
  it('returns local + remote, local first', () => {
    const s = state({ Local: view('me', { IsLocal: true }), Remote: [view('a'), view('b')] });
    expect(SelectAllParticipants(s).map((p) => p.Identity)).toEqual(['me', 'a', 'b']);
  });
  it('returns just remote when no local', () => {
    const s = state({ Remote: [view('a')] });
    expect(SelectAllParticipants(s).map((p) => p.Identity)).toEqual(['a']);
  });
});

describe('selectSpotlight', () => {
  it('prefers a pinned participant when pinning is enabled', () => {
    const s = state({ Local: view('me', { IsLocal: true }), Remote: [view('a'), view('b')] });
    expect(SelectSpotlight(s, 'b', true)?.Identity).toBe('b');
  });
  it('ignores the pin when pinning is disabled', () => {
    const s = state({ Remote: [view('a', { Role: 'agent' }), view('b')] });
    expect(SelectSpotlight(s, 'b', false)?.Identity).toBe('a'); // falls to agent
  });
  it('falls back to the active remote speaker (not local)', () => {
    const s = state({
      Local: view('me', { IsLocal: true }),
      Remote: [view('a'), view('b')],
      ActiveSpeakerIdentities: ['me', 'b'],
    });
    expect(SelectSpotlight(s, null, true)?.Identity).toBe('b');
  });
  it('falls back to the agent, then first remote, then local', () => {
    expect(SelectSpotlight(state({ Remote: [view('a'), view('bot', { Role: 'agent' })] }), null, true)?.Identity).toBe('bot');
    expect(SelectSpotlight(state({ Remote: [view('a')] }), null, true)?.Identity).toBe('a');
    expect(SelectSpotlight(state({ Local: view('me', { IsLocal: true }) }), null, true)?.Identity).toBe('me');
    expect(SelectSpotlight(state(), null, true)).toBeNull();
  });
  it('features a SPEAKING agent via IsSpeaking even when ActiveSpeakerIdentities omits it (server-published agent)', () => {
    const s = state({
      Local: view('me', { IsLocal: true }),
      Remote: [view('human'), view('bot', { Role: 'agent', IsSpeaking: true })],
      ActiveSpeakerIdentities: [], // native dominant-speaker list misses the server-published agent
    });
    // Without the IsSpeaking fallback this would pick 'human' (first remote); with it, the speaking bot wins.
    expect(SelectSpotlight(s, null, true)?.Identity).toBe('bot');
  });
});

describe('selectFilmstrip', () => {
  it('excludes the spotlighted participant', () => {
    const display = [view('a'), view('b'), view('c')];
    expect(SelectFilmstrip(display, view('b')).map((p) => p.Identity)).toEqual(['a', 'c']);
  });
});

describe('selectScreenShare', () => {
  it('returns the first screen-sharing participant', () => {
    const all = [view('a'), view('b', { IsScreenSharing: true }), view('c', { IsScreenSharing: true })];
    expect(SelectScreenShare(all)?.Identity).toBe('b');
  });
  it('returns null when nobody is sharing', () => {
    expect(SelectScreenShare([view('a')])).toBeNull();
  });
});

describe('selectSplitSpeaker', () => {
  it('picks the active speaker that is not the screen-sharer', () => {
    const s = state({
      Remote: [view('sharer', { IsScreenSharing: true }), view('talker')],
      ActiveSpeakerIdentities: ['sharer', 'talker'],
    });
    expect(SelectSplitSpeaker(s)?.Identity).toBe('talker');
  });
  it('falls back to the agent when no distinct speaker', () => {
    const s = state({ Remote: [view('sharer', { IsScreenSharing: true }), view('bot', { Role: 'agent' })] });
    expect(SelectSplitSpeaker(s)?.Identity).toBe('bot');
  });
});

describe('deriveAgentState', () => {
  it('uses an explicit signal when present', () => {
    expect(DeriveAgentState(state(), 'thinking')).toBe('thinking');
  });
  it('reports speaking when the agent is speaking', () => {
    expect(DeriveAgentState(state({ Remote: [view('bot', { Role: 'agent', IsSpeaking: true })] }), null)).toBe('speaking');
  });
  it('reports listening when the local user is speaking', () => {
    expect(DeriveAgentState(state({ Local: view('me', { IsLocal: true, IsSpeaking: true }) }), null)).toBe('listening');
  });
  it('reports idle otherwise', () => {
    expect(DeriveAgentState(state({ Remote: [view('bot', { Role: 'agent' })] }), null)).toBe('idle');
  });
});

describe('isAgentVisualState', () => {
  it('accepts valid states', () => {
    expect(IsAgentVisualState('idle')).toBe(true);
    expect(IsAgentVisualState('speaking')).toBe(true);
  });
  it('rejects junk', () => {
    expect(IsAgentVisualState('banana')).toBe(false);
    expect(IsAgentVisualState('')).toBe(false);
  });
});
