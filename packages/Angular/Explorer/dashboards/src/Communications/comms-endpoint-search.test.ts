import '@angular/compiler';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NormalizeSearchAddress, Sha256Hex } from './comms-endpoints-suppressions-tab.component';

// The admin search must find endpoints by the exact NormalizedValue / ValueHash the server stores,
// so these mirror NormalizeEndpointAddress and ComputeEndpointHash in @memberjunction/communication-engine.
describe('endpoint search normalization', () => {
    it('lower-cases and trims an email', () => {
        expect(NormalizeSearchAddress('  Jane.Doe@Example.COM ')).toBe('jane.doe@example.com');
    });

    it('reduces a phone number to digits, keeping a leading +', () => {
        expect(NormalizeSearchAddress('+1 (555) 123-4567')).toBe('+15551234567');
        expect(NormalizeSearchAddress('555.123.4567')).toBe('5551234567');
    });

    it('returns null for empty or digitless input', () => {
        expect(NormalizeSearchAddress('   ')).toBeNull();
        expect(NormalizeSearchAddress('abc')).toBeNull();
    });

    it('hashes to the same SHA-256 hex digest the server stores as ValueHash', async () => {
        const value = 'jane.doe@example.com';
        expect(await Sha256Hex(value)).toBe(createHash('sha256').update(value, 'utf8').digest('hex'));
    });
});
