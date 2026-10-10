/**
 * The `MJ: User Settings` keys under which the call overlay saves the user's layout of its channel surfaces, per user via
 * `UserInfoEngine`. The saved forms, and how they are read back, are the shared ones in
 * `@memberjunction/ai-realtime-client/media`, which the meeting room uses too:
 * - {@link SURFACE_PLACEMENT_PREF_KEY}: where the user moved each channel's surface (the stage, a picture-in-picture
 *   box, its tab, hidden), as `SerializePlacementMoves` writes the moves: oldest first, one per surface, so the most
 *   recent move to the stage wins it in every later session too.
 * - {@link SURFACE_PIP_PREF_KEY}: where the user put each picture-in-picture box, as `SerializePipRects` writes them.
 */

/** `MJ: User Settings` key for the surface placement preference (versioned shape). */
export const SURFACE_PLACEMENT_PREF_KEY = 'mj.realtime.placement.v1';

/** `MJ: User Settings` key for picture-in-picture boxes: `{ [channelKey]: { X, Y, W, H } }`, fractions of the stage. */
export const SURFACE_PIP_PREF_KEY = 'mj.realtime.pip.v1';
