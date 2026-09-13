/**
 * The connector declares what is tunable, so a surface does not have to guess.
 *
 * The concrete failure this prevents: MJC hardcoded its own list of connection settings, invented
 * a default of 500 for the discovery sample size, and stamped it at create time — against an
 * engine whose real default is 50. Six of seven connectors then sampled 300-500 records per table
 * instead of ~50, and nothing anywhere said so, because there was no single place that knew what
 * the default actually was.
 */
import { describe, it, expect } from 'vitest';
import { BaseIntegrationConnector, type ConnectorSettingDescriptor } from '../BaseIntegrationConnector.js';

/** Minimal concrete connector — the abstract members are irrelevant to the schema. */
class BareConnector extends (BaseIntegrationConnector as unknown as new () => BaseIntegrationConnector) {}

/** A connector that adds one of its own, the documented way. */
const VENDOR_SETTING: ConnectorSettingDescriptor = {
    Key: 'vendorThing', Label: 'Vendor thing', Group: 'Vendor', Type: 'boolean',
    Default: false, Tier: 'advanced', AppliesTo: 'connection', Description: 'x', Sensitive: false,
};
class VendorConnector extends (BaseIntegrationConnector as unknown as new () => BaseIntegrationConnector) {
    public get SettingsSchema(): ConnectorSettingDescriptor[] {
        return [...super.SettingsSchema, VENDOR_SETTING];
    }
}

const schema = () => new BareConnector().SettingsSchema;
const byKey = (k: string) => schema().find(s => s.Key === k);

describe('every connector gets a schema with no connector code', () => {
    it('is non-empty on a connector that declares nothing', () => {
        expect(schema().length).toBeGreaterThan(0);
    });

    it('declares the discovery sample size with the ENGINE default, not an invented one', () => {
        // The whole point. 50 is the significance floor for the key statistics; 500 was a guess.
        expect(byKey('discoveryMaxRecords')?.Default).toBe(50);
    });

    it('covers the keys the engine actually reads from Configuration', () => {
        const keys = schema().map(s => s.Key);
        for (const k of [
            'syncConcurrency', 'maxConcurrency', 'rateLimitTokensPerSec', 'rateLimitBurst',
            'crossLayerPipeline', 'partitionReconcile', 'fetchTimeoutMs', 'writeMode',
            'discoveryMaxRecords', 'discoveryTimeBudgetMs', 'discoveryBatchSize',
            'discoverySampleMaxDepth', 'discoveryParentKeySampleRows', 'deactivateAbsent',
            'autoPromoteCustomColumns',
        ]) {
            expect(keys, `missing ${k}`).toContain(k);
        }
    });

    it('has unique keys — a duplicate would render twice and write over itself', () => {
        const keys = schema().map(s => s.Key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('the descriptors are usable by a renderer that knows nothing', () => {
    it('every setting names a tier and a scope', () => {
        for (const s of schema()) {
            expect(['basic', 'advanced', 'expert'], s.Key).toContain(s.Tier);
            expect(['connection', 'object'], s.Key).toContain(s.AppliesTo);
        }
    });

    it('every setting has a description that says what happens, not just what it is', () => {
        for (const s of schema()) {
            expect(s.Description.length, s.Key).toBeGreaterThan(20);
        }
    });

    it('an enum declares its options; a non-enum does not', () => {
        for (const s of schema()) {
            if (s.Type === 'enum') expect(s.Options?.length, s.Key).toBeGreaterThan(0);
            else expect(s.Options, s.Key).toBeUndefined();
        }
    });

    it('a number with both bounds has Min below Max', () => {
        for (const s of schema()) {
            if (typeof s.Min === 'number' && typeof s.Max === 'number') {
                expect(s.Min, s.Key).toBeLessThan(s.Max);
            }
        }
    });

    it('a numeric default sits inside its own declared bounds', () => {
        for (const s of schema()) {
            if (typeof s.Default === 'number') {
                if (typeof s.Min === 'number') expect(s.Default, s.Key).toBeGreaterThanOrEqual(s.Min);
                if (typeof s.Max === 'number') expect(s.Default, s.Key).toBeLessThanOrEqual(s.Max);
            }
        }
    });

    it('nothing is marked sensitive — credentials are not settings', () => {
        expect(schema().every(s => s.Sensitive === false)).toBe(true);
    });

    it('a basic setting is one an operator can safely change', () => {
        // Guard against the tier becoming meaningless: throughput and rate limits are never basic.
        const basic = schema().filter(s => s.Tier === 'basic').map(s => s.Key);
        for (const risky of ['syncConcurrency', 'maxConcurrency', 'rateLimitTokensPerSec', 'writeMode']) {
            expect(basic, `${risky} must not be basic`).not.toContain(risky);
        }
    });
});

describe('subclassing', () => {
    it('a connector appends without losing the framework settings', () => {
        const keys = new VendorConnector().SettingsSchema.map(s => s.Key);
        expect(keys).toContain('vendorThing');
        expect(keys).toContain('discoveryMaxRecords');
    });

    it('returns a copy, so one caller cannot reorder the shared definition for everyone', () => {
        const a = schema();
        a.sort((x, y) => x.Key.localeCompare(y.Key));
        a[0].Label = 'mutated';
        const b = schema();
        expect(b[0].Label).not.toBe('mutated');
        expect(b.map(s => s.Key)).not.toEqual(a.map(s => s.Key));
    });
});
