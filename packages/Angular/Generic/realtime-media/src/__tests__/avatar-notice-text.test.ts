import { describe, expect, it } from 'vitest';
import type { RealtimeAvatarUnavailableReason } from '@memberjunction/ai';
import { AVATAR_NOTICE_TEXT, AVATAR_NOTICE_UNKNOWN_REASON_TEXT, AvatarNoticeText } from '../lib/avatar-notice-text';

/** The decided wording (design §3.1, N3), one line per reason. */
const DECIDED: Readonly<Record<RealtimeAvatarUnavailableReason, string>> = {
  endpoint: "Audio only: this voice model can't show an avatar",
  'no-binding': 'Audio only: this agent has no avatar for this voice model',
  'unknown-avatar': "Audio only: the chosen avatar wasn't found",
  'custom-disabled': "Audio only: custom avatars aren't turned on",
  host: "Audio only: this app can't show the avatar",
  browser: "Audio only: this browser can't play the avatar",
  bridged: "Audio only for Sage: the avatar can't be shown in this meeting",
  phone: "Audio only for Sage: the avatar isn't shown on phone calls",
  'decoder-missing': "Audio only for Sage: the avatar couldn't be shown in this meeting",
  'decoder-failed': "Audio only for Sage: the avatar couldn't be shown in this meeting",
  'publish-failed': "Audio only for Sage: the avatar couldn't be shown in this meeting",
};

describe('AvatarNoticeText', () => {
  it("says a phone call shows no avatar, in its own words rather than the meeting's 'bridged' line", () => {
    expect(AvatarNoticeText('phone', null, 'Sage', { NameAgent: true })).toBe("Audio only for Sage: the avatar isn't shown on phone calls");
    expect(AvatarNoticeText('phone')).toBe("Audio only for the agent: the avatar isn't shown on phone calls");
    expect(AvatarNoticeText('phone', null, 'Sage')).not.toBe(AvatarNoticeText('bridged', null, 'Sage'));
  });

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

/** The decided meeting wording (66r): each reason's line, naming the agent. */
const MEETING: Readonly<Record<RealtimeAvatarUnavailableReason, string>> = {
  endpoint: "Audio only for Sage: this voice model can't show an avatar",
  'no-binding': 'Audio only for Sage: this agent has no avatar for this voice model',
  'unknown-avatar': "Audio only for Sage: the chosen avatar wasn't found",
  'custom-disabled': "Audio only for Sage: custom avatars aren't turned on",
  host: "Audio only for Sage: this app can't show the avatar",
  browser: "Audio only for Sage: this browser can't play the avatar",
  bridged: "Audio only for Sage: the avatar can't be shown in this meeting",
  phone: "Audio only for Sage: the avatar isn't shown on phone calls",
  'decoder-missing': "Audio only for Sage: the avatar couldn't be shown in this meeting",
  'decoder-failed': "Audio only for Sage: the avatar couldn't be shown in this meeting",
  'publish-failed': "Audio only for Sage: the avatar couldn't be shown in this meeting",
};

describe('AvatarNoticeText in a meeting (NameAgent)', () => {
  it('names the agent on every line, and "the agent" when there is no name', () => {
    for (const [reason, line] of Object.entries(MEETING) as Array<[RealtimeAvatarUnavailableReason, string]>) {
      expect(AvatarNoticeText(reason, null, 'Sage', { NameAgent: true }), reason).toBe(line);
    }
    expect(AvatarNoticeText('endpoint', null, null, { NameAgent: true })).toBe("Audio only for the agent: this voice model can't show an avatar");
  });

  it("keeps a call's words when the option is off or not given", () => {
    expect(AvatarNoticeText('endpoint', null, 'Sage', { NameAgent: false })).toBe("Audio only: this voice model can't show an avatar");
    expect(AvatarNoticeText('endpoint', null, 'Sage', {})).toBe("Audio only: this voice model can't show an avatar");
  });

  it("uses a host's own line as written, with {Agent} filled; a blank one keeps the stock line, naming the agent", () => {
    const overrides = { host: "Audio only: the Example widget can't show the avatar", bridged: '{Agent} is audio only here', endpoint: ' ' };
    expect(AvatarNoticeText('host', overrides, 'Sage', { NameAgent: true })).toBe("Audio only: the Example widget can't show the avatar");
    expect(AvatarNoticeText('bridged', overrides, 'Sage', { NameAgent: true })).toBe('Sage is audio only here');
    expect(AvatarNoticeText('endpoint', overrides, 'Sage', { NameAgent: true })).toBe("Audio only for Sage: this voice model can't show an avatar");
  });
});

describe('AvatarNoticeText for a reason this version does not know (null, or one with no line here)', () => {
  it("says the avatar couldn't be shown, naming the agent, with or without the option", () => {
    const line = "Audio only for Sage: the avatar couldn't be shown in this meeting";
    expect(AvatarNoticeText(null, null, 'Sage', { NameAgent: true })).toBe(line);
    expect(AvatarNoticeText(null, null, 'Sage')).toBe(line);
    expect(AvatarNoticeText(null)).toBe("Audio only for the agent: the avatar couldn't be shown in this meeting");
    expect(AVATAR_NOTICE_UNKNOWN_REASON_TEXT).toBe("Audio only for {Agent}: the avatar couldn't be shown in this meeting");
  });

  it("doesn't take a host's line for a reason it knows in its place", () => {
    const overrides = { 'decoder-failed': 'Example Meet lost the avatar', bridged: '{Agent} is audio only here' };
    expect(AvatarNoticeText(null, overrides, 'Sage', { NameAgent: true })).toBe("Audio only for Sage: the avatar couldn't be shown in this meeting");
  });

  it("uses the host's own line for it (unknown) as written, with {Agent} filled, with or without the option", () => {
    const overrides = { unknown: 'Example Meet shows {Agent} as audio only', bridged: '{Agent} is audio only here' };
    expect(AvatarNoticeText(null, overrides, 'Sage', { NameAgent: true })).toBe('Example Meet shows Sage as audio only');
    expect(AvatarNoticeText(null, overrides, 'Sage')).toBe('Example Meet shows Sage as audio only');
    expect(AvatarNoticeText(null, overrides)).toBe('Example Meet shows the agent as audio only');
  });

  it('keeps the stock line when the host gives a blank one for it, so the notice is never empty', () => {
    const line = "Audio only for Sage: the avatar couldn't be shown in this meeting";
    expect(AvatarNoticeText(null, { unknown: '' }, 'Sage')).toBe(line);
    expect(AvatarNoticeText(null, { unknown: '   ' }, 'Sage', { NameAgent: true })).toBe(line);
  });

  it("keeps a known reason's stock line when the host words only the unknown one", () => {
    const overrides = { unknown: 'Example Meet shows {Agent} as audio only' };
    expect(AvatarNoticeText('bridged', overrides, 'Sage')).toBe("Audio only for Sage: the avatar can't be shown in this meeting");
    expect(AvatarNoticeText('endpoint', overrides, 'Sage', { NameAgent: true })).toBe("Audio only for Sage: this voice model can't show an avatar");
  });

  it('reads a reason with no line here, such as a newer one, as one it does not know', () => {
    const newer: string = 'some-newer-reason';
    const inherited: string = 'constructor';
    for (const reason of [newer, inherited] as RealtimeAvatarUnavailableReason[]) {
      expect(AvatarNoticeText(reason, null, 'Sage'), reason).toBe("Audio only for Sage: the avatar couldn't be shown in this meeting");
      expect(AvatarNoticeText(reason, { unknown: '{Agent} is audio only here' }, 'Sage', { NameAgent: true }), reason).toBe('Sage is audio only here');
    }
  });
});
