import { describe, it, expect } from 'vitest';
import { ResolvePgVectorSsl } from '../models/PgVectorDatabase.js';

const read = (path: string): string => `PEM(${path})`;

describe('ResolvePgVectorSsl', () => {
    it('uses plain TCP when PG_VECTOR_SSL is off and PG_SSL_MODE is unset', () => {
        expect(ResolvePgVectorSsl(false, {}, read)).toBe(false);
        expect(ResolvePgVectorSsl(undefined, {}, read)).toBe(false);
    });

    it('verifies the server when PG_VECTOR_SSL=true (it used to skip verification)', () => {
        expect(ResolvePgVectorSsl(true, {}, read)).toEqual({ rejectUnauthorized: true });
    });

    it('follows PG_SSL_MODE like the other MJ PostgreSQL clients', () => {
        expect(ResolvePgVectorSsl(true, { PG_SSL_MODE: 'require' }, read)).toEqual({ rejectUnauthorized: false });
        expect(ResolvePgVectorSsl(false, { PG_SSL_MODE: 'verify-full', PG_SSL_CA_FILE: '/ca.pem', PG_SSL_SERVERNAME: 'db' }, read))
            .toEqual({ rejectUnauthorized: true, ca: 'PEM(/ca.pem)', servername: 'db' });
    });

    it('rejects an unknown mode', () => {
        expect(() => ResolvePgVectorSsl(true, { PG_SSL_MODE: 'prefer' }, read)).toThrow(/expected disable, require, verify-ca or verify-full/);
    });
});
