import { describe, it, expect } from 'vitest';
import { VoiceIsSupported } from '../ui/browser-capabilities.js';

describe('VoiceIsSupported', () => {
    const secureWin = { isSecureContext: true };
    const insecureWin = { isSecureContext: false };
    const navWithMic = { mediaDevices: { getUserMedia: () => undefined } };
    const navWithoutMic = { mediaDevices: {} };

    it('returns true in a secure context with getUserMedia', () => {
        expect(VoiceIsSupported(navWithMic, secureWin)).toBe(true);
    });

    it('returns false in an insecure context even with getUserMedia', () => {
        expect(VoiceIsSupported(navWithMic, insecureWin)).toBe(false);
    });

    it('returns false when getUserMedia is absent', () => {
        expect(VoiceIsSupported(navWithoutMic, secureWin)).toBe(false);
    });

    it('returns false when mediaDevices is absent', () => {
        expect(VoiceIsSupported({}, secureWin)).toBe(false);
    });

    it('returns false when navigator or window is undefined', () => {
        expect(VoiceIsSupported(undefined, secureWin)).toBe(false);
        expect(VoiceIsSupported(navWithMic, undefined)).toBe(false);
    });
});
