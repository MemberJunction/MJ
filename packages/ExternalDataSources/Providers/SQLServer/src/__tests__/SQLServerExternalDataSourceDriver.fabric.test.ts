import { describe, it, expect } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import {
  SQLServerExternalDataSourceDriver,
  type SQLServerConnectionConfig,
  type SQLServerCredentialValues,
} from '../SQLServerExternalDataSourceDriver';

// Unit tests for Microsoft Fabric / Entra service-principal support (Workstream A). No DB needed:
// buildPoolConfig is pure, and isAuthError is exposed via the test subclass.
class TestableSQLServerDriver extends SQLServerExternalDataSourceDriver {
  public cfg(ds: MJExternalDataSourceEntity, config: SQLServerConnectionConfig, cred: { values: SQLServerCredentialValues } | null) {
    return this.buildPoolConfig(ds, config, cred);
  }
  public authErr(e: unknown): boolean {
    return this.isAuthError(e);
  }
}

const ds = (over: Partial<MJExternalDataSourceEntity> = {}): MJExternalDataSourceEntity =>
  ({ Name: 'Fabric Test', DefaultDatabase: 'MyLakehouse', ...over } as unknown as MJExternalDataSourceEntity);

// SQLServerCredentialValues has all-required string fields; fill blanks so tests set only what matters.
const creds = (over: Partial<SQLServerCredentialValues>): { values: SQLServerCredentialValues } => ({
  values: { username: '', password: '', tenantId: '', clientId: '', clientSecret: '', ...over },
});

describe('SQLServerExternalDataSourceDriver — Fabric / Entra service-principal auth', () => {
  const d = new TestableSQLServerDriver();

  describe('buildPoolConfig', () => {
    it('uses SQL auth by default (no authMode, no clientId): user/password, no authentication block', () => {
      const cfg = d.cfg(ds(), { host: 'sql.example.com', ssl: true }, creds({ username: 'sa', password: 'pw' }));
      expect(cfg.user).toBe('sa');
      expect(cfg.password).toBe('pw');
      expect(cfg.authentication).toBeUndefined();
      expect(cfg.options?.encrypt).toBe(true);
    });

    it('infers Entra mode when the credential carries a clientId (no authMode set)', () => {
      const cfg = d.cfg(ds(), { host: 'ws.datawarehouse.fabric.microsoft.com' }, creds({ tenantId: 't', clientId: 'c', clientSecret: 's' }));
      expect(cfg.authentication?.type).toBe('azure-active-directory-service-principal-secret');
      expect(cfg.user).toBeUndefined();
      expect(cfg.password).toBeUndefined();
    });

    it('honors explicit authMode=entra-service-principal and maps the SPN credential', () => {
      const cfg = d.cfg(ds(), { host: 'fabric', authMode: 'entra-service-principal' }, creds({ tenantId: 'TENANT', clientId: 'CLIENT', clientSecret: 'SECRET' }));
      expect(cfg.authentication).toEqual({
        type: 'azure-active-directory-service-principal-secret',
        options: { clientId: 'CLIENT', clientSecret: 'SECRET', tenantId: 'TENANT' },
      });
      expect(cfg.user).toBeUndefined();
    });

    it('forces encryption ON for Entra even when ssl is false (Fabric is TLS-only)', () => {
      const cfg = d.cfg(ds(), { host: 'fabric', authMode: 'entra-service-principal', ssl: false }, creds({ clientId: 'c', clientSecret: 's', tenantId: 't' }));
      expect(cfg.options?.encrypt).toBe(true);
    });

    it('respects an explicit authMode=sql even if a clientId is present, and maps DefaultDatabase', () => {
      const cfg = d.cfg(ds({ DefaultDatabase: 'DW' }), { host: 'h', authMode: 'sql' }, creds({ username: 'u', password: 'p', clientId: 'ignored' }));
      expect(cfg.database).toBe('DW');
      expect(cfg.user).toBe('u');
      expect(cfg.authentication).toBeUndefined();
    });
  });

  describe('isAuthError (Entra self-heal signatures)', () => {
    it('recognizes AADSTS error codes', () => {
      expect(d.authErr(new Error('AADSTS7000215: Invalid client secret provided.'))).toBe(true);
    });
    it('recognizes expired-token + service-principal auth-failure phrases', () => {
      expect(d.authErr(new Error('The access token is expired'))).toBe(true);
      expect(d.authErr(new Error('Failed to authenticate the service principal'))).toBe(true);
    });
    it('still honors the base auth signals (login failed / SQL Server 18456)', () => {
      expect(d.authErr(new Error('Login failed for user'))).toBe(true);
      expect(d.authErr({ code: 18456 })).toBe(true);
    });
    it('returns false for a non-auth error (must not evict+retry a normal query error)', () => {
      expect(d.authErr(new Error("Invalid object name 'dbo.missing'"))).toBe(false);
    });
  });
});
