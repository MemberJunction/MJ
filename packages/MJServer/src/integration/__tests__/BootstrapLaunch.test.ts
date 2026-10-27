import { describe, it, expect } from 'vitest';
import { BuildBootstrapActionParams, ValidateBootstrapLaunchInput } from '../BootstrapLaunch';

describe('BootstrapLaunch', () => {
  describe('BuildBootstrapActionParams', () => {
    it('maps every supplied input to a string input param and adds ProgressRunID', () => {
      const params = BuildBootstrapActionParams({
        CompanyIntegrationID: 'ci-1',
        BackupUrls: 'https://acct.blob.core.windows.net/backups/db.bak',
        SasToken: 'sv=1&sig=x',
        DropStagingDbOnComplete: false,
        TruncateTargetBeforeLoad: true,
        BatchSize: 250000,
      }, 'bootstrap-123');

      const byName = Object.fromEntries(params.map(p => [p.Name, p.Value]));
      expect(byName).toEqual({
        CompanyIntegrationID: 'ci-1',
        BackupUrls: 'https://acct.blob.core.windows.net/backups/db.bak',
        SasToken: 'sv=1&sig=x',
        DropStagingDbOnComplete: 'false',
        TruncateTargetBeforeLoad: 'true',
        BatchSize: '250000',
        ProgressRunID: 'bootstrap-123',
      });
      expect(params.every(p => p.Type === 'Input')).toBe(true);
    });

    it('omits undefined and blank inputs', () => {
      const params = BuildBootstrapActionParams({ CompanyIntegrationID: 'ci-1', BackupUrls: '/b/db.bak', StagingDatabaseName: '' }, 'r');
      expect(params.map(p => p.Name)).toEqual(['CompanyIntegrationID', 'BackupUrls', 'ProgressRunID']);
    });
  });

  describe('ValidateBootstrapLaunchInput', () => {
    it('requires the company integration and the backup list', () => {
      expect(ValidateBootstrapLaunchInput({ CompanyIntegrationID: ' ', BackupUrls: '/b/db.bak' })).toContain('CompanyIntegrationID');
      expect(ValidateBootstrapLaunchInput({ CompanyIntegrationID: 'ci', BackupUrls: '' })).toContain('BackupUrls');
    });

    it('requires a token or credential only when a blob URL is present', () => {
      expect(ValidateBootstrapLaunchInput({ CompanyIntegrationID: 'ci', BackupUrls: 'https://a/b/x.bak' })).toContain('SasToken');
      expect(ValidateBootstrapLaunchInput({ CompanyIntegrationID: 'ci', BackupUrls: 'https://a/b/x.bak', StorageCredentialID: 'cred' })).toBeUndefined();
      expect(ValidateBootstrapLaunchInput({ CompanyIntegrationID: 'ci', BackupUrls: '/var/opt/mssql/backup/x.bak' })).toBeUndefined();
    });
  });
});
