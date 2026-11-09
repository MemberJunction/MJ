import { describe, it, expect } from 'vitest';
import { ComputeBackoffSeconds, HeartbeatIntervalSeconds } from '../backoff';
import type { SubscriptionPolicy } from '../policy';

const POLICY: SubscriptionPolicy = {
    SubscriptionName: 'email.unsubscribe',
    TopicName: 'email.events',
    PartitionMode: 'Exclusive',
    MaxAttempts: 5,
    BackoffBaseSeconds: 10,
    BackoffMaxSeconds: 900,
    LeaseSeconds: 60,
    HeartbeatMode: 'Auto',
};

const always = (value: number) => () => value;

describe('ComputeBackoffSeconds', () => {
    it('uses the base delay as the ceiling for the first attempt', () => {
        expect(ComputeBackoffSeconds(POLICY, 1, undefined, always(1))).toBe(10);
    });

    it('doubles the ceiling for each later attempt', () => {
        expect(ComputeBackoffSeconds(POLICY, 2, undefined, always(1))).toBe(20);
        expect(ComputeBackoffSeconds(POLICY, 4, undefined, always(1))).toBe(80);
    });

    it('clamps the ceiling to BackoffMaxSeconds', () => {
        expect(ComputeBackoffSeconds(POLICY, 10, undefined, always(1))).toBe(900);
    });

    it('applies full jitter between zero and the ceiling', () => {
        expect(ComputeBackoffSeconds(POLICY, 3, undefined, always(0))).toBe(0);
        expect(ComputeBackoffSeconds(POLICY, 3, undefined, always(0.5))).toBe(20);
    });

    it('prefers a handler-supplied delay, rounded up and clamped', () => {
        expect(ComputeBackoffSeconds(POLICY, 5, 45, always(0))).toBe(45);
        expect(ComputeBackoffSeconds(POLICY, 1, 5000, always(0))).toBe(900);
        expect(ComputeBackoffSeconds(POLICY, 1, 2.2, always(0))).toBe(3);
        expect(ComputeBackoffSeconds(POLICY, 1, -4, always(0))).toBe(0);
    });

    it('ignores a non-finite handler delay', () => {
        expect(ComputeBackoffSeconds(POLICY, 2, Number.NaN, always(1))).toBe(20);
    });

    it('treats attempt zero like attempt one', () => {
        expect(ComputeBackoffSeconds(POLICY, 0, undefined, always(1))).toBe(10);
    });

    it('does not overflow for very large attempt counts', () => {
        const result = ComputeBackoffSeconds(POLICY, 1_000_000, undefined, always(1));
        expect(result).toBe(900);
        expect(Number.isFinite(result)).toBe(true);
    });
});

describe('HeartbeatIntervalSeconds', () => {
    it('is a third of a short lease', () => {
        expect(HeartbeatIntervalSeconds({ ...POLICY, LeaseSeconds: 60 })).toBe(20);
        expect(HeartbeatIntervalSeconds({ ...POLICY, LeaseSeconds: 15 })).toBe(5);
    });

    it('never exceeds 30 seconds, so a 20-minute lease still notices a cancel within 30 s', () => {
        expect(HeartbeatIntervalSeconds({ ...POLICY, LeaseSeconds: 90 })).toBe(30);
        expect(HeartbeatIntervalSeconds({ ...POLICY, LeaseSeconds: 1200 })).toBe(30);
    });
});
