import { describe, it, expect } from 'vitest';
import { CallCapacityGate, DEFAULT_MAX_CONCURRENT_CALLS, TelephonyCapacity } from '../telephony/telephonyCapacity.js';

describe('CallCapacityGate', () => {
    it('hands out slots up to the cap and refuses the next one', () => {
        const gate = new CallCapacityGate(2);
        const a = gate.TryAcquire();
        const b = gate.TryAcquire();
        expect(a).not.toBeNull();
        expect(b).not.toBeNull();
        expect(gate.TryAcquire()).toBeNull();
        expect(gate.Active).toBe(2);
    });

    it('frees a slot when its lease is released', () => {
        const gate = new CallCapacityGate(1);
        const lease = gate.TryAcquire();
        expect(gate.TryAcquire()).toBeNull();
        lease?.Release();
        expect(gate.Active).toBe(0);
        expect(gate.TryAcquire()).not.toBeNull();
    });

    it('treats a repeated release as a no-op, so one call can never free two slots', () => {
        const gate = new CallCapacityGate(2);
        const first = gate.TryAcquire();
        gate.TryAcquire();
        first?.Release();
        first?.Release();
        expect(gate.Active).toBe(1);
    });

    it.each([undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY])('falls back to the default cap for %s (never "unlimited", never "locked out")', (value) => {
        expect(new CallCapacityGate(value).Max).toBe(DEFAULT_MAX_CONCURRENT_CALLS);
    });

    it('floors a fractional cap', () => {
        expect(new CallCapacityGate(3.9).Max).toBe(3);
    });

    it('lowering the cap never drops a live call, it only refuses new ones', () => {
        const gate = new CallCapacityGate(3);
        gate.TryAcquire();
        gate.TryAcquire();
        gate.Configure(1);
        expect(gate.Active).toBe(2);
        expect(gate.TryAcquire()).toBeNull();
    });
});

describe('TelephonyCapacity', () => {
    it('is one shared gate for every carrier service in the process', () => {
        expect(TelephonyCapacity.Instance).toBe(TelephonyCapacity.Instance);
    });

    it('applies the configured cap and counts leases', () => {
        const capacity = TelephonyCapacity.Instance;
        const before = capacity.Active;
        capacity.Configure(before + 1);
        const lease = capacity.TryAcquire();
        try {
            expect(lease).not.toBeNull();
            expect(capacity.TryAcquire()).toBeNull();
            expect(capacity.Active).toBe(before + 1);
        } finally {
            lease?.Release();
            capacity.Configure(undefined);
        }
        expect(capacity.Max).toBe(DEFAULT_MAX_CONCURRENT_CALLS);
    });
});
