import type { RealtimeAvatarUnavailableReason } from '@memberjunction/ai';

/**
 * @fileoverview The words of the voice screen's "Audio only" notice, one sentence per reason.
 *
 * A copy of `ng-realtime-media`'s `AVATAR_NOTICE_TEXT`, which this app can't import (an Angular
 * package), so a call reads the same on a phone and in a browser: change both together. Keyed by
 * every reason the runtime can report, so a reason without a sentence fails to compile. Meeting
 * reasons name the agent through `{Agent}`.
 */
export const AVATAR_NOTICE_TEXT: Record<RealtimeAvatarUnavailableReason, string> = {
    endpoint: "Audio only: this voice model can't show an avatar",
    'no-binding': 'Audio only: this agent has no avatar for this voice model',
    'unknown-avatar': "Audio only: the chosen avatar wasn't found",
    'custom-disabled': "Audio only: custom avatars aren't turned on",
    host: "Audio only: this app can't show the avatar",
    browser: "Audio only: this browser can't play the avatar",
    bridged: "Audio only for {Agent}: the avatar can't be shown in this meeting",
    phone: "Audio only for {Agent}: the avatar isn't shown on phone calls",
    'decoder-missing': "Audio only for {Agent}: the avatar couldn't be shown in this meeting",
    'decoder-failed': "Audio only for {Agent}: the avatar couldn't be shown in this meeting",
    'publish-failed': "Audio only for {Agent}: the avatar couldn't be shown in this meeting",
};

/**
 * The notice's sentence for a reason.
 *
 * @param reason Why the call is audio only.
 * @param agentName The agent a meeting sentence names; "the agent" when not given.
 */
export function AvatarNoticeText(reason: RealtimeAvatarUnavailableReason, agentName?: string | null): string {
    return AVATAR_NOTICE_TEXT[reason].replace('{Agent}', agentName?.trim() || 'the agent');
}
