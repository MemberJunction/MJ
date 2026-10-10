import type { RealtimeAvatarUnavailableReason } from '@memberjunction/ai';

/**
 * A host's own words for some reasons a call or meeting shows no avatar, such as the product's name for "this app". A
 * reason it leaves out keeps its words from {@link AVATAR_NOTICE_TEXT}. `unknown` words a reason this version doesn't
 * know, such as a newer server's or meeting bot's, in place of {@link AVATAR_NOTICE_CALL_UNKNOWN_REASON_TEXT} in a call
 * and {@link AVATAR_NOTICE_UNKNOWN_REASON_TEXT} in a meeting; it doesn't stand in for a known reason the host leaves out.
 */
export type AvatarNoticeOverrides = Partial<Readonly<Record<RealtimeAvatarUnavailableReason | 'unknown', string>>>;

/** How {@link AvatarNoticeText} words a line. */
export interface AvatarNoticeTextOptions {
  /**
   * Name the agent on every stock line, as a meeting does, where several agents can be audio only: a call's "Audio
   * only:" reads "Audio only for <agent>:". Lines that already name the agent, and a host's own lines, are unchanged.
   * A reason this version doesn't know reads the meeting's line ({@link AVATAR_NOTICE_UNKNOWN_REASON_TEXT}) with it and
   * the call's ({@link AVATAR_NOTICE_CALL_UNKNOWN_REASON_TEXT}) without. Off by default, as in a call.
   */
  NameAgent?: boolean;
}

/** The token a line carries where the agent's name goes (the meeting lines). */
const AGENT_TOKEN = '{Agent}';

/** What stands in for the agent's name when none is given. */
const UNNAMED_AGENT = 'the agent';

/** How a call's line starts. */
const CALL_LEAD = 'Audio only:';

/** How a line that names the agent starts. */
const NAMED_LEAD = `Audio only for ${AGENT_TOKEN}:`;

/**
 * What a call or a meeting says when it shows no avatar its agent asked for, per reason. Each line leads with "Audio
 * only" and names no model or vendor; `{Agent}` stands for the agent's name. A call's lines start "Audio only:", which
 * {@link AvatarNoticeTextOptions.NameAgent} names the agent in. A reason added to the union and left out here fails to
 * compile.
 */
export const AVATAR_NOTICE_TEXT: Readonly<Record<RealtimeAvatarUnavailableReason, string>> = {
  endpoint: "Audio only: this voice model can't show an avatar",
  'no-binding': 'Audio only: this agent has no avatar for this voice model',
  'unknown-avatar': "Audio only: the chosen avatar wasn't found",
  'custom-disabled': "Audio only: custom avatars aren't turned on",
  host: "Audio only: this app can't show the avatar",
  browser: "Audio only: this browser can't play the avatar",
  bridged: `Audio only for ${AGENT_TOKEN}: the avatar can't be shown in this meeting`,
  'decoder-missing': `Audio only for ${AGENT_TOKEN}: the avatar couldn't be shown in this meeting`,
  'decoder-failed': `Audio only for ${AGENT_TOKEN}: the avatar couldn't be shown in this meeting`,
  'publish-failed': `Audio only for ${AGENT_TOKEN}: the avatar couldn't be shown in this meeting`,
};

/**
 * What a meeting says when an agent's bot gives a reason this version doesn't know, such as a newer bot's: the avatar
 * was asked for and can't be shown. A host words it with `unknown` in {@link AvatarNoticeOverrides}.
 */
export const AVATAR_NOTICE_UNKNOWN_REASON_TEXT = `Audio only for ${AGENT_TOKEN}: the avatar couldn't be shown in this meeting`;

/**
 * What a call says when its mint gives a reason this version doesn't know, such as a newer server's: the avatar was
 * asked for and can't be shown. A host words it with `unknown` in {@link AvatarNoticeOverrides}.
 */
export const AVATAR_NOTICE_CALL_UNKNOWN_REASON_TEXT = "Audio only: the avatar can't be shown in this call";

/**
 * The words for one reason: the host's own as written when it gave some (a blank one keeps the stock line, so a notice
 * is never empty), else {@link AVATAR_NOTICE_TEXT}, with `{Agent}` replaced by the agent's name.
 *
 * @param reason Why the call or meeting shows no avatar; `null` for a reason this version doesn't know, which reads the
 *   host's `unknown` line, else {@link AVATAR_NOTICE_CALL_UNKNOWN_REASON_TEXT}, or {@link AVATAR_NOTICE_UNKNOWN_REASON_TEXT}
 *   with `NameAgent`. A reason with no line in {@link AVATAR_NOTICE_TEXT}, such as one from a newer `@memberjunction/ai`,
 *   reads the same way.
 * @param overrides The host's own words for some reasons, and for a reason this version doesn't know (`unknown`).
 * @param agentName The agent's name, for the lines that name it; "the agent" when none is given.
 * @param options How to word the line; a meeting passes `{ NameAgent: true }`.
 * @returns The line to show.
 */
export function AvatarNoticeText(
  reason: RealtimeAvatarUnavailableReason | null,
  overrides?: AvatarNoticeOverrides | null,
  agentName?: string | null,
  options?: AvatarNoticeTextOptions,
): string {
  const name = agentName?.trim() || UNNAMED_AGENT;
  return noticeLine(reason, overrides, options).split(AGENT_TOKEN).join(name);
}

/**
 * The line before the agent's name goes in: the host's own, else the stock line, naming the agent when asked. A reason
 * this version doesn't know takes the host's `unknown` line, else the stock line for it ({@link unknownStockLine}).
 */
function noticeLine(reason: RealtimeAvatarUnavailableReason | null, overrides: AvatarNoticeOverrides | null | undefined, options: AvatarNoticeTextOptions | undefined): string {
  if (reason === null || !hasStockLine(reason)) {
    return hostLine(overrides?.unknown) ?? unknownStockLine(options);
  }
  return hostLine(overrides?.[reason]) ?? stockLine(reason, options);
}

/**
 * The stock line for a reason this version doesn't know: the meeting's with {@link AvatarNoticeTextOptions.NameAgent},
 * else the call's.
 */
function unknownStockLine(options: AvatarNoticeTextOptions | undefined): string {
  return options?.NameAgent ? AVATAR_NOTICE_UNKNOWN_REASON_TEXT : AVATAR_NOTICE_CALL_UNKNOWN_REASON_TEXT;
}

/**
 * Whether {@link AVATAR_NOTICE_TEXT} has a line for a reason. A reason from a newer `@memberjunction/ai`, or text cast to
 * one, may have none; checking own properties keeps names such as `constructor` out.
 */
function hasStockLine(reason: string): boolean {
  return Object.prototype.hasOwnProperty.call(AVATAR_NOTICE_TEXT, reason);
}

/** A host's line as given, or `null` for none or a blank one, which keeps the stock line so a notice is never empty. */
function hostLine(own: string | undefined): string | null {
  return own && own.trim().length > 0 ? own : null;
}

/** A known reason's stock line; with {@link AvatarNoticeTextOptions.NameAgent}, a call's line names the agent. */
function stockLine(reason: RealtimeAvatarUnavailableReason, options: AvatarNoticeTextOptions | undefined): string {
  const stock = AVATAR_NOTICE_TEXT[reason];
  return options?.NameAgent && stock.startsWith(CALL_LEAD) ? NAMED_LEAD + stock.slice(CALL_LEAD.length) : stock;
}
