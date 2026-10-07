/**
 * Text filters must produce literals the platform reads back as the same text, and LIKE
 * patterns that match the value literally.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { RunQuerySQLFilterManager } from '../generic/runQuerySQLFilterImplementations';

const manager = RunQuerySQLFilterManager.Instance;

afterEach(() => manager.SetPlatform('sqlserver'));

describe('sqlString and sqlIn on SQL Server', () => {
    it('uses an N literal for text outside ASCII, so it is not lost to the code page', () => {
        manager.SetPlatform('sqlserver');
        expect(manager.executeFilter('sqlString', '日本語のメモ')).toBe("N'日本語のメモ'");
        expect(manager.executeFilter('sqlIn', ['日本語', "O'Brien", 7])).toBe("(N'日本語', 'O''Brien', 7)");
    });

    it('keeps a plain literal for ASCII text', () => {
        manager.SetPlatform('sqlserver');
        expect(manager.executeFilter('sqlString', 'Gamma')).toBe("'Gamma'");
    });

    it('never uses an N literal on PostgreSQL', () => {
        manager.SetPlatform('postgresql');
        expect(manager.executeFilter('sqlString', '日本語のメモ')).toBe("'日本語のメモ'");
        expect(manager.executeFilter('sqlIn', ['日本語'])).toBe("('日本語')");
    });
});

describe('LIKE filters match the value literally', () => {
    it('escapes [ on SQL Server, where it opens a character class', () => {
        manager.SetPlatform('sqlserver');
        expect(manager.executeFilter('sqlLikeContains', '[bracketed]')).toBe("'%[[]bracketed]%'");
        expect(manager.executeFilter('sqlLikeBegins', '[x')).toBe("'[[]x%'");
    });

    it('escapes a backslash on PostgreSQL, where it is the LIKE escape character', () => {
        manager.SetPlatform('postgresql');
        expect(manager.executeFilter('sqlLikeContains', 'a\\b')).toBe("'%a\\\\b%'");
        expect(manager.executeFilter('sqlLikeContains', '50%_off')).toBe("'%50\\%\\_off%'");
    });

    it('uses an N literal for a SQL Server pattern outside ASCII', () => {
        manager.SetPlatform('sqlserver');
        expect(manager.executeFilter('sqlLikeContains', '日本')).toBe("N'%日本%'");
    });
});
