import { describe, it, expect } from 'vitest';
import { SQLParser } from '../sql-parser.js';

describe('SQLParser', () => {
    describe('Parse', () => {
        it('should extract table references from a simple SELECT', () => {
            const result = SQLParser.Parse('SELECT ID, Name FROM Users WHERE Active = 1');
            expect(result.Tables.length).toBeGreaterThanOrEqual(1);
            expect(result.Tables[0].TableName).toBe('Users');
        });

        it('should extract table references from a JOIN query', () => {
            const result = SQLParser.Parse('SELECT u.ID, r.Name FROM Users u INNER JOIN Roles r ON u.RoleID = r.ID');
            expect(result.Tables.length).toBe(2);
            const tableNames = result.Tables.map(t => t.TableName).sort();
            expect(tableNames).toEqual(['Roles', 'Users']);
        });

        it('should extract schema-qualified table references', () => {
            const result = SQLParser.Parse('SELECT ID FROM __mj.AIAgentRun');
            expect(result.Tables.length).toBe(1);
            expect(result.Tables[0].TableName).toBe('AIAgentRun');
            expect(result.Tables[0].SchemaName).toBe('__mj');
        });

        it('should return empty result for empty SQL', () => {
            const result = SQLParser.Parse('');
            expect(result.Tables).toEqual([]);
            expect(result.Columns).toEqual([]);
            expect(result.UsedASTParsing).toBe(false);
        });

        it('should fall back to regex when AST parsing fails', () => {
            // SQL with Nunjucks templates that the AST parser can't handle
            const result = SQLParser.Parse("SELECT ID FROM Users {% if Active %}WHERE Active = 1{% endif %}");
            // Regex fallback should still find the table
            expect(result.Tables.length).toBeGreaterThanOrEqual(1);
            expect(result.UsedASTParsing).toBe(false);
        });

        it('should accept a dialect parameter', () => {
            const result = SQLParser.Parse('SELECT id FROM users', 'PostgresQL');
            expect(result.Tables.length).toBe(1);
        });

        it('should default to TransactSQL dialect', () => {
            const result = SQLParser.Parse('SELECT TOP 10 ID FROM Users');
            expect(result.UsedASTParsing).toBe(true);
        });
    });

    describe('ParseWithTemplatePreprocessing', () => {
        it('should parse SQL with Nunjucks templates via preprocessing', () => {
            const sql = "SELECT ID FROM Users WHERE Region = {{ Region | sqlString }}";
            const result = SQLParser.ParseWithTemplatePreprocessing(sql);
            expect(result.Tables.length).toBe(1);
            expect(result.Tables[0].TableName).toBe('Users');
        });

        it('should handle Nunjucks if/endif blocks', () => {
            const sql = `SELECT ID FROM Users
{% if Active %}
WHERE Active = 1
{% endif %}
ORDER BY Name`;
            const result = SQLParser.ParseWithTemplatePreprocessing(sql);
            expect(result.Tables.length).toBeGreaterThanOrEqual(1);
        });

        it('should accept a dialect parameter', () => {
            const result = SQLParser.ParseWithTemplatePreprocessing(
                "SELECT ID FROM Users WHERE Status = {{ Status | sqlString }}",
                'PostgresQL'
            );
            expect(result.Tables.length).toBe(1);
        });
    });
});
