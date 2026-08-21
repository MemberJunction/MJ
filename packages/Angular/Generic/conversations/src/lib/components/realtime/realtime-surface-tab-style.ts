/**
 * Framework-free helpers for the call overlay's SURFACE-PANEL tab strip styling + gating
 * and the Activity tab's artifact split-pane width preference.
 *
 * Kept free of Angular imports so the per-channel color hash, the whiteboard predicate,
 * the channel-used gate, the show-activity gate, and the split-width parse/clamp rules
 * are unit-testable in isolation (plain-node vitest).
 */

/**
 * Whether a channel name denotes the live WHITEBOARD channel (case-insensitive, trimmed).
 *
 * The whiteboard is the channel MJ tabs up front by DEFAULT — a user can be the first to draw on
 * it, whereas every other channel only earns its tab once the agent actually uses it. That default
 * is a good one, and a deployment that disagrees now says so via `tabUpFrontChannels`
 * ({@link ShouldRegisterChannelTabUpFront}) rather than being stuck with it.
 */
export function IsWhiteboardChannel(channelName: string | null | undefined): boolean {
  return NormalizeChannelName(channelName) === 'whiteboard';
}

/** The comparable form of a channel name — trimmed and lowercased, in exactly one place. */
export function NormalizeChannelName(channelName: string | null | undefined): string {
  return (channelName ?? '').trim().toLowerCase();
}

/**
 * Whether a channel should get its surface tab registered UP FRONT (at the registry-resolved
 * emission) rather than waiting for first use.
 *
 * **A channel already in use always gets its tab**, whatever the deployment configured — a surface
 * the agent is driving with no tab on screen is not a decluttered strip, it is a hidden surface.
 *
 * `tabUpFrontChannels` is the deployment's answer for everything else:
 *
 *  - **omitted / `null`** — MJ's default: the whiteboard tabs up front, nothing else does. This is
 *    exactly the previous behaviour, so no existing deployment changes.
 *  - **an array** — the COMPLETE list of channels that tab up front, replacing the default rather
 *    than adding to it. `[]` therefore means "no surface until something uses it", which is the
 *    voice-first interview case: a session opens on the agent talking, nobody is going to draw
 *    first, and a blank board sitting there makes the product read as a tool with a canvas bolted
 *    on rather than a conversation that can produce one.
 *
 * A design-review session wants the opposite of that interview, and both are legitimate — which is
 * why this is configuration rather than a different hardcoded answer.
 */
export function ShouldRegisterChannelTabUpFront(
  channelName: string,
  hasBeenUsed: boolean,
  tabUpFrontChannels?: readonly string[] | null,
): boolean {
  if (hasBeenUsed) {
    return true;
  }
  if (tabUpFrontChannels === null || tabUpFrontChannels === undefined) {
    return IsWhiteboardChannel(channelName);
  }
  const wanted = NormalizeChannelName(channelName);
  return wanted.length > 0 && tabUpFrontChannels.some((name) => NormalizeChannelName(name) === wanted);
}

/**
 * Whether the Activity tab should be shown yet. Gated on ≥1 underlying agent run having
 * occurred this session (`agentRunCount`) — the Activity surface is for async delegation,
 * so it stays hidden until there's at least one delegated run to show. Review mode always
 * shows it (a past session's activity is always relevant), regardless of the live count.
 */
export function ShouldShowActivityTab(agentRunCount: number, isReviewing: boolean): boolean {
  return isReviewing || agentRunCount > 0;
}

/**
 * A stable, deterministic accent color for a channel tab derived from its `ChannelName`,
 * as an `hsl()` string. Categorical channel colors are explicitly allowed to use `hsl()`
 * per the design-token rules. A channel may override this by supplying its own `TabColor`.
 *
 * The hue is an FNV-1a-style hash of the (lowercased, trimmed) name spread across the wheel;
 * saturation/lightness are fixed so every channel reads as a confident, legible accent that
 * works on both light and dark surfaces. Deterministic: the same name always yields the same
 * hue, so a channel keeps its color across sessions and re-registrations.
 */
export function ChannelTabColor(channelName: string): string {
  const hue = ChannelTabHue(channelName);
  return `hsl(${hue}, 62%, 52%)`;
}

/** The deterministic hue (0–359) a channel name hashes to — split out for testability. */
export function ChannelTabHue(channelName: string): number {
  const key = (channelName ?? '').trim().toLowerCase();
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    // FNV prime multiply, kept in 32-bit range via Math.imul.
    hash = Math.imul(hash, 0x01000193);
  }
  // >>> 0 normalizes to an unsigned 32-bit int before the modulo.
  return (hash >>> 0) % 360;
}

// ── Activity tab artifact split-pane width preference ──────────────────────────

/** `MJ: User Settings` key for the Activity-tab artifact split width (versioned shape). */
export const ACTIVITY_SPLIT_PREF_KEY = 'mj.realtime.activitySplit.v1';

/** Default right-pane (artifact viewer) width as a percentage of the Activity pane. */
export const ACTIVITY_SPLIT_DEFAULT_PERCENT = 45;

/** Narrowest the artifact (right) pane may be dragged, as a percentage. */
export const ACTIVITY_SPLIT_MIN_PERCENT = 25;

/** Widest the artifact (right) pane may be dragged, as a percentage. */
export const ACTIVITY_SPLIT_MAX_PERCENT = 75;

/**
 * Clamps a candidate right-pane width percentage into
 * `[{@link ACTIVITY_SPLIT_MIN_PERCENT}, {@link ACTIVITY_SPLIT_MAX_PERCENT}]`. Non-finite
 * inputs resolve to the default so a garbage value can never break the layout.
 */
export function ClampActivitySplitPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return ACTIVITY_SPLIT_DEFAULT_PERCENT;
  }
  return Math.min(Math.max(percent, ACTIVITY_SPLIT_MIN_PERCENT), ACTIVITY_SPLIT_MAX_PERCENT);
}

/**
 * Parses the raw persisted Activity-split preference into a clamped right-pane percentage,
 * or `null` when there is no usable preference (missing / blank / malformed JSON, non-object
 * payload, non-finite/non-positive width). Never throws — callers fall back to the default.
 */
export function ParseActivitySplitPercent(raw: string | null | undefined): number | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') {
      return null;
    }
    const percent = (parsed as { percent?: unknown }).percent;
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0) {
      return null;
    }
    return ClampActivitySplitPercent(percent);
  } catch {
    return null;
  }
}

/** Serializes the right-pane width percentage for persistence (`{ "percent": number }`). */
export function SerializeActivitySplitPercent(percent: number): string {
  return JSON.stringify({ percent: ClampActivitySplitPercent(percent) });
}
