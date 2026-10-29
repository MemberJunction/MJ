import { describe, it, expect, afterEach } from 'vitest';
import {
    BackupSourcesProblem,
    BlobUrlProblem,
    DiskBackupPathProblem,
    QuoteSqlIdentifier,
    StagingDirectoryProblem,
    StorageContainerUrlProblem
} from '../BackupSourceGuard.js';

describe('StorageContainerUrlProblem', () => {
    it.each([
        'https://acct.blob.core.windows.net/backups',
        'https://myaccount.blob.core.windows.net/sql-backups',
        'https://govacct.blob.core.usgovcloudapi.net/backups',
        'https://cnacct.blob.core.chinacloudapi.cn/backups',
    ])('accepts the container URL %s', url => {
        expect(StorageContainerUrlProblem(url)).toBeUndefined();
    });

    it.each([
        ['an identifier break-out', 'x]; END; DECLARE @s nvarchar(max)=0x41; EXEC(@s); IF 1=0 BEGIN DROP CREDENTIAL [y'],
        ['a ] inside the path', 'https://acct.blob.core.windows.net/back]ups'],
        ['a quote', "https://acct.blob.core.windows.net/back'ups"],
        ['http', 'http://acct.blob.core.windows.net/backups'],
        ['a non-Azure host', 'https://attacker.example/backups'],
        ['a lookalike host', 'https://acct.blob.core.windows.net.attacker.example/backups'],
        ['an internal address', 'https://10.0.0.5/backups'],
        ['a port', 'https://acct.blob.core.windows.net:8443/backups'],
        ['user info', 'https://user:pw@acct.blob.core.windows.net/backups'],
        ['a query string', 'https://acct.blob.core.windows.net/backups?sig=x'],
        ['a fragment', 'https://acct.blob.core.windows.net/backups#x'],
        ['no container', 'https://acct.blob.core.windows.net/'],
        ['two segments', 'https://acct.blob.core.windows.net/backups/db.bak'],
        ['an invalid container name', 'https://acct.blob.core.windows.net/Back_Ups'],
        ['an invalid account', 'https://ACCT-1.blob.core.windows.net/backups'],
        ['not a URL', 'backups'],
    ])('rejects %s', (_label, url) => {
        expect(StorageContainerUrlProblem(url)).toBeDefined();
    });
});

describe('BlobUrlProblem', () => {
    it('accepts a blob inside a container', () => {
        expect(BlobUrlProblem('https://acct.blob.core.windows.net/backups/folder/db_1.bak')).toBeUndefined();
    });

    it.each([
        'https://attacker.example/c/x.bak',
        'http://acct.blob.core.windows.net/backups/db.bak',
        'https://acct.blob.core.windows.net/backups',
        'https://acct.blob.core.windows.net/backups/db.bak?sv=1&sig=secret',
        "https://acct.blob.core.windows.net/backups/db'.bak",
    ])('rejects %s', url => {
        expect(BlobUrlProblem(url)).toBeDefined();
    });
});

describe('DiskBackupPathProblem and StagingDirectoryProblem', () => {
    const savedBackupRoots = process.env.MJ_BACKUP_DISK_ROOTS;
    const savedStagingRoots = process.env.MJ_STAGING_FILE_ROOTS;

    afterEach(() => {
        if (savedBackupRoots === undefined) delete process.env.MJ_BACKUP_DISK_ROOTS; else process.env.MJ_BACKUP_DISK_ROOTS = savedBackupRoots;
        if (savedStagingRoots === undefined) delete process.env.MJ_STAGING_FILE_ROOTS; else process.env.MJ_STAGING_FILE_ROOTS = savedStagingRoots;
    });

    it('accepts local paths when no roots are configured', () => {
        delete process.env.MJ_BACKUP_DISK_ROOTS;
        expect(DiskBackupPathProblem('/var/opt/mssql/backup/x.bak')).toBeUndefined();
        expect(DiskBackupPathProblem('C:\\Backups\\db.bak')).toBeUndefined();
    });

    it.each([
        ['a UNC path', '\\\\attacker.example\\s\\x.bak'],
        ['a forward-slash UNC path', '//attacker.example/s/x.bak'],
        ['a .. segment', '/var/opt/mssql/backup/../../etc/x.bak'],
        ['a Windows .. segment', 'D:\\Backups\\..\\Payroll\\x.bak'],
        ['a quote', "/var/opt/mssql/backup/x'.bak"],
        ['a ]', '/var/opt/mssql/backup/x].bak'],
        ['a NUL', '/var/opt/mssql/backup/x\0.bak'],
    ])('rejects a disk source with %s', (_label, path) => {
        expect(DiskBackupPathProblem(path)).toBeDefined();
    });

    it('requires a disk source under a configured root', () => {
        process.env.MJ_BACKUP_DISK_ROOTS = '/var/opt/mssql/backup, D:\\Archive';
        expect(DiskBackupPathProblem('/var/opt/mssql/backup/x.bak')).toBeUndefined();
        expect(DiskBackupPathProblem('d:\\archive\\sub\\x.bak')).toBeUndefined();
        expect(DiskBackupPathProblem('/var/opt/mssql/backupother/x.bak')).toContain('MJ_BACKUP_DISK_ROOTS');
        expect(DiskBackupPathProblem('D:\\Backups\\Payroll_full.bak')).toContain('MJ_BACKUP_DISK_ROOTS');
        expect(DiskBackupPathProblem('relative/x.bak')).toContain('MJ_BACKUP_DISK_ROOTS');
    });

    it('rejects a UNC staging directory and requires a configured root when set', () => {
        delete process.env.MJ_STAGING_FILE_ROOTS;
        expect(StagingDirectoryProblem('\\\\host\\share', 'TargetDataFileDirectory')).toContain('TargetDataFileDirectory');
        expect(StagingDirectoryProblem('/var/opt/mssql/data', 'TargetDataFileDirectory')).toBeUndefined();

        process.env.MJ_STAGING_FILE_ROOTS = '/var/opt/mssql/staging';
        expect(StagingDirectoryProblem('/var/opt/mssql/staging', 'TargetDataFileDirectory')).toBeUndefined();
        expect(StagingDirectoryProblem('/var/opt/mssql/staging/a', 'TargetLogFileDirectory')).toBeUndefined();
        expect(StagingDirectoryProblem('/var/www/html', 'TargetLogFileDirectory')).toContain('MJ_STAGING_FILE_ROOTS');
    });

    it('checks every source of a striped backup', () => {
        delete process.env.MJ_BACKUP_DISK_ROOTS;
        expect(BackupSourcesProblem(['https://acct.blob.core.windows.net/backups/1.bak', 'https://attacker.example/c/2.bak'])).toBeDefined();
        expect(BackupSourcesProblem(['https://acct.blob.core.windows.net/backups/1.bak', '/var/opt/mssql/backup/2.bak'])).toBeUndefined();
    });
});

describe('QuoteSqlIdentifier', () => {
    it('brackets the name and doubles every ]', () => {
        expect(QuoteSqlIdentifier('https://acct.blob.core.windows.net/backups')).toBe('[https://acct.blob.core.windows.net/backups]');
        expect(QuoteSqlIdentifier('x]; DROP')).toBe('[x]]; DROP]');
    });
});
