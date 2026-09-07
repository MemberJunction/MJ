/**
 * Live Google Geocoding API. Skips (warn, not fail) when GOOGLE_GEOCODING_API_KEY
 * is unset. Loads MJ/.env if present without printing secrets.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGeocodingProvider } from '../providers/GoogleGeocodingProvider';

function readKeyFromMjEnv(): string | undefined {
    if (process.env.GOOGLE_GEOCODING_API_KEY?.trim()) {
        return process.env.GOOGLE_GEOCODING_API_KEY.trim();
    }
    const mjEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../.env');
    if (!fs.existsSync(mjEnv)) return undefined;
    const text = fs.readFileSync(mjEnv, 'utf8');
    const m = text.match(/^GOOGLE_GEOCODING_API_KEY\s*=\s*['"]?([^'"\n]+)['"]?/m);
    return m?.[1]?.trim();
}

const apiKey = readKeyFromMjEnv();
if (!apiKey) {
    console.warn('GOOGLE_GEOCODING_API_KEY not set — skipping live Google geocode integration test');
}

const describeLive = apiKey ? describe : describe.skip;

describeLive('Google Geocoding API (live)', () => {
    it('geocodes a well-known address', async () => {
        process.env.GOOGLE_GEOCODING_API_KEY = apiKey;
        const provider = new GoogleGeocodingProvider();
        expect(provider.IsConfigured()).toBe(true);
        const result = await provider.Geocode({ AddressString: '1600 Amphitheatre Parkway, Mountain View, CA' });
        expect(result).not.toBeNull();
        expect(result!.Latitude).toBeGreaterThan(37);
        expect(result!.Latitude).toBeLessThan(38);
        expect(result!.Longitude).toBeLessThan(-121);
        expect(result!.Longitude).toBeGreaterThan(-123);
    }, 20_000);
});
