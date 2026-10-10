import { describe, it, expect } from 'vitest';
import { AVATAR_NOTICE_CALL_UNKNOWN_REASON_TEXT, AVATAR_NOTICE_TEXT, AvatarNoticeText } from '@/voice/avatar-notice-text';

/**
 * Tests for the words of the voice screen's "Audio only" notice.
 *
 * A phone and a browser describe the same call the same way, so the call sentences are asserted
 * word for word against the web's table. That a reason has a sentence at all is the compiler's job:
 * the table is keyed by every reason the runtime can report.
 */
describe('AvatarNoticeText', () => {
    it('says the app is the reason when an avatar was granted but this app cannot show one', () => {
        expect(AvatarNoticeText('host')).toBe("Audio only: this app can't show the avatar");
    });

    it.each([
        ['endpoint', "Audio only: this voice model can't show an avatar"],
        ['no-binding', 'Audio only: this agent has no avatar for this voice model'],
        ['unknown-avatar', "Audio only: the chosen avatar wasn't found"],
        ['custom-disabled', "Audio only: custom avatars aren't turned on"],
        ['browser', "Audio only: this browser can't play the avatar"],
    ] as const)('says the same as the web for %s', (reason, sentence) => {
        expect(AvatarNoticeText(reason)).toBe(sentence);
    });

    it('covers exactly the reasons the runtime reports, each opening "Audio only"', () => {
        expect(Object.keys(AVATAR_NOTICE_TEXT).sort()).toEqual(
            ['bridged', 'browser', 'custom-disabled', 'decoder-failed', 'decoder-missing', 'endpoint', 'host', 'no-binding', 'phone', 'publish-failed', 'unknown-avatar'],
        );
        for (const sentence of Object.values(AVATAR_NOTICE_TEXT)) {
            expect(sentence.startsWith('Audio only')).toBe(true);
        }
    });

    it("says a phone call shows no avatar, naming the agent, as the web's room does", () => {
        expect(AvatarNoticeText('phone', 'Sage')).toBe("Audio only for Sage: the avatar isn't shown on phone calls");
    });

    it('names the agent in a meeting sentence', () => {
        expect(AvatarNoticeText('bridged', 'Sage')).toBe("Audio only for Sage: the avatar can't be shown in this meeting");
    });

    it('says "the agent" when a meeting sentence has no name to use', () => {
        expect(AvatarNoticeText('bridged')).toBe("Audio only for the agent: the avatar can't be shown in this meeting");
        expect(AvatarNoticeText('bridged', '   ')).toBe("Audio only for the agent: the avatar can't be shown in this meeting");
    });

    it.each(['decoder-missing', 'decoder-failed', 'publish-failed'] as const)("says a meeting bot's avatar for %s couldn't be shown, naming the agent", (reason) => {
        expect(AvatarNoticeText(reason, 'Sage')).toBe("Audio only for Sage: the avatar couldn't be shown in this meeting");
    });

    it('leaves the agent out of a call sentence', () => {
        expect(AvatarNoticeText('host', 'Sage')).toBe("Audio only: this app can't show the avatar");
    });

    it("says the call can't show the avatar for a reason this version doesn't know, as the web's call does", () => {
        expect(AvatarNoticeText(null)).toBe("Audio only: the avatar can't be shown in this call");
        expect(AvatarNoticeText(null, 'Sage')).toBe("Audio only: the avatar can't be shown in this call");
        expect(AVATAR_NOTICE_CALL_UNKNOWN_REASON_TEXT).toBe("Audio only: the avatar can't be shown in this call");
    });
});
