/**
 * Typed, defensive wrappers over `expo-local-authentication`.
 *
 * The device-lock feature (P2.4) uses these to gate the app behind Face ID /
 * Touch ID. Every function is written to degrade gracefully: a simulator with
 * no enrolled biometrics, a device without the sensor, or a native call that
 * throws all resolve to a clean "not available / not authenticated" result
 * rather than propagating an error — so the app can always fail *open* and
 * never lock a user out permanently.
 */
import * as LocalAuthentication from 'expo-local-authentication';

/** Friendly, human-readable name for the biometric modality on this device. */
export type BiometricLabel = 'Face ID' | 'Touch ID' | 'Biometrics';

/**
 * Whether biometric authentication can actually be used right now: the device
 * has the hardware AND the user has enrolled a face/fingerprint. Both must be
 * true — enrolled-but-no-hardware or hardware-but-not-enrolled are unusable.
 *
 * @returns `true` only when a biometric prompt would succeed; `false` on
 *   simulators without enrollment, unsupported devices, or any native error.
 */
export async function isBiometricAvailable(): Promise<boolean> {
    try {
        const [hasHardware, isEnrolled] = await Promise.all([
            LocalAuthentication.hasHardwareAsync(),
            LocalAuthentication.isEnrolledAsync(),
        ]);
        return hasHardware && isEnrolled;
    } catch {
        return false;
    }
}

/**
 * Resolve a friendly label for the strongest biometric modality the device
 * supports (Face ID > Touch ID > generic). Used for UI copy on the lock screen
 * and the settings toggle.
 *
 * @returns `'Face ID'`, `'Touch ID'`, or `'Biometrics'` (the safe default when
 *   the modality can't be determined).
 */
export async function getBiometricLabel(): Promise<BiometricLabel> {
    try {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
        if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Touch ID';
        return 'Biometrics';
    } catch {
        return 'Biometrics';
    }
}

/**
 * Prompt the user to authenticate with their biometric (falling back to the
 * device passcode, which is acceptable for an app lock). Guards for
 * availability first so a call on an unsupported device resolves `false`
 * instead of surfacing a native error.
 *
 * @param reason Prompt copy shown alongside the system Face ID / Touch ID sheet.
 * @returns `true` if the user successfully authenticated; `false` on cancel,
 *   failure, unavailability, or any native error.
 */
export async function authenticate(reason: string): Promise<boolean> {
    try {
        if (!(await isBiometricAvailable())) return false;
        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: reason,
            cancelLabel: 'Cancel',
            fallbackLabel: 'Use Passcode',
        });
        return result.success === true;
    } catch {
        return false;
    }
}
