import type { MJAIAgentChannelEntity_IChannelUIConfig } from '@memberjunction/core-entities';
import { MEDIA_PLACEMENTS, type MediaPlacement } from '@memberjunction/ai-realtime-client';

/**
 * Where a channel's surface shows when a call starts, and where the user may move it. It comes from the channel's
 * registry row (`MJ: AI Agent Channels.UIConfig`: `Placement` and `AllowedPlacements`, read by
 * {@link ReadChannelSurfacePlacement}); the host's surface layout starts each surface at {@link Default} and keeps the
 * user's moves within {@link Allowed}.
 */
export interface ChannelSurfacePlacement {
  /** Where the surface first shows. Always one of {@link Allowed}. */
  Default: MediaPlacement;
  /** Where the user may move it: at least one placement. */
  Allowed: readonly MediaPlacement[];
}

/** On its tab and movable anywhere: a channel whose registry row says nothing about placement, or that has no row. */
export const DEFAULT_CHANNEL_SURFACE_PLACEMENT: ChannelSurfacePlacement = Object.freeze({ Default: 'tab', Allowed: MEDIA_PLACEMENTS });

/**
 * Reads a channel's placement from its registry row. The row is edited by hand, so anything that is not a placement is
 * ignored: no `Placement` means the tab, no usable `AllowedPlacements` means anywhere, and a `Placement` the list does not
 * allow gives way to the first placement it lists.
 *
 * @param config The row's parsed `UIConfig` (`UIConfigObject`), or `null` when it has none.
 */
export function ReadChannelSurfacePlacement(config: MJAIAgentChannelEntity_IChannelUIConfig | null | undefined): ChannelSurfacePlacement {
  const allowed = readAllowedPlacements(config?.AllowedPlacements);
  const placement = config?.Placement;
  const wanted = isPlacement(placement) ? placement : DEFAULT_CHANNEL_SURFACE_PLACEMENT.Default;
  return { Default: allowed.includes(wanted) ? wanted : allowed[0], Allowed: allowed };
}

/** The placements a row allows, in its order and without repeats; every placement when it lists none. */
function readAllowedPlacements(raw: MJAIAgentChannelEntity_IChannelUIConfig['AllowedPlacements']): readonly MediaPlacement[] {
  if (!Array.isArray(raw)) {
    return MEDIA_PLACEMENTS;
  }
  const allowed = [...new Set(raw.filter(isPlacement))];
  return allowed.length > 0 ? allowed : MEDIA_PLACEMENTS;
}

/** Whether a value read from the row is a placement. */
function isPlacement(value: unknown): value is MediaPlacement {
  return typeof value === 'string' && (MEDIA_PLACEMENTS as readonly string[]).includes(value);
}
