import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { IsMjDefaultSqlOutputPath, ResolveSQLOutputFolder } from '../Misc/sql_logging';

describe('isMjDefaultSqlOutputPath', () => {
    it('detects MJ host v5/v6 trees', () => {
        expect(IsMjDefaultSqlOutputPath('./migrations/v5/')).toBe(true);
        expect(IsMjDefaultSqlOutputPath('./migrations/v5')).toBe(true);
        expect(IsMjDefaultSqlOutputPath('../../migrations/v5/')).toBe(true);
        expect(IsMjDefaultSqlOutputPath('/repo/MJ/migrations/v6/')).toBe(true);
    });

    it('does not treat app codegen folders as MJ defaults', () => {
        expect(IsMjDefaultSqlOutputPath('./migrations/codegen')).toBe(false);
        expect(IsMjDefaultSqlOutputPath('/app/migrations/codegen/')).toBe(false);
    });
});

describe('resolveSQLOutputFolder', () => {
    const appCwd = '/work/bizapps-common';
    const mjCwd = '/work/MJ';

    it('Open App cwd uses migrations/codegen and ignores MJ v5 default', () => {
        expect(ResolveSQLOutputFolder({
            Cwd: appCwd,
            ConfiguredFolderPath: './migrations/v5/',
            IncludeSchemas: ['__mj_BizAppsCommon'],
            CoreSchema: '__mj',
            HasMjAppJson: true,
            IsMjMonorepo: false,
        })).toBe(path.join(appCwd, 'migrations', 'codegen'));
    });

    it('Open App honors an explicit non-MJ folderPath', () => {
        expect(ResolveSQLOutputFolder({
            Cwd: appCwd,
            ConfiguredFolderPath: './audit-sql',
            HasMjAppJson: true,
            IsMjMonorepo: false,
            CoreSchema: '__mj',
        })).toBe(path.resolve(appCwd, './audit-sql'));
    });

    it('throws when MJ monorepo cwd generates an Open App schema', () => {
        expect(() => ResolveSQLOutputFolder({
            Cwd: mjCwd,
            ConfiguredFolderPath: './migrations/v5/',
            IncludeSchemas: ['__mj_BizAppsCommon'],
            CoreSchema: '__mj',
            HasMjAppJson: false,
            IsMjMonorepo: true,
        })).toThrow(/Open App metadata SQL into the MJ repo/);
    });

    it('MJ monorepo cwd with only core includeSchemas keeps host folder', () => {
        expect(ResolveSQLOutputFolder({
            Cwd: mjCwd,
            ConfiguredFolderPath: './migrations/v6/',
            IncludeSchemas: ['__mj'],
            CoreSchema: '__mj',
            HasMjAppJson: false,
            IsMjMonorepo: true,
        })).toBe(path.resolve(mjCwd, './migrations/v6/'));
    });

    it('--sql-output-dir wins on an Open App', () => {
        expect(ResolveSQLOutputFolder({
            Cwd: appCwd,
            HasMjAppJson: true,
            IsMjMonorepo: false,
            CoreSchema: '__mj',
            SqlOutputDirFlag: './migrations/codegen',
        })).toBe(path.resolve(appCwd, './migrations/codegen'));
    });
});
