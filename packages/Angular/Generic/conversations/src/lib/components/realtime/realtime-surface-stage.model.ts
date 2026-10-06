import type { MediaStageSurface } from '@memberjunction/ng-realtime-media';
import type { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';

/**
 * Which channel surfaces the call overlay's stage (`mj-media-stage`) holds, and where each one shows.
 *
 * A channel's surface is created the first time it is seen (its tab shows it, or its channel takes focus) and kept
 * until the channel leaves the session. Hiding or collapsing the panel, switching tabs and entering or leaving focus
 * only move it, so a whiteboard keeps its view and a stream keeps playing.
 *
 * Pure state with no Angular: the overlay reports the session's channels, the channel tab the panel is showing and
 * the focus, and binds {@link Surfaces} to the stage.
 */
export class RealtimeSurfaceStageModel {
  /** Channels with a surface, by key, in the order their tabs registered. */
  private readonly plugins = new Map<string, BaseRealtimeChannelClient>();
  /** Keys whose surface has been seen, so it stays created. */
  private readonly seen = new Set<string>();
  private focusKey: string | null = null;
  private activeTabKey: string | null = null;
  private surfaces: readonly MediaStageSurface[] = [];

  /** The stage's surfaces. The array is replaced only when a surface or a placement changes, so it binds cheaply. */
  public get Surfaces(): readonly MediaStageSurface[] {
    return this.surfaces;
  }

  /** The plugin behind a surface, or `null` once its channel has left. */
  public PluginFor(key: string): BaseRealtimeChannelClient | null {
    return this.plugins.get(key) ?? null;
  }

  /** A channel with a surface got its tab. Registering its key again follows the channel's new plugin instance. */
  public Register(plugin: BaseRealtimeChannelClient): void {
    this.plugins.set(plugin.ChannelName, plugin);
    this.update();
  }

  /** The session's channels changed: a surface whose plugin is no longer among them is dropped. */
  public KeepOnly(channels: readonly BaseRealtimeChannelClient[]): void {
    for (const [key, plugin] of [...this.plugins]) {
      if (!channels.includes(plugin)) {
        this.plugins.delete(key);
        this.seen.delete(key);
      }
    }
    this.update();
  }

  /** The channel whose surface fills the stage (focus mode), or `null` to send it back to its tab. */
  public SetFocus(key: string | null): void {
    this.focusKey = key;
    this.update();
  }

  /** The channel whose tab the panel is showing, or `null` when it shows none (another tab, collapsed, hidden). */
  public SetActiveTab(key: string | null): void {
    this.activeTabKey = key;
    this.update();
  }

  private update(): void {
    for (const key of [this.focusKey, this.activeTabKey]) {
      if (key !== null && this.plugins.has(key)) {
        this.seen.add(key);
      }
    }
    const next = [...this.plugins.keys()]
      .filter((key) => this.seen.has(key))
      .map((key): MediaStageSurface => ({ Key: key, Placement: key === this.focusKey ? 'stage' : 'tab' }));
    if (!sameSurfaces(next, this.surfaces)) {
      this.surfaces = next;
    }
  }
}

function sameSurfaces(a: readonly MediaStageSurface[], b: readonly MediaStageSurface[]): boolean {
  return a.length === b.length && a.every((surface, i) => surface.Key === b[i].Key && surface.Placement === b[i].Placement);
}
