/**
 * Generated resolvers emit SQL Server bracket-quoted identifiers; on PostgreSQL they become
 * double-quoted. Only identifiers change: brackets inside a string literal are data.
 */
import { describe, it, expect } from 'vitest';
import { TranslateBracketsToPG } from '../postgresqlCompat.js';

describe('TranslateBracketsToPG', () => {
    it('turns bracket-quoted identifiers into double-quoted ones', () => {
        expect(TranslateBracketsToPG('SELECT [ID], [Name] FROM [__mj].[vwUsers]')).toBe('SELECT "ID", "Name" FROM "__mj"."vwUsers"');
    });

    it('leaves brackets inside a string literal alone', () => {
        expect(TranslateBracketsToPG("SELECT [ID] FROM [t] WHERE [Note] = '[draft] copy'")).toBe(`SELECT "ID" FROM "t" WHERE "Note" = '[draft] copy'`);
    });

    it('unescapes ]] and escapes a double quote in the name', () => {
        expect(TranslateBracketsToPG('SELECT [a]]b], [say "hi"] FROM t')).toBe('SELECT "a]b", "say ""hi""" FROM t');
    });
});
