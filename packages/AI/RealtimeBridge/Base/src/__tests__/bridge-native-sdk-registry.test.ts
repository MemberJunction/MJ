/**
 * Tests for `BridgeNativeSdkRegistry` — the per-DriverClass native-SDK binding registry the engine uses
 * to wire a resolved driver's SDK factory at connect. Covers register/apply/has, case+whitespace
 * insensitivity, latest-wins re-registration, the unregistered no-op, and the singleton identity.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BridgeNativeSdkRegistry, BridgeNativeSdkBinding } from '../bridge-native-sdk-registry';
import { BaseRealtimeBridge } from '../base-realtime-bridge';

/** A stand-in driver — the registry only ever passes it through to a binding, never inspects it. */
const fakeDriver = {} as BaseRealtimeBridge;

describe('BridgeNativeSdkRegistry', () => {
    let registry: BridgeNativeSdkRegistry;

    beforeEach(() => {
        registry = BridgeNativeSdkRegistry.Instance;
        // Each test uses a unique DriverClass so the process-wide singleton needs no reset.
    });

    it('is a process-wide singleton (same instance every access)', () => {
        expect(BridgeNativeSdkRegistry.Instance).toBe(registry);
    });

    it('Apply runs the registered binding with the driver and reports it ran', () => {
        const seen: BaseRealtimeBridge[] = [];
        const binding: BridgeNativeSdkBinding = (d) => seen.push(d);
        registry.Register('Test_Apply_Driver', binding);

        expect(registry.Has('Test_Apply_Driver')).toBe(true);
        expect(registry.Apply('Test_Apply_Driver', fakeDriver)).toBe(true);
        expect(seen).toEqual([fakeDriver]);
    });

    it('lookup is case- and whitespace-insensitive (mirrors EntityByName)', () => {
        let count = 0;
        registry.Register('Test_Case_Driver', () => count++);
        expect(registry.Apply('  test_case_driver  ', fakeDriver)).toBe(true);
        expect(registry.Has('TEST_CASE_DRIVER')).toBe(true);
        expect(count).toBe(1);
    });

    it('latest registration wins (idempotent re-register under code-splitting)', () => {
        const calls: string[] = [];
        registry.Register('Test_Latest_Driver', () => calls.push('first'));
        registry.Register('Test_Latest_Driver', () => calls.push('second'));
        registry.Apply('Test_Latest_Driver', fakeDriver);
        expect(calls).toEqual(['second']);
    });

    it('Apply is a safe no-op (false) when no binding is registered', () => {
        expect(registry.Has('Test_Unregistered_Driver_xyz')).toBe(false);
        expect(registry.Apply('Test_Unregistered_Driver_xyz', fakeDriver)).toBe(false);
    });

    it('ignores an empty DriverClass on register/apply/has', () => {
        registry.Register('', () => { throw new Error('should not register'); });
        expect(registry.Has('')).toBe(false);
        expect(registry.Apply('', fakeDriver)).toBe(false);
    });
});
