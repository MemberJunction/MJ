import { describe, expect, it } from 'vitest';
import type { RealtimeAvatarUnavailableReason } from '@memberjunction/ai';
import { AVATAR_NOTICE_TEXT, AvatarNoticeText } from '../lib/avatar-notice-text';

/** The decided wording (design §3.1, N3), one line per reason. */
const DECIDED: Readonly<Record<RealtimeAvatarUnavailableReason, string>> = {
  endpoint: "Audio only: this voice model can't show an avatar",
  'no-binding': 'Audio only: this agent has no avatar for this voice model',
  'unknown-avatar': "Audio only: the chosen avatar wasn't found",
  'custom-disabled': "Audio only: custom avatars aren't turned on",
  host: "Audio only: this app can't show the avatar",
  browser: "Audio only: this browser can't play the avatar",
  bridged: "Audio only for Sage: the avatar can't be shown in this meeting",
};

describe('AvatarNoticeText', () => {
  it('says each reason in the decided words', () => {
    for (const [reason, line] of Object.entries(DECIDED) as Array<[RealtimeAvatarUnavailableReason, string]>) {
      expect(AvatarNoticeText(reason, null, 'Sage'), reason).toBe(line);
    }
    expect(Object.keys(AVATAR_NOTICE_TEXT).sort()).toEqual(Object.keys(DECIDED).sort());
  });

  it("puts the agent's name in the lines that name it, and \"the agent\" when there is none", () => {
    expect(AvatarNoticeText('bridged', undefined, 'Sage')).toBe("Audio only for Sage: the avatar can't be shown in this meeting");
    expect(AvatarNoticeText('bridged')).toBe("Audio only for the agent: the avatar can't be shown in this meeting");
    expect(AvatarNoticeText('bridged', {}, '   ')).toBe("Audio only for the agent: the avatar can't be shown in this meeting");
    expect(AvatarNoticeText('endpoint', {}, 'Sage')).toBe("Audio only: this voice model can't show an avatar");
  });

  it("uses a host's own words for the reasons it gives, and the stock words for the rest", () => {
    const overrides = { host: "Audio only: the Example widget can't show the avatar", bridged: '{Agent} is audio only here' };
    expect(AvatarNoticeText('host', overrides)).toBe("Audio only: the Example widget can't show the avatar");
    expect(AvatarNoticeText('bridged', overrides, 'Sage')).toBe('Sage is audio only here');
    expect(AvatarNoticeText('browser', overrides)).toBe("Audio only: this browser can't play the avatar");
  });

  it('keeps the stock words when a host gives blank ones, so the notice is never empty', () => {
    expect(AvatarNoticeText('host', { host: '' })).toBe("Audio only: this app can't show the avatar");
    expect(AvatarNoticeText('endpoint', { endpoint: '   ' })).toBe("Audio only: this voice model can't show an avatar");
  });
});
