// The channel imports its standalone Angular surface component (partial-compiled Angular libs require the JIT compiler in
// this node test environment), so load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { MJGlobal } from '@memberjunction/global';
import type { IMetadataProvider } from '@memberjunction/core';
import type { MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import { BaseRealtimeChannelClient, BuildChannelCatalogNote, type RealtimeChannelContext } from '@memberjunction/realtime-runtime';
import {
  LoadRealtimeAvatarChannel,
  REALTIME_AVATAR_CHANNEL_CLASS,
  RealtimeAvatarChannel,
} from '../lib/components/realtime/avatar/realtime-avatar-channel';
import type { RealtimeAvatarSurfaceComponent } from '../lib/components/realtime/avatar/realtime-avatar-surface.component';

LoadRealtimeAvatarChannel();

/** A session as the channel sees it, with the agent's video. */
function context(video$: BehaviorSubject<MediaVideoSource | null>): RealtimeChannelContext {
  return {
    AgentName: 'Sage',
    Provider: {} as unknown as IMetadataProvider,
    SendContextNote: vi.fn(),
    RequestSave: vi.fn(),
    SetFocusMode: vi.fn(),
    SaveAsArtifact: async () => null,
    AgentSessionID: 'session-1',
    ExecuteServerAction: async () => null,
    AgentVideo$: video$.asObservable(),
  };
}

describe('the Avatar channel', () => {
  it('is resolvable from the ClassFactory by its registry key, and has a surface', () => {
    const channel = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(BaseRealtimeChannelClient, REALTIME_AVATAR_CHANNEL_CLASS);
    expect(channel).toBeInstanceOf(RealtimeAvatarChannel);
    expect([channel?.ChannelName, channel?.TabTitle, channel?.HasSurface()]).toEqual(['Avatar', 'Avatar', true]);
  });

  it('is in every call from the start, and gives the agent nothing: no verbs, nouns, inputs, tools or instructions', () => {
    const channel = new RealtimeAvatarChannel();
    expect(channel.GetDescriptor()).toEqual({
      Key: 'Avatar',
      Version: expect.any(String),
      DisplayName: 'Avatar',
      OwningPackage: '@memberjunction/ng-conversations',
      Instructions: '',
      Nouns: [],
      Verbs: [],
      DisplayPolicy: 'open-on-start',
      DefaultAvailability: 'all-sessions',
      MaxExposure: 'none',
    });
    expect(channel.GetToolDefinitions()).toEqual([]);
    expect(channel.ToolNamePrefix).toBe('');
  });

  it("is left out of the agent's channel note", () => {
    const descriptor = new RealtimeAvatarChannel().GetDescriptor();
    expect(BuildChannelCatalogNote([{ Descriptor: descriptor, IsOpen: true, HasNativeTools: false }])).toBeNull();
  });

  it("sinks the agent's video and sources nothing", () => {
    const channel = new RealtimeAvatarChannel();
    expect(channel.GetSunkTracks()).toEqual([{ Modality: 'video', Direction: 'outbound' }]);
    expect(channel.GetSourcedTracks()).toEqual([]);
  });

  it("gives its surface the agent's name and video", () => {
    const video$ = new BehaviorSubject<MediaVideoSource | null>(null);
    const channel = new RealtimeAvatarChannel();
    channel.Initialize(context(video$));
    const surface = { AgentName: '', Video$: null } as unknown as RealtimeAvatarSurfaceComponent;
    channel.BindSurface(surface);
    expect(surface.AgentName).toBe('Sage');
    const seen: Array<MediaVideoSource | null> = [];
    surface.Video$?.subscribe((v) => seen.push(v));
    const player: MediaVideoSource = { Kind: 'element', Attach: () => () => undefined };
    video$.next(player);
    expect(seen).toEqual([null, player]);
  });

  it('binds no video on a host that has none to give', () => {
    const channel = new RealtimeAvatarChannel();
    const ctx = context(new BehaviorSubject<MediaVideoSource | null>(null));
    delete ctx.AgentVideo$;
    channel.Initialize(ctx);
    const surface = { AgentName: '', Video$: undefined } as unknown as RealtimeAvatarSurfaceComponent;
    channel.BindSurface(surface);
    expect(surface.Video$).toBeNull();
  });
});
