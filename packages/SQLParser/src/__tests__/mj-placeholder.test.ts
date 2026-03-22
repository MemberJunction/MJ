import { describe, it, expect } from 'vitest';
import { MJPlaceholderSubstitution } from '../mj-placeholder.js';

describe('MJPlaceholderSubstitution', () => {
    describe('Substitute', () => {
        it('should return SQL unchanged when no MJ tokens present', () => {
            const sql = 'SELECT * FROM Users WHERE Active = 1';
            const result = MJPlaceholderSubstitution.Substitute(sql);
            expect(result.cleanSQL).toBe(sql);
            expect(result.positionMap.size).toBe(0);
            expect(result.strippedTokens).toHaveLength(0);
        });

        it('should replace sqlString expression with string placeholder', () => {
            const result = MJPlaceholderSubstitution.Substitute(
                "WHERE Name = {{ Region | sqlString }}"
            );
            expect(result.cleanSQL).toBe("WHERE Name = '__MJT_001__'");
            expect(result.positionMap.size).toBe(1);
            const entry = result.positionMap.get("'__MJT_001__'")!;
            expect(entry.context).toBe('string');
            expect(entry.originalToken.raw).toBe('{{ Region | sqlString }}');
        });

        it('should replace sqlNumber expression with numeric placeholder', () => {
            const result = MJPlaceholderSubstitution.Substitute(
                "WHERE Count >= {{ Min | sqlNumber }}"
            );
            expect(result.cleanSQL).toBe("WHERE Count >= 42001");
            expect(result.positionMap.size).toBe(1);
            const entry = result.positionMap.get('42001')!;
            expect(entry.context).toBe('number');
        });

        it('should replace sqlDate expression with string placeholder', () => {
            const result = MJPlaceholderSubstitution.Substitute(
                "WHERE Date >= {{ Start | sqlDate }}"
            );
            expect(result.cleanSQL).toContain("'__MJT_");
            const entry = Array.from(result.positionMap.values())[0];
            expect(entry.context).toBe('string');
        });

        it('should replace sqlBoolean expression with numeric placeholder', () => {
            const result = MJPlaceholderSubstitution.Substitute(
                "WHERE Active = {{ IsActive | sqlBoolean }}"
            );
            expect(result.cleanSQL).toBe("WHERE Active = 1");
            const entry = Array.from(result.positionMap.values())[0];
            expect(entry.context).toBe('boolean');
        });

        it('should replace sqlIdentifier with identifier placeholder', () => {
            const result = MJPlaceholderSubstitution.Substitute(
                "ORDER BY {{ SortCol | sqlIdentifier }}"
            );
            expect(result.cleanSQL).toBe("ORDER BY __MJI_001__");
            const entry = result.positionMap.get('__MJI_001__')!;
            expect(entry.context).toBe('identifier');
        });

        it('should replace sqlIn with IN list placeholder', () => {
            const result = MJPlaceholderSubstitution.Substitute(
                "WHERE Status IN {{ StatusList | sqlIn }}"
            );
            expect(result.cleanSQL).toContain("('__MJIN_001__')");
            const entry = Array.from(result.positionMap.values())[0];
            expect(entry.context).toBe('in_list');
        });

        it('should replace bare variable (no filter) with string placeholder', () => {
            const result = MJPlaceholderSubstitution.Substitute(
                "WHERE Year = {{ CurrentYear }}"
            );
            expect(result.cleanSQL).toContain("'__MJT_");
            const entry = Array.from(result.positionMap.values())[0];
            expect(entry.context).toBe('string');
        });

        it('should handle multiple expressions of different types', () => {
            const result = MJPlaceholderSubstitution.Substitute(
                "WHERE Year = {{ Year | sqlNumber }} AND Name = {{ Name | sqlString }}"
            );
            expect(result.positionMap.size).toBe(2);

            const entries = Array.from(result.positionMap.values());
            const contexts = entries.map(e => e.context);
            expect(contexts).toContain('number');
            expect(contexts).toContain('string');
        });

        it('should strip block tags (if/endif)', () => {
            const result = MJPlaceholderSubstitution.Substitute(
                "{% if Region %}AND Region = {{ Region | sqlString }}{% endif %}"
            );
            // Block tags should be stripped, expression should be replaced
            expect(result.cleanSQL).not.toContain('{%');
            expect(result.cleanSQL).toContain("'__MJT_001__'");
            // 3 stripped tokens: if, endif, and the expression is in positionMap
            expect(result.strippedTokens.length).toBeGreaterThanOrEqual(2);
        });

        it('should strip comments', () => {
            const result = MJPlaceholderSubstitution.Substitute(
                "SELECT 1 {# This is a comment #} AS Val"
            );
            expect(result.cleanSQL).toBe("SELECT 1  AS Val");
            expect(result.strippedTokens).toHaveLength(1);
            expect(result.strippedTokens[0].type).toBe('MJ_COMMENT');
        });

        it('should handle composition references', () => {
            const result = MJPlaceholderSubstitution.Substitute(
                'FROM {{query:"Sales/Revenue"}} r'
            );
            expect(result.cleanSQL).toContain('__MJQ_');
            expect(result.positionMap.size).toBe(1);
        });

        it('should handle real-world member-activity-counts query', () => {
            const sql = `SELECT *
FROM MemberActivities
{% if MinActivityCount or MembershipType %}
WHERE 1=1
  {% if MinActivityCount %}
  AND TotalActivityCount >= {{ MinActivityCount | sqlNumber }}
  {% endif %}
  {% if MembershipType %}
  AND Name = '{{ MembershipType }}'
  {% endif %}
{% endif %}
ORDER BY TotalActivityCount DESC`;

            const result = MJPlaceholderSubstitution.Substitute(sql);

            // Clean SQL should have no Nunjucks syntax
            expect(result.cleanSQL).not.toContain('{{');
            expect(result.cleanSQL).not.toContain('{%');
            // Should have 2 expression placeholders
            expect(result.positionMap.size).toBe(2);
            // Should have stripped block tags
            expect(result.strippedTokens.length).toBeGreaterThan(0);
        });

        it('should produce unique placeholder IDs', () => {
            const result = MJPlaceholderSubstitution.Substitute(
                "{{ A | sqlString }} {{ B | sqlString }} {{ C | sqlString }}"
            );
            const placeholders = Array.from(result.positionMap.keys());
            expect(new Set(placeholders).size).toBe(3); // all unique
        });

        it('should produce parseable SQL for node-sql-parser', () => {
            const sql = `SELECT m.FirstName
FROM [AssociationDemo].[vwMembers] m
WHERE 1=1
  AND YEAR(m.JoinDate) = {{ JoinYear | sqlNumber }}
  AND m.Status = {{ Status | sqlString }}
ORDER BY m.FirstName`;

            const result = MJPlaceholderSubstitution.Substitute(sql);

            // Verify the clean SQL can be parsed by node-sql-parser
            const NodeSqlParser = require('node-sql-parser');
            const parser = new NodeSqlParser.Parser();
            expect(() => {
                parser.astify(result.cleanSQL, { database: 'TransactSQL' });
            }).not.toThrow();
        });
    });
});
