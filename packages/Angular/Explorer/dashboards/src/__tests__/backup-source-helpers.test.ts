import { describe, it, expect } from 'vitest';
import {
  BuildBackupUrlList,
  DeriveContainerUrl,
  FirstBackupUrl,
  FormatBytes,
} from '../Integration/services/backup-source.helpers';

describe('backup-source helpers', () => {
  describe('FormatBytes', () => {
    it('formats whole units without trailing zeros and fractions to two decimals', () => {
      expect(FormatBytes(0)).toBe('0 B');
      expect(FormatBytes(512)).toBe('512 B');
      expect(FormatBytes(2048)).toBe('2 KB');
      expect(FormatBytes(1536)).toBe('1.5 KB');
      expect(FormatBytes(1073741824)).toBe('1 GB');
      expect(FormatBytes(26628587520)).toBe('24.8 GB');
    });

    it('treats negative and non-finite input as zero', () => {
      expect(FormatBytes(-5)).toBe('0 B');
      expect(FormatBytes(Number.NaN)).toBe('0 B');
    });
  });

  describe('DeriveContainerUrl', () => {
    it('returns origin plus the container segment of a blob URL', () => {
      expect(DeriveContainerUrl('https://acct.blob.core.windows.net/backups/db.bak')).toBe('https://acct.blob.core.windows.net/backups');
      expect(DeriveContainerUrl('https://acct.blob.core.windows.net/backups/2026/db_1.bak ')).toBe('https://acct.blob.core.windows.net/backups');
    });

    it('returns undefined for a local path, a bare host, or garbage', () => {
      expect(DeriveContainerUrl('/var/opt/mssql/backup/db.bak')).toBeUndefined();
      expect(DeriveContainerUrl('https://acct.blob.core.windows.net')).toBeUndefined();
      expect(DeriveContainerUrl('https://acct.blob.core.windows.net/')).toBeUndefined();
      expect(DeriveContainerUrl('http://[bad')).toBeUndefined();
    });
  });

  describe('FirstBackupUrl', () => {
    it('returns the first trimmed entry of a comma-separated list', () => {
      expect(FirstBackupUrl(' https://a/b/1.bak , https://a/b/2.bak')).toBe('https://a/b/1.bak');
      expect(FirstBackupUrl('')).toBe('');
    });
  });

  describe('BuildBackupUrlList', () => {
    it('prefixes each blob name with the container URL, trimming trailing slashes', () => {
      expect(BuildBackupUrlList('https://acct.blob.core.windows.net/backups/', ['a.bak', 'sub/b.bak']))
        .toBe('https://acct.blob.core.windows.net/backups/a.bak, https://acct.blob.core.windows.net/backups/sub/b.bak');
    });

    it('passes names through when no container is known and yields an empty string for no names', () => {
      expect(BuildBackupUrlList('', ['a.bak'])).toBe('a.bak');
      expect(BuildBackupUrlList('https://x/c', [])).toBe('');
    });
  });
});
