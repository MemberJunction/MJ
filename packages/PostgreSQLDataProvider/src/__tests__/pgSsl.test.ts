import { describe, it, expect } from 'vitest';
import {
    BuildPgSslConfig,
    DefaultPgSslMode,
    DescribePgSsl,
    IsLocalPgHost,
    PgSslVerifiesServer,
    ResolvePgSslMode,
} from '../pgSsl.js';

const noEnv: NodeJS.ProcessEnv = {};
const fakeRead = (path: string): string => `PEM(${path})`;

describe('IsLocalPgHost', () => {
    it.each(['localhost', 'LOCALHOST', '127.0.0.1', '127.0.1.1', '::1', 'host.docker.internal', 'postgres', 'db', '', undefined])(
        'treats %s as local',
        (host) => expect(IsLocalPgHost(host)).toBe(true)
    );

    it.each(['mydb.postgres.database.azure.com', 'x.cluster-abc.us-east-1.rds.amazonaws.com', '10.0.0.5', '192.168.1.20', 'fe80::1'])(
        'treats %s as remote',
        (host) => expect(IsLocalPgHost(host)).toBe(false)
    );
});

describe('ResolvePgSslMode', () => {
    it('defaults to disable locally and verify-full remotely', () => {
        expect(DefaultPgSslMode('localhost')).toBe('disable');
        expect(DefaultPgSslMode('db.example.com')).toBe('verify-full');
    });

    it('takes the config setting over the default', () => {
        expect(ResolvePgSslMode('localhost', { Mode: 'require' }, noEnv)).toBe('require');
    });

    it('takes PG_SSL_MODE over the config setting, case-insensitively', () => {
        expect(ResolvePgSslMode('db.example.com', { Mode: 'require' }, { PG_SSL_MODE: 'DISABLE' })).toBe('disable');
    });

    it('rejects an unknown mode, naming the accepted values', () => {
        expect(() => ResolvePgSslMode('localhost', undefined, { PG_SSL_MODE: 'prefer' })).toThrow(/disable, require, verify-ca, verify-full/);
    });
});

describe('BuildPgSslConfig', () => {
    it('returns false for disable', () => {
        expect(BuildPgSslConfig('localhost', undefined, noEnv)).toBe(false);
    });

    it('does not verify the server for require', () => {
        const ssl = BuildPgSslConfig('localhost', { Mode: 'require' }, noEnv);
        expect(ssl).toEqual({ rejectUnauthorized: false });
        expect(PgSslVerifiesServer(ssl)).toBe(false);
    });

    it('verifies the chain and the host name for verify-full', () => {
        const ssl = BuildPgSslConfig('db.example.com', undefined, noEnv);
        expect(ssl).toEqual({ rejectUnauthorized: true });
        expect(PgSslVerifiesServer(ssl)).toBe(true);
    });

    it('skips only the host-name check for verify-ca', () => {
        const ssl = BuildPgSslConfig('db.example.com', { Mode: 'verify-ca' }, noEnv);
        expect(typeof ssl === 'object' && ssl?.rejectUnauthorized).toBe(true);
        expect(typeof ssl === 'object' && ssl?.checkServerIdentity?.('x', {} as never)).toBeUndefined();
    });

    it('loads the CA bundle and server name, env winning over config', () => {
        const ssl = BuildPgSslConfig(
            'db.example.com',
            { CAFile: '/config/ca.pem', ServerName: 'config-name' },
            { PG_SSL_CA_FILE: '/env/ca.pem', PG_SSL_SERVERNAME: 'env-name' },
            fakeRead
        );
        expect(ssl).toEqual({ rejectUnauthorized: true, ca: 'PEM(/env/ca.pem)', servername: 'env-name' });
    });

    it('fails clearly when the CA bundle cannot be read', () => {
        const failingRead = (): string => {
            throw new Error('ENOENT');
        };
        expect(() => BuildPgSslConfig('db.example.com', { CAFile: '/missing.pem' }, noEnv, failingRead)).toThrow(
            /Could not read the PostgreSQL CA bundle at "\/missing.pem".*ENOENT/
        );
    });
});

describe('DescribePgSsl', () => {
    it('describes each case without leaking certificate text', () => {
        expect(DescribePgSsl(false)).toBe('TLS off');
        expect(DescribePgSsl({ rejectUnauthorized: false })).toMatch(/NOT verified/);
        const described = DescribePgSsl({ rejectUnauthorized: true, ca: 'SECRET-PEM' });
        expect(described).toMatch(/verified \(custom CA bundle\)/);
        expect(described).not.toContain('SECRET-PEM');
    });
});
