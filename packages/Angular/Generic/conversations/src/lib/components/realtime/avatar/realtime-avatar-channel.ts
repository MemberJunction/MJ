import type { Type } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import type { RealtimeTrackDescriptor } from '@memberjunction/ai';
import { REALTIME_CHANNEL_CONTRACT_VERSION, type RealtimeChannelDescriptor } from '@memberjunction/ai-core-plus';
import { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';
import { RealtimeAvatarSurfaceComponent } from './realtime-avatar-surface.component';

/** The registry keys (`MJ: AI Agent Channels` → `Name` and `ClientPluginClass`) of the Avatar channel. */
export const REALTIME_AVATAR_CHANNEL_NAME = 'Avatar';
export const REALTIME_AVATAR_CHANNEL_CLASS = 'RealtimeAvatarChannel';

/** What the Avatar channel sinks: the agent's video, in whatever encoding the model sends. */
const AGENT_VIDEO_TRACK: RealtimeTrackDescriptor = { Modality: 'video', Direction: 'outbound' };

/**
 * The AVATAR channel: the agent's video, when the model sends it (an avatar).
 *
 * **In every call, inert without video.** It is open from the start of every call (`all-sessions`, `open-on-start`) and
 * gives the agent nothing: no verbs, no nouns and no instructions, so the agent's channel note leaves it out, and it
 * shows the agent nothing (`MaxExposure: 'none'`). It sinks outbound video, so the session requests the agent's video
 * when it connects; a model that sends none reports that track unsupported, and the channel stays out of sight. When the
 * video arrives, the runtime marks the channel as used, so the host shows its surface where its registry row places it.
 *
 * Its server half is the generic `ClientOnlyChannelServer`.
 */
@RegisterClass(BaseRealtimeChannelClient, REALTIME_AVATAR_CHANNEL_CLASS)
export class RealtimeAvatarChannel extends BaseRealtimeChannelClient<RealtimeAvatarSurfaceComponent> {
  public get ChannelName(): string {
    return REALTIME_AVATAR_CHANNEL_NAME;
  }

  public override get TabTitle(): string {
    return 'Avatar';
  }

  public override get TabIcon(): string {
    return 'fa-solid fa-circle-user';
  }

  public override GetDescriptor(): RealtimeChannelDescriptor {
    return {
      Key: REALTIME_AVATAR_CHANNEL_NAME,
      Version: REALTIME_CHANNEL_CONTRACT_VERSION,
      DisplayName: 'Avatar',
      OwningPackage: '@memberjunction/ng-conversations',
      Instructions: '',
      Nouns: [],
      Verbs: [],
      DisplayPolicy: 'open-on-start',
      DefaultAvailability: 'all-sessions',
      MaxExposure: 'none',
    };
  }

  public override GetSunkTracks(): readonly RealtimeTrackDescriptor[] {
    return [AGENT_VIDEO_TRACK];
  }

  public override GetSurfaceComponent(): Type<RealtimeAvatarSurfaceComponent> {
    return RealtimeAvatarSurfaceComponent;
  }

  public override BindSurface(instance: RealtimeAvatarSurfaceComponent): void {
    instance.AgentName = this.Context?.AgentName ?? 'The assistant';
    instance.Video$ = this.Context?.AgentVideo$ ?? null;
  }
}

/**
 * Tree-shaking prevention: the channel is resolved through the ClassFactory by its registry row's `ClientPluginClass`
 * key, so this static call keeps its `@RegisterClass` side effect alive.
 */
export function LoadRealtimeAvatarChannel(): void {
  // intentional no-op: the import side effect performs the registration
}
