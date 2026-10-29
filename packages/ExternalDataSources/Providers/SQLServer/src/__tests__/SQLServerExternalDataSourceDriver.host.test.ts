import { describe, it, expect, afterEach } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import { SetHostConnectionResolver, type HostSqlConnectionInfo } from '@memberjunction/external-data-sources';
import {
  SQLServerExternalDataSourceDriver,
  type SQLServerConnectionConfig,
  type SQLServerCredentialValues,
} from '../SQLServerExternalDataSourceDriver';

// Unit tests for authMode 'host': the driver connects with the API's own SQL Server login, resolved
// from the host connection resolver, never from a credential record. No DB needed.
class TestableSQLServerDriver extends SQLServerExternalDataSourceDriver {
  public cfg(
    ds: MJExternalDataSourceEntity,
    config: SQLServerConnectionConfig,
    cred: { values: SQLServerCredentialValues } | null,
    host?: HostSqlConnectionInfo,
  ) {
    return this.buildPoolConfig(ds, config, cred, host);
  }
  public assertAllowed(ds: MJExternalDataSourceEntity, config: SQLServerConnectionConfig): void {
    this.assertHostModeAllowed(ds, config);
  }
  public hostGuard(ds: MJExternalDataSourceEntity, config: SQLServerConnectionConfig): HostSqlConnectionInfo {
    return this.resolveHostConnectionInfo(ds, config);
  }
}

const ds = (over: Partial<MJExternalDataSourceEntity> = {}): MJExternalDataSourceEntity =>
  ({ Name: 'Host Test', DefaultDatabase: 'MJ_Staging_X', CredentialID: null, ...over } as unknown as MJExternalDataSourceEntity);

const hostInfo: HostSqlConnectionInfo = { Server: 'localhost', Port: 1433, User: 'sa', Password: 'pw', Encrypt: true, TrustServerCertificate: true };

describe('SQLServerExternalDataSourceDriver — host auth mode', () => {
  const d = new TestableSQLServerDriver();
  afterEach(() => SetHostConnectionResolver(undefined));

  describe('buildPoolConfig', () => {
    it('builds a SQL-auth pool config from host info and DefaultDatabase', () => {
      const cfg = d.cfg(ds({ DefaultDatabase: 'MJ_Staging_X' }), { authMode: 'host' }, null, hostInfo);
      expect(cfg.server).toBe('localhost');
      expect(cfg.port).toBe(1433);
      expect(cfg.database).toBe('MJ_Staging_X');
      expect(cfg.user).toBe('sa');
      expect(cfg.password).toBe('pw');
      expect(cfg.authentication).toBeUndefined();
      expect(cfg.options?.encrypt).toBe(true);
      expect(cfg.options?.trustServerCertificate).toBe(true);
    });

    it('ignores config.database in host mode', () => {
      const cfg = d.cfg(ds({ DefaultDatabase: 'MJ_Staging_X' }), { authMode: 'host', database: 'OtherDb' }, null, hostInfo);
      expect(cfg.database).toBe('MJ_Staging_X');
    });

    it('refuses to build a host pool config without a DefaultDatabase', () => {
      expect(() => d.cfg(ds({ DefaultDatabase: null }), { authMode: 'host', database: 'OtherDb' }, null, hostInfo)).toThrow(
        /host auth mode requires a DefaultDatabase/,
      );
    });

    it('carries the host instance name', () => {
      const cfg = d.cfg(ds(), { authMode: 'host' }, null, { ...hostInfo, InstanceName: 'SQLEXPRESS' });
      expect(cfg.options?.instanceName).toBe('SQLEXPRESS');
    });
  });

  describe('guard', () => {
    it('returns the resolved host info when host mode is allowed', () => {
      SetHostConnectionResolver(() => hostInfo);
      expect(d.hostGuard(ds(), { authMode: 'host' })).toEqual(hostInfo);
    });

    it('refuses host mode when the config names a host', () => {
      expect(() => d.assertAllowed(ds(), { authMode: 'host', host: 'x' })).toThrow(/host auth mode/);
      SetHostConnectionResolver(() => hostInfo);
      expect(() => d.hostGuard(ds(), { authMode: 'host', host: 'x' })).toThrow(/host auth mode/);
    });

    it('refuses host mode when the config names a server', () => {
      expect(() => d.assertAllowed(ds(), { authMode: 'host', server: 'x' })).toThrow(/host auth mode/);
    });

    it('refuses host mode when the data source has a credential', () => {
      expect(() => d.assertAllowed(ds({ CredentialID: 'CRED-1' }), { authMode: 'host' })).toThrow(/host auth mode/);
      SetHostConnectionResolver(() => hostInfo);
      expect(() => d.hostGuard(ds({ CredentialID: 'CRED-1' }), { authMode: 'host' })).toThrow(/host auth mode/);
    });

    it('refuses host mode when the data source has no DefaultDatabase', () => {
      SetHostConnectionResolver(() => hostInfo);
      expect(() => d.hostGuard(ds({ DefaultDatabase: null }), { authMode: 'host', database: 'OtherDb' })).toThrow(
        /host auth mode requires a DefaultDatabase/,
      );
      expect(() => d.assertAllowed(ds({ DefaultDatabase: '   ' }), { authMode: 'host' })).toThrow(/host auth mode requires a DefaultDatabase/);
    });

    it.each(['master', 'MODEL', 'msdb', 'TempDB'])('refuses host mode targeting the system database %s', name => {
      expect(() => d.assertAllowed(ds({ DefaultDatabase: name }), { authMode: 'host' })).toThrow(/^host auth mode refuses DefaultDatabase/);
      SetHostConnectionResolver(() => hostInfo);
      expect(() => d.hostGuard(ds({ DefaultDatabase: name }), { authMode: 'host' })).toThrow(/^host auth mode refuses DefaultDatabase .*system database/);
    });

    it("refuses host mode targeting the host's own database, case-insensitively", () => {
      SetHostConnectionResolver(() => ({ ...hostInfo, Database: 'MJ_Main' }));
      expect(() => d.hostGuard(ds({ DefaultDatabase: 'mj_main' }), { authMode: 'host' })).toThrow(
        /^host auth mode refuses DefaultDatabase 'mj_main': it is the host's own database/,
      );
      expect(d.hostGuard(ds({ DefaultDatabase: 'MJ_Staging_X' }), { authMode: 'host' })).toEqual({ ...hostInfo, Database: 'MJ_Main' });
    });

    it('refuses host mode when no resolver is registered', () => {
      expect(() => d.hostGuard(ds(), { authMode: 'host' })).toThrow(/host auth mode/);
    });

    it('refuses host mode when the resolved info lacks a user or password', () => {
      SetHostConnectionResolver(() => ({ ...hostInfo, Password: '' }));
      expect(() => d.hostGuard(ds(), { authMode: 'host' })).toThrow(/host auth mode/);
      SetHostConnectionResolver(() => ({ ...hostInfo, User: '' }));
      expect(() => d.hostGuard(ds(), { authMode: 'host' })).toThrow(/host auth mode/);
    });
  });
});
