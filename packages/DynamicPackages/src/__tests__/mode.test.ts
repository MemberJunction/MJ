import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DYNAMIC_PACKAGES_MODE_ENV_VAR, ResolveDynamicPackagesMode } from '../mode';

describe('ResolveDynamicPackagesMode precedence', () => {
    const original = process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR];

    beforeEach(() => {
        delete process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR];
    });

    afterEach(() => {
        if (original === undefined) {
            delete process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR];
        } else {
            process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR] = original;
        }
    });

    it('defaults to load', () => {
        expect(ResolveDynamicPackagesMode({ processId: 'mjapi' })).toEqual({ mode: 'load', source: 'default', ignoredInvalid: undefined });
    });

    it('env var beats option beats policy', () => {
        process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR] = 'none';
        expect(ResolveDynamicPackagesMode({ processId: 'cli:sync:push', option: 'load', policy: { cli: 'load' } })).toEqual({
            mode: 'none',
            source: 'env',
        });
    });

    it('option beats policy', () => {
        const resolved = ResolveDynamicPackagesMode({ processId: 'cli:sync:push', option: 'none', policy: { cli: 'load' } });
        expect(resolved.mode).toBe('none');
        expect(resolved.source).toBe('option');
    });

    it('policy resolves the most specific process key', () => {
        const policy = { cli: 'none', 'cli:sync': 'load' };
        expect(ResolveDynamicPackagesMode({ processId: 'cli:sync:push', policy }).mode).toBe('load');
        expect(ResolveDynamicPackagesMode({ processId: 'cli:migrate', policy }).mode).toBe('none');
        expect(ResolveDynamicPackagesMode({ processId: 'cli:migrate', policy }).source).toBe('policy');
        expect(ResolveDynamicPackagesMode({ processId: 'mjapi', policy }).source).toBe('default');
    });

    it('accepts friendly spellings for the env var', () => {
        for (const value of ['off', 'skip', 'false', '0', 'NONE']) {
            process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR] = value;
            expect(ResolveDynamicPackagesMode({ processId: 'mjapi' }).mode).toBe('none');
        }
        for (const value of ['on', 'true', '1', 'full', 'load']) {
            process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR] = value;
            expect(ResolveDynamicPackagesMode({ processId: 'mjapi' }).mode).toBe('load');
        }
    });

    it('reports an invalid env value and falls through instead of crashing', () => {
        process.env[DYNAMIC_PACKAGES_MODE_ENV_VAR] = 'sometimes';
        const resolved = ResolveDynamicPackagesMode({ processId: 'mjapi', policy: { mjapi: 'none' } });
        expect(resolved.mode).toBe('none');
        expect(resolved.source).toBe('policy');
        expect(resolved.ignoredInvalid).toContain("MJ_DYNAMIC_PACKAGES='sometimes'");
    });

    it('reports an invalid policy value and falls through to the default', () => {
        const resolved = ResolveDynamicPackagesMode({ processId: 'mjapi', policy: { mjapi: 'maybe' } });
        expect(resolved.mode).toBe('load');
        expect(resolved.source).toBe('default');
        expect(resolved.ignoredInvalid).toContain("'maybe'");
    });
});
