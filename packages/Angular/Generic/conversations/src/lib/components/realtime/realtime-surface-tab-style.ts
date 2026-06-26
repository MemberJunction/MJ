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
 * The whiteboard is the ONE channel whose surface tab appears immediately at session start
 * — a user can be the first to draw on it, whereas every other channel only earns its tab
 * once the agent actually USES it. Detection is by name (the registry `Name` / plugin
 * `ChannelName`) rather than a flag so a deployment can't accidentally opt a non-board
 * channel into the immediate-tab behavior.
 */
export function IsWhiteboardChannel(channelName: string | null | undefined): boolean {
  return (channelName ?? '').trim().toLowerCase() === 'whiteboard';
}

/**
 * Whether a channel should get its surface tab registered UP FRONT (at the
 * registry-resolved emission) rather than waiting for first use.
 *
 * True only for the whiteboard (see {@link IsWhiteboardChannel}) OR a channel the agent has
 * already used this session (`hasBeenUsed`). Every other channel stays tab-less until its
 * first activity registers it — keeping the strip decluttered to the surfaces actually in play.
 */
export function ShouldRegisterChannelTabUpFront(channelName: string, hasBeenUsed: boolean): boolean {
  return IsWhiteboardChannel(channelName) || hasBeenUsed;
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
