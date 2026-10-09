import type { RealtimeAvatarUnavailableReason } from '@memberjunction/ai';

/**
 * A host's own words for some reasons a call or meeting shows no avatar, such as the product's name for "this app". A
 * reason it leaves out keeps its words from {@link AVATAR_NOTICE_TEXT}.
 */
export type AvatarNoticeOverrides = Partial<Readonly<Record<RealtimeAvatarUnavailableReason, string>>>;

/** The token a line carries where the agent's name goes (the meeting lines). */
const AGENT_TOKEN = '{Agent}';

/** What stands in for the agent's name when none is given. */
const UNNAMED_AGENT = 'the agent';

/**
 * What a call or a meeting says when it shows no avatar its agent asked for, per reason. Each line leads with "Audio
 * only" and names no model or vendor; `{Agent}` stands for the agent's name. A reason added to the union and left out
 * here fails to compile.
 */
export const AVATAR_NOTICE_TEXT: Readonly<Record<RealtimeAvatarUnavailableReason, string>> = {
  endpoint: "Audio only: this voice model can't show an avatar",
  'no-binding': 'Audio only: this agent has no avatar for this voice model',
  'unknown-avatar': "Audio only: the chosen avatar wasn't found",
  'custom-disabled': "Audio only: custom avatars aren't turned on",
  host: "Audio only: this app can't show the avatar",
  browser: "Audio only: this browser can't play the avatar",
  bridged: `Audio only for ${AGENT_TOKEN}: the avatar can't be shown in this meeting`,
};

/**
 * The words for one reason: the host's own when it gave some (a blank one keeps the stock line, so a notice is never
 * empty), else {@link AVATAR_NOTICE_TEXT}, with `{Agent}` replaced by the agent's name.
 *
 * @param reason Why the call or meeting shows no avatar.
 * @param overrides The host's own words for some reasons.
 * @param agentName The agent's name, for the lines that name it; "the agent" when none is given.
 * @returns The line to show.
 */
export function AvatarNoticeText(reason: RealtimeAvatarUnavailableReason, overrides?: AvatarNoticeOverrides | null, agentName?: string | null): string {
  const own = overrides?.[reason];
  const line = own && own.trim().length > 0 ? own : AVATAR_NOTICE_TEXT[reason];
  const name = agentName?.trim() || UNNAMED_AGENT;
  return line.split(AGENT_TOKEN).join(name);
}
