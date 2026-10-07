/**
 * Unit tests for the object-key canonicalizer and the key-safety rule the storage access checks use (ObjectKeys.ts),
 * and for S3's prefix-aware override of `FileStorageBase.NormalizeObjectKey`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IsSafeStorageObjectKey, NormalizeStorageObjectKey } from '../generic/ObjectKeys';
import { AWSFileStorage } from '../drivers/AWSFileStorage';

describe('NormalizeStorageObjectKey', () => {
    it('strips leading and trailing slashes, collapses repeated slashes and trims, keeping case', () => {
        expect(NormalizeStorageObjectKey('/hr/secret.pdf')).toBe('hr/secret.pdf');
        expect(NormalizeStorageObjectKey('hr/secret.pdf/')).toBe('hr/secret.pdf');
        expect(NormalizeStorageObjectKey('//hr///Secret.PDF//')).toBe('hr/Secret.PDF');
        expect(NormalizeStorageObjectKey('  hr/secret.pdf  ')).toBe('hr/secret.pdf');
    });

    it('maps the root to the empty string', () => {
        expect(NormalizeStorageObjectKey('/')).toBe('');
        expect(NormalizeStorageObjectKey('')).toBe('');
    });

    it('keeps whitespace-only and interior segments exactly as the regex form did', () => {
        expect(NormalizeStorageObjectKey('/ /a')).toBe(' /a');
        expect(NormalizeStorageObjectKey('a/ b /c')).toBe('a/ b /c');
        expect(NormalizeStorageObjectKey('/')).toBe('');
    });

    it('handles a key made of long runs of slashes quickly', () => {
        const hostile = '/'.repeat(200_000) + 'x' + '/'.repeat(200_000) + 'y';
        const started = Date.now();
        expect(NormalizeStorageObjectKey(hostile)).toBe('x/y');
        expect(Date.now() - started).toBeLessThan(1_000);
    });
});

describe('IsSafeStorageObjectKey', () => {
    it.each([
        ['a .. segment', 'hr/../payroll/x.pdf'],
        ['a leading .. segment', '../x.pdf'],
        ['a . segment', 'hr/./x.pdf'],
        ['a backslash', 'hr\\x.pdf'],
        ['an encoded slash', 'hr%2Fx.pdf'],
        ['an encoded backslash', 'hr%5cx.pdf'],
        ['an encoded dot segment', 'hr/%2E%2E/x.pdf'],
        ['an encoded control character', 'hr/x%00.pdf'],
        ['a raw control character', 'hr/x\u0007.pdf'],
    ])('refuses %s', (_label, key) => {
        expect(IsSafeStorageObjectKey(key)).toBe(false);
    });

    it.each([
        ['an ordinary key', 'hr/secret.pdf'],
        ['dots inside a name', 'hr/v1..2/report.v2.pdf'],
        ['a literal percent sign', 'offers/50% off.pdf'],
        ['an encoded space', 'a%20b.txt'],
        ['a leading slash', '/hr/secret.pdf'],
        ['the root', ''],
    ])('accepts %s', (_label, key) => {
        expect(IsSafeStorageObjectKey(key)).toBe(true);
    });
});

describe('AWSFileStorage.NormalizeObjectKey — the key relative to the configured prefix, as the driver addresses it', () => {
    const saved: Record<string, string | undefined> = {};
    const env: Record<string, string> = {
        STORAGE_AWS_REGION: 'us-east-1',
        STORAGE_AWS_BUCKET_NAME: 'unit-test-bucket',
        STORAGE_AWS_ACCESS_KEY_ID: 'AKIA_TEST',
        STORAGE_AWS_SECRET_ACCESS_KEY: 'secret_test',
    };

    beforeEach(() => {
        for (const name of [...Object.keys(env), 'STORAGE_AWS_KEY_PREFIX']) saved[name] = process.env[name];
        Object.assign(process.env, env);
    });

    afterEach(() => {
        for (const [name, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    });

    function driverWithPrefix(prefix: string | undefined): AWSFileStorage {
        if (prefix === undefined) delete process.env.STORAGE_AWS_KEY_PREFIX;
        else process.env.STORAGE_AWS_KEY_PREFIX = prefix;
        return new AWSFileStorage();
    }

    it('default prefix "/": with or without a leading slash is the same object', () => {
        const s3 = driverWithPrefix(undefined);
        expect(s3.NormalizeObjectKey('hr/secret.pdf')).toBe('hr/secret.pdf');
        expect(s3.NormalizeObjectKey('/hr/secret.pdf')).toBe('hr/secret.pdf');
        expect(s3.NormalizeObjectKey('hr/secret.pdf/')).toBe('hr/secret.pdf');
        s3.Dispose();
    });

    it('custom prefix: the prefixed spelling is the same object as the bare one', () => {
        const s3 = driverWithPrefix('tenant1/');
        expect(s3.NormalizeObjectKey('tenant1/hr/secret.pdf')).toBe('hr/secret.pdf');
        expect(s3.NormalizeObjectKey('hr/secret.pdf')).toBe('hr/secret.pdf');
        // The driver keeps a key that already starts with the prefix, but prefixes '/tenant1/...' again — a different object.
        expect(s3.NormalizeObjectKey('/tenant1/hr/secret.pdf')).toBe('tenant1/hr/secret.pdf');
        s3.Dispose();
    });
});
