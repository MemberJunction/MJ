import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { isMjDefaultSqlOutputPath, resolveSQLOutputFolder } from '../Misc/sql_logging';

describe('isMjDefaultSqlOutputPath', () => {
    it('detects MJ host v5/v6 trees', () => {
        expect(isMjDefaultSqlOutputPath('./migrations/v5/')).toBe(true);
        expect(isMjDefaultSqlOutputPath('./migrations/v5')).toBe(true);
        expect(isMjDefaultSqlOutputPath('../../migrations/v5/')).toBe(true);
        expect(isMjDefaultSqlOutputPath('/repo/MJ/migrations/v6/')).toBe(true);
    });

    it('does not treat app codegen folders as MJ defaults', () => {
        expect(isMjDefaultSqlOutputPath('./migrations/codegen')).toBe(false);
        expect(isMjDefaultSqlOutputPath('/app/migrations/codegen/')).toBe(false);
    });
});

describe('resolveSQLOutputFolder', () => {
    const appCwd = '/work/bizapps-common';
    const mjCwd = '/work/MJ';

    it('Open App cwd uses migrations/codegen and ignores MJ v5 default', () => {
        expect(resolveSQLOutputFolder({
            cwd: appCwd,
            configuredFolderPath: './migrations/v5/',
            includeSchemas: ['__mj_BizAppsCommon'],
            coreSchema: '__mj',
            hasMjAppJson: true,
            isMjMonorepo: false,
        })).toBe(path.join(appCwd, 'migrations', 'codegen'));
    });

    it('Open App honors an explicit non-MJ folderPath', () => {
        expect(resolveSQLOutputFolder({
            cwd: appCwd,
            configuredFolderPath: './audit-sql',
            hasMjAppJson: true,
            isMjMonorepo: false,
            coreSchema: '__mj',
        })).toBe(path.resolve(appCwd, './audit-sql'));
    });

    it('throws when MJ monorepo cwd generates an Open App schema', () => {
        expect(() => resolveSQLOutputFolder({
            cwd: mjCwd,
            configuredFolderPath: './migrations/v5/',
            includeSchemas: ['__mj_BizAppsCommon'],
            coreSchema: '__mj',
            hasMjAppJson: false,
            isMjMonorepo: true,
        })).toThrow(/Open App metadata SQL into the MJ repo/);
    });

    it('MJ monorepo cwd with only core includeSchemas keeps host folder', () => {
        expect(resolveSQLOutputFolder({
            cwd: mjCwd,
            configuredFolderPath: './migrations/v6/',
            includeSchemas: ['__mj'],
            coreSchema: '__mj',
            hasMjAppJson: false,
            isMjMonorepo: true,
        })).toBe(path.resolve(mjCwd, './migrations/v6/'));
    });

    it('--sql-output-dir wins on an Open App', () => {
        expect(resolveSQLOutputFolder({
            cwd: appCwd,
            hasMjAppJson: true,
            isMjMonorepo: false,
            coreSchema: '__mj',
            sqlOutputDirFlag: './migrations/codegen',
        })).toBe(path.resolve(appCwd, './migrations/codegen'));
    });
});
