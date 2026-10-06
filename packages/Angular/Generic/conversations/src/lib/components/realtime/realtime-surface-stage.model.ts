import { PlacementOffStage, ResolveSurfacePlacements, type MediaPlacementMove, type MediaSurface } from '@memberjunction/ai-realtime-client/media';
import type { MediaStagePlacement, MediaStageSurface } from '@memberjunction/ng-realtime-media';
import type { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';
import { RecordSurfaceMove } from './realtime-surface-placement-prefs';

/**
 * Which channel surfaces the call overlay's stage (`mj-media-stage`) holds, and where each one shows.
 *
 * **Placement.** Every surface starts where its channel's registry row places it (`SurfacePlacement`: its tab, unless the
 * row says otherwise). The user moves it to the stage (it fills the call), into a picture-in-picture box, to its tab, or
 * out of sight, within the placements the row allows; the moves are kept in order, one per surface, and resolved by
 * `ResolveSurfacePlacements`, so the most recent move to the stage wins it, the surface it displaces returns to where its
 * channel places it, and picture-in-picture boxes stack newest first. The host saves {@link Moves} and loads them back
 * ({@link LoadMoves}), so a layout carries over to later sessions.
 *
 * **Creation.** A channel's surface is created the first time it is seen (its tab shows it, or it is on the stage or
 * in a picture-in-picture box) and kept until the channel leaves the session. Moving it, hiding the panel or switching tabs only changes where it
 * shows, so a whiteboard keeps its view and a stream keeps playing.
 *
 * Pure state with no Angular: the overlay reports the session's channels, the channel tab the panel is showing and
 * the user's moves, and binds {@link Surfaces} to the stage.
 */
export class RealtimeSurfaceStageModel {
  /** Channels with a surface, by key, in the order their tabs registered. */
  private readonly plugins = new Map<string, BaseRealtimeChannelClient>();
  /** Keys whose surface has been seen, so it stays created. */
  private readonly seen = new Set<string>();
  private moves: MediaPlacementMove[] = [];
  private activeTabKey: string | null = null;
  private placements: ReadonlyMap<string, MediaStagePlacement> = new Map();
  /** Picture-in-picture surfaces, newest first. */
  private pipOrder: readonly string[] = [];
  private surfaces: readonly MediaStageSurface[] = [];
  private allowedPlacements: ReadonlyMap<string, readonly MediaStagePlacement[]> = new Map();

  /** The stage's surfaces. The array is replaced only when a surface or a placement changes, so it binds cheaply. */
  public get Surfaces(): readonly MediaStageSurface[] {
    return this.surfaces;
  }

  /** Where each registered channel's surface is placed, by key. Replaced only when a placement changes. */
  public get Placements(): ReadonlyMap<string, MediaStagePlacement> {
    return this.placements;
  }

  /** Where the user may move each registered channel's surface, by key. Replaced only when the channels change. */
  public get AllowedPlacements(): ReadonlyMap<string, readonly MediaStagePlacement[]> {
    return this.allowedPlacements;
  }

  /** The user's moves, oldest first, one per surface: what the host saves. */
  public get Moves(): readonly MediaPlacementMove[] {
    return this.moves;
  }

  /** The channel whose surface is on the stage, or `null`. */
  public get StageKey(): string | null {
    for (const [key, placement] of this.placements) {
      if (placement === 'stage') {
        return key;
      }
    }
    return null;
  }

  /** The plugin behind a surface, or `null` once its channel has left. */
  public PluginFor(key: string): BaseRealtimeChannelClient | null {
    return this.plugins.get(key) ?? null;
  }

  /** Where the user may move a channel's surface; nowhere for a channel without a surface in this session. */
  public AllowedFor(key: string): readonly MediaStagePlacement[] {
    return this.allowedPlacements.get(key) ?? [];
  }

  /**
   * Where a channel's surface goes when it leaves the stage (the user leaves the focus layout, or the channel lets go of
   * it): where its channel places it, or the first of picture-in-picture, tab and hidden that it allows.
   */
  public OffStagePlacement(key: string): MediaStagePlacement {
    const plugin = this.plugins.get(key);
    return plugin ? PlacementOffStage(surfaceOf(plugin)) : 'tab';
  }

  /** A channel with a surface got its tab. Registering its key again follows the channel's new plugin instance. */
  public Register(plugin: BaseRealtimeChannelClient): void {
    this.plugins.set(plugin.ChannelName, plugin);
    this.updateAllowedPlacements();
    this.update();
  }

  /** The session's channels changed: a surface whose plugin is no longer among them is dropped. Moves are kept. */
  public KeepOnly(channels: readonly BaseRealtimeChannelClient[]): void {
    for (const [key, plugin] of [...this.plugins]) {
      if (!channels.includes(plugin)) {
        this.plugins.delete(key);
        this.seen.delete(key);
      }
    }
    this.updateAllowedPlacements();
    this.update();
  }

  /** The channel whose tab the panel is showing, or `null` when it shows none (another tab, collapsed, hidden). */
  public SetActiveTab(key: string | null): void {
    this.activeTabKey = key;
    this.update();
  }

  /** Starts from saved moves, such as the user's last layout. */
  public LoadMoves(moves: readonly MediaPlacementMove[]): void {
    this.moves = [...moves];
    this.update();
  }

  /**
   * Moves a channel's surface. Returns `false`, changing nothing, for a channel without a surface in this session, a
   * placement its channel does not allow, or the placement it already has.
   */
  public Move(key: string, placement: MediaStagePlacement): boolean {
    if (!this.AllowedFor(key).includes(placement) || this.placements.get(key) === placement) {
      return false;
    }
    this.moves = RecordSurfaceMove(this.moves, { SurfaceKey: key, Placement: placement });
    this.update();
    return true;
  }

  /** Forgets every move: each surface returns to where its channel places it. */
  public ResetLayout(): void {
    this.moves = [];
    this.update();
  }

  private update(): void {
    this.resolvePlacements();
    for (const [key, placement] of this.placements) {
      if (placement === 'stage' || placement === 'pip' || (placement === 'tab' && key === this.activeTabKey)) {
        this.seen.add(key);
      }
    }
    const surfaces = [...this.plugins.keys()].filter((key) => this.seen.has(key)).map((key) => this.surfaceFor(key));
    if (!sameSurfaces(surfaces, this.surfaces)) {
      this.surfaces = surfaces;
    }
  }

  /** Rebuilds {@link AllowedPlacements} from the registered channels, keeping the map when nothing in it changed. */
  private updateAllowedPlacements(): void {
    const allowed = new Map([...this.plugins].map(([key, plugin]) => [key, plugin.SurfacePlacement.Allowed]));
    if (!sameAllowedPlacements(allowed, this.allowedPlacements)) {
      this.allowedPlacements = allowed;
    }
  }

  /** A stage surface for a channel: its placement, its name, and where it stacks when it is picture-in-picture. */
  private surfaceFor(key: string): MediaStageSurface {
    const placement = this.placements.get(key) ?? 'tab';
    const surface: MediaStageSurface = { Key: key, Placement: placement, Label: this.plugins.get(key)?.TabTitle };
    return placement === 'pip' ? { ...surface, PipIndex: this.pipOrder.indexOf(key) } : surface;
  }

  private resolvePlacements(): void {
    const resolved = ResolveSurfacePlacements([...this.plugins.values()].map(surfaceOf), this.moves);
    const placements = new Map<string, MediaStagePlacement>();
    if (resolved.Stage) {
      placements.set(resolved.Stage.Key, 'stage');
    }
    resolved.Pips.forEach((surface) => placements.set(surface.Key, 'pip'));
    resolved.Tabs.forEach((surface) => placements.set(surface.Key, 'tab'));
    resolved.Hidden.forEach((surface) => placements.set(surface.Key, 'hidden'));
    if (!samePlacements(placements, this.placements)) {
      this.placements = placements;
    }
    this.pipOrder = resolved.Pips.map((surface) => surface.Key);
  }
}

/** A channel's surface as the layout model sees it: where its channel places it unless moved, and where it may go. */
function surfaceOf(plugin: BaseRealtimeChannelClient): MediaSurface {
  const { Default, Allowed } = plugin.SurfacePlacement;
  return { Key: plugin.ChannelName, Label: plugin.TabTitle, DefaultPlacement: Default, AllowedPlacements: Allowed };
}

function sameAllowedPlacements(
  a: ReadonlyMap<string, readonly MediaStagePlacement[]>,
  b: ReadonlyMap<string, readonly MediaStagePlacement[]>
): boolean {
  return a.size === b.size && [...a].every(([key, allowed]) => b.get(key) === allowed);
}

function samePlacements(a: ReadonlyMap<string, MediaStagePlacement>, b: ReadonlyMap<string, MediaStagePlacement>): boolean {
  return a.size === b.size && [...a].every(([key, placement]) => b.get(key) === placement);
}

function sameSurfaces(a: readonly MediaStageSurface[], b: readonly MediaStageSurface[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (surface, i) =>
        surface.Key === b[i].Key && surface.Placement === b[i].Placement && surface.Label === b[i].Label && surface.PipIndex === b[i].PipIndex
    )
  );
}
