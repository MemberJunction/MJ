import { describe, it, expect } from 'vitest';
import { DatabaseErrorText, RedactSecrets, REDACTED_SECRET, SasTokenSecrets, SecretSafeSqlError } from '../SecretRedaction.js';
import { CREDENTIAL_PERMISSION_DENIED, ProviderShapedSqlError } from './sqlErrorFixtures.js';

const token = 'sv=2024-01-01&sp=rl&sig=TopSecretSignatureValue%3D';

describe('SasTokenSecrets', () => {
    it('includes the token, its SQL-escaped form and each distinctive part value', () => {
        const secrets = SasTokenSecrets("a=x&sig=it'sSecretValue");
        expect(secrets).toContain("a=x&sig=it'sSecretValue");
        expect(secrets).toContain("a=x&sig=it''sSecretValue");
        expect(secrets).toContain("it'sSecretValue");
        // Short values (`x`) would match ordinary text, so they are not redacted on their own.
        expect(secrets).not.toContain('x');
    });

    it('is empty for an empty token', () => {
        expect(SasTokenSecrets('  ')).toEqual([]);
    });
});

describe('RedactSecrets', () => {
    it('replaces every occurrence, longest secret first', () => {
        const text = `a ${token} b TopSecretSignatureValue%3D c`;
        expect(RedactSecrets(text, SasTokenSecrets(token))).toBe(`a ${REDACTED_SECRET} b ${REDACTED_SECRET} c`);
    });

    it('ignores empty secrets', () => {
        expect(RedactSecrets('abc', [''])).toBe('abc');
    });
});

describe('DatabaseErrorText', () => {
    it('keeps the server text of a provider-shaped error and drops the statement and parameters', () => {
        const error = ProviderShapedSqlError(CREDENTIAL_PERMISSION_DENIED, `CREATE CREDENTIAL x WITH SECRET = N'${token}';`);
        expect(DatabaseErrorText(error)).toBe(CREDENTIAL_PERMISSION_DENIED);
    });

    it('returns any other message as it is', () => {
        expect(DatabaseErrorText(new Error('Login failed'))).toBe('Login failed');
        expect(DatabaseErrorText('plain')).toBe('plain');
    });
});

describe('SecretSafeSqlError', () => {
    it('carries the context and the server reason, never the statement or the token, and no cause', () => {
        const error = SecretSafeSqlError('Could not register', ProviderShapedSqlError(`near '${token}'`, `SECRET = N'${token}'`), SasTokenSecrets(token));
        expect(error.message).toBe(`Could not register: near '${REDACTED_SECRET}'`);
        expect(error.cause).toBeUndefined();
    });
});
