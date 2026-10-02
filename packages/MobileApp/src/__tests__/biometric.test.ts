import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the biometric wrapper. `expo-local-authentication` is a native
 * module, so it's fully mocked; the mutable `la` state lets each test drive the
 * hardware/enrollment/prompt outcomes.
 */
const la = vi.hoisted(() => ({
    hasHardware: true,
    isEnrolled: true,
    types: [2] as number[],
    authSuccess: true,
    authThrows: false,
}));

vi.mock('expo-local-authentication', () => ({
    AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
    hasHardwareAsync: () => Promise.resolve(la.hasHardware),
    isEnrolledAsync: () => Promise.resolve(la.isEnrolled),
    supportedAuthenticationTypesAsync: () => Promise.resolve(la.types),
    authenticateAsync: () =>
        la.authThrows ? Promise.reject(new Error('boom')) : Promise.resolve({ success: la.authSuccess }),
}));

import { authenticate, GetBiometricLabel, IsBiometricAvailable } from '@/auth/biometric';

beforeEach(() => {
    la.hasHardware = true;
    la.isEnrolled = true;
    la.types = [2];
    la.authSuccess = true;
    la.authThrows = false;
});

describe('IsBiometricAvailable', () => {
    it('is true only when hardware exists AND a biometric is enrolled', async () => {
        expect(await IsBiometricAvailable()).toBe(true);
    });

    it('is false without hardware', async () => {
        la.hasHardware = false;
        expect(await IsBiometricAvailable()).toBe(false);
    });

    it('is false when nothing is enrolled (e.g. bare simulator)', async () => {
        la.isEnrolled = false;
        expect(await IsBiometricAvailable()).toBe(false);
    });
});

describe('GetBiometricLabel', () => {
    it('reports Face ID when facial recognition is supported', async () => {
        la.types = [2];
        expect(await GetBiometricLabel()).toBe('Face ID');
    });

    it('reports Touch ID when only fingerprint is supported', async () => {
        la.types = [1];
        expect(await GetBiometricLabel()).toBe('Touch ID');
    });

    it('falls back to a generic label when nothing is supported', async () => {
        la.types = [];
        expect(await GetBiometricLabel()).toBe('Biometrics');
    });
});

describe('authenticate', () => {
    it('returns true on a successful prompt', async () => {
        expect(await authenticate('unlock')).toBe(true);
    });

    it('returns false when biometrics are unavailable (never prompts)', async () => {
        la.hasHardware = false;
        expect(await authenticate('unlock')).toBe(false);
    });

    it('returns false when the user fails/cancels the prompt', async () => {
        la.authSuccess = false;
        expect(await authenticate('unlock')).toBe(false);
    });

    it('returns false (never throws) when the native call errors', async () => {
        la.authThrows = true;
        expect(await authenticate('unlock')).toBe(false);
    });
});
