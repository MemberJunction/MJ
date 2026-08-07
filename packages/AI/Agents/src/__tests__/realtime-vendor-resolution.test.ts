/**
 * @fileoverview Tests for `SelectRealtimeVendorForModel` — the ONE copy of "which vendor runs this
 * realtime model?", now depended on by `BaseAgent`, `RealtimeClientSessionService`, and the
 * model/voice picker. Previously three byte-identical private copies, so these pin the rule itself
 * rather than any one caller's view of it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectRealtimeVendorForModel } from '../realtime/realtime-vendor-resolution';

/** Mutable stand-in for the engine's cached `ModelVendors`, reset per test. */
const engineState: { ModelVendors: unknown[] } = { ModelVendors: [] };

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return engineState;
        }
    }
}));

vi.mock('@memberjunction/ai', () => ({
    GetAIAPIKey: (driverClass: string) => (driverClass === 'EnvKeyedDriver' ? 'env-key' : '')
}));

/** A `MJ: AI Model Vendors` row shaped as the selector reads it. */
function vendor(
    modelID: string,
    driverClass: string | null,
    priority: number | null,
    status = 'Active'
): unknown {
    return {
        ModelID: modelID,
        DriverClass: driverClass,
        Priority: priority,
        Status: status,
        VendorID: `v-${driverClass}`,
        APIName: `api-${driverClass}`
    };
}

/** Every driver has a key — isolates ordering/filtering from key resolution. */
const allKeyed = () => 'key';

describe('SelectRealtimeVendorForModel', () => {
    beforeEach(() => {
        engineState.ModelVendors = [];
    });

    it('returns the highest-Priority active vendor whose driver has a key', () => {
        engineState.ModelVendors = [vendor('m1', 'LowDriver', 1), vendor('m1', 'HighDriver', 9)];
        expect(SelectRealtimeVendorForModel('m1', allKeyed)).toEqual({
            VendorID: 'v-HighDriver',
            DriverClass: 'HighDriver',
            APIName: 'api-HighDriver'
        });
    });

    it('falls PAST a keyless higher-priority vendor instead of dead-ending', () => {
        // The reason the walk exists at all: a deployment configuring only one provider's key must
        // still resolve that provider, even when a higher-ranked vendor outranks it.
        engineState.ModelVendors = [vendor('m1', 'NoKeyDriver', 9), vendor('m1', 'KeyedDriver', 1)];
        const keyedOnly = (driverClass: string) => (driverClass === 'KeyedDriver' ? 'k' : undefined);
        expect(SelectRealtimeVendorForModel('m1', keyedOnly)?.DriverClass).toBe('KeyedDriver');
    });

    it('skips inactive vendors, null DriverClass rows, and other models’ vendors', () => {
        engineState.ModelVendors = [
            vendor('m1', 'InactiveDriver', 9, 'Inactive'),
            vendor('m1', null, 8),
            vendor('m2', 'OtherModelDriver', 7),
            vendor('m1', 'UsableDriver', 1)
        ];
        expect(SelectRealtimeVendorForModel('m1', allKeyed)?.DriverClass).toBe('UsableDriver');
    });

    it('matches the model id case-insensitively (UUID comparison, not string equality)', () => {
        engineState.ModelVendors = [vendor('AABBCCDD-1111-2222-3333-444455556666', 'CaseDriver', 1)];
        expect(SelectRealtimeVendorForModel('aabbccdd-1111-2222-3333-444455556666', allKeyed)?.DriverClass)
            .toBe('CaseDriver');
    });

    it('treats a missing Priority as lowest rather than throwing', () => {
        engineState.ModelVendors = [vendor('m1', 'NullPriorityDriver', null), vendor('m1', 'RankedDriver', 3)];
        expect(SelectRealtimeVendorForModel('m1', allKeyed)?.DriverClass).toBe('RankedDriver');
    });

    it('defaults absent VendorID / APIName to empty strings', () => {
        engineState.ModelVendors = [{ ModelID: 'm1', DriverClass: 'BareDriver', Priority: 1, Status: 'Active' }];
        expect(SelectRealtimeVendorForModel('m1', allKeyed)).toEqual({
            VendorID: '',
            DriverClass: 'BareDriver',
            APIName: ''
        });
    });

    it('returns null when no vendor has a usable key, and when the model has none at all', () => {
        engineState.ModelVendors = [vendor('m1', 'NoKeyDriver', 1)];
        expect(SelectRealtimeVendorForModel('m1', () => undefined)).toBeNull();
        expect(SelectRealtimeVendorForModel('unknown-model', allKeyed)).toBeNull();
    });

    it('falls back to the environment key resolver when none is supplied', () => {
        engineState.ModelVendors = [vendor('m1', 'UnkeyedDriver', 9), vendor('m1', 'EnvKeyedDriver', 1)];
        expect(SelectRealtimeVendorForModel('m1')?.DriverClass).toBe('EnvKeyedDriver');
    });
});
