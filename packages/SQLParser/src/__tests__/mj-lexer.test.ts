import { describe, it, expect } from 'vitest';
import { MJLexer } from '../mj-lexer.js';
import {
    MJTemplateExprContent,
    MJCompositionRefContent,
    MJBlockTagContent,
    MJCommentContent,
    MJSetContent,
    MJSQLTextContent,
} from '../mj-ast-types.js';

// ═══════════════════════════════════════════════════
// Real-world SQL queries from more-cheese and MSTA-POC
// ═══════════════════════════════════════════════════

const MEMBER_ACTIVITY_COUNTS = `WITH MemberActivities AS (
    SELECT m.ID AS MemberID, m.FirstName
    FROM [AssociationDemo].[vwMembers] m
)
SELECT *
FROM MemberActivities
{% if MinActivityCount or MembershipType %}
WHERE 1=1
  {% if MinActivityCount %}
  AND TotalActivityCount >= {{ MinActivityCount | sqlNumber }}
  {% endif %}
  {% if MembershipType %}
  AND EXISTS (
      SELECT 1 FROM [AssociationDemo].[vwMemberships] ms
      WHERE ms.MemberID = MemberActivities.MemberID
        AND mt.Name = '{{ MembershipType }}'
  )
  {% endif %}
{% endif %}
ORDER BY TotalActivityCount DESC`;

const CHAPTER_ENGAGEMENT_SUMMARY = `WITH ChapterMembers AS (
    SELECT c.ID AS ChapterID
    FROM [AssociationDemo].[vwChapters] c
    WHERE c.IsActive = 1
    {% if ChapterType %}
      AND c.ChapterType = '{{ ChapterType }}'
    {% endif %}
    {% if Region %}
      AND c.Region = '{{ Region }}'
    {% endif %}
    GROUP BY c.ID
)
SELECT * FROM ChapterMembers`;

const MEMBER_LIFETIME_REVENUE = `SELECT m.ID AS MemberID
FROM [AssociationDemo].[vwMembers] m
WHERE 1=1
{% if JoinYear %}
  AND YEAR(m.JoinDate) = {{ JoinYear | sqlNumber }}
{% endif %}
{% if MembershipType %}
  AND cm.MembershipType = '{{ MembershipType }}'
{% endif %}
ORDER BY TotalRevenue DESC`;

const EMAIL_ENGAGEMENT = `SELECT YEAR(es.SentDate) AS SendYear
FROM [AssociationDemo].[vwEmailSends] es
{% if StartDate %}
WHERE es.SentDate >= {{ StartDate | sqlDate }}
{% endif %}
{% if EndDate %}
  {% if StartDate %}
  AND es.SentDate < {{ EndDate | sqlDate }}
  {% else %}
  WHERE es.SentDate < {{ EndDate | sqlDate }}
  {% endif %}
{% endif %}
GROUP BY YEAR(es.SentDate)`;

const CTA_PRESIDENTS = `SELECT pres.FirstName, pres.LastName
FROM nams.vwUserJoiners uj
WHERE uj.Name LIKE {{ StaffMemberName | sqlString }}
ORDER BY inst.Name`;

const DISTRICT_BENEFITS = `DECLARE @co_dist_code NVARCHAR(20);
SELECT @co_dist_code = CAST(CAST(co_dist_code AS INT) AS NVARCHAR(20))
FROM common.vwOrganizations
WHERE Name = {{ DistrictName | sqlString }};
SELECT * FROM dese.vwSalary_schedules
WHERE co_dist_code = @co_dist_code AND Year = {{ CurrentYear }}`;

const EDUCATOR_COUNT = `DECLARE @co_dist_code NVARCHAR(20);
SELECT @co_dist_code = CAST(CAST(co_dist_code AS INT) AS NVARCHAR(20))
FROM common.vwOrganizations
WHERE Name = {{ DistrictName | sqlString }};
SELECT year, COUNT(*) AS Total_Educators
FROM dese.vweducators
WHERE co_dist_code = @co_dist_code
  AND CAST(year AS INT) > {{ CurrentYear }} - {{ LookbackYears }}
GROUP BY year`;

const LOWEST_SALARY = `SELECT d.description AS District_Name
FROM dese.vwSalary_schedules s
WHERE s.Year = {{ Year }}
  AND s.Sal_Bach_Min < {{ SalaryThreshold }}
ORDER BY s.Sal_Bach_Min ASC`;

const REJOINED_AFTER_LAPSE = `SELECT COUNT(DISTINCT current_mem.NU__Account__c) AS Rejoined_After_Lapse_Count
FROM nams.vwNU__Membership__cs current_mem
WHERE current_mem.Year__c = {{ CurrentYear }}
  AND NOT EXISTS (
      SELECT 1 FROM nams.vwNU__Membership__cs prior
      WHERE prior.Year__c = {{ CurrentYear }} - 1
  )
  AND EXISTS (
      SELECT 1 FROM nams.vwNU__Membership__cs older
      WHERE older.Year__c < {{ CurrentYear }} - 1
  )`;

const LAPSED_MEMBERS = `SELECT a.FirstName
FROM nams.vwAccounts a
WHERE NOT EXISTS (
    SELECT 1 FROM dese.vweducators e
    WHERE e.year = {{ Year | sqlString }}
)`;

// Composition queries
const SIMPLE_COMPOSITION = `SELECT mac.MemberID
FROM {{query:"Golden-Queries/Engagement Analytics/Member Activity Counts(MinActivityCount=MinActivityCount, MembershipType=MembershipType)"}} mac
LEFT JOIN PrimaryChapters pc ON mac.MemberID = pc.MemberID`;

const MIXED_COMPOSITION = `WITH PrimaryChapters AS (
    SELECT cm.MemberID FROM [AssociationDemo].[vwChapterMemberships] cm
    WHERE cm.Status = 'Active'
)
SELECT mac.MemberID, pc.ChapterID
FROM {{query:"Engagement Analytics/Member Activity Counts(MinActivityCount=MinActivityCount)"}} mac
LEFT JOIN PrimaryChapters pc ON mac.MemberID = pc.MemberID
{% if Region %}
WHERE pc.Region = {{ Region | sqlString }}
{% endif %}`;

// ═══════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════

describe('MJLexer', () => {
    describe('Tokenize', () => {
        it('should return empty array for empty string', () => {
            expect(MJLexer.Tokenize('')).toEqual([]);
        });

        it('should return single SQL_TEXT token for plain SQL', () => {
            const tokens = MJLexer.Tokenize('SELECT * FROM Users');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe('SQL_TEXT');
            expect(tokens[0].raw).toBe('SELECT * FROM Users');
        });

        it('should tokenize a simple template expression', () => {
            const tokens = MJLexer.Tokenize("WHERE Name = {{ Region | sqlString }}");
            expect(tokens).toHaveLength(2);

            expect(tokens[0].type).toBe('SQL_TEXT');
            expect(tokens[0].raw).toBe('WHERE Name = ');

            expect(tokens[1].type).toBe('MJ_TEMPLATE_EXPR');
            expect(tokens[1].raw).toBe('{{ Region | sqlString }}');
            const parsed = tokens[1].parsed as MJTemplateExprContent;
            expect(parsed.variable).toBe('Region');
            expect(parsed.filters).toHaveLength(1);
            expect(parsed.filters[0].name).toBe('sqlString');
        });

        it('should tokenize multiple template expressions', () => {
            const sql = "WHERE Year = {{ Year | sqlNumber }} AND Name = {{ Name | sqlString }}";
            const tokens = MJLexer.Tokenize(sql);
            const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
            expect(exprTokens).toHaveLength(2);

            const first = exprTokens[0].parsed as MJTemplateExprContent;
            expect(first.variable).toBe('Year');
            expect(first.filters[0].name).toBe('sqlNumber');

            const second = exprTokens[1].parsed as MJTemplateExprContent;
            expect(second.variable).toBe('Name');
            expect(second.filters[0].name).toBe('sqlString');
        });

        it('should tokenize a filter chain with default', () => {
            const tokens = MJLexer.Tokenize("{{ Threshold | default(5) | sqlNumber }}");
            expect(tokens).toHaveLength(1);
            const parsed = tokens[0].parsed as MJTemplateExprContent;
            expect(parsed.variable).toBe('Threshold');
            expect(parsed.filters).toHaveLength(2);
            expect(parsed.filters[0].name).toBe('default');
            expect(parsed.filters[0].args).toEqual([5]);
            expect(parsed.filters[1].name).toBe('sqlNumber');
        });

        it('should tokenize a filter with string argument', () => {
            const tokens = MJLexer.Tokenize("{{ Name | default('Unknown') }}");
            const parsed = tokens[0].parsed as MJTemplateExprContent;
            expect(parsed.filters[0].name).toBe('default');
            expect(parsed.filters[0].args).toEqual(['Unknown']);
        });

        it('should tokenize sqlIn filter', () => {
            const tokens = MJLexer.Tokenize("WHERE Status IN {{ StatusList | sqlIn }}");
            const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
            const parsed = expr.parsed as MJTemplateExprContent;
            expect(parsed.variable).toBe('StatusList');
            expect(parsed.filters[0].name).toBe('sqlIn');
        });

        it('should tokenize sqlBoolean filter', () => {
            const tokens = MJLexer.Tokenize("WHERE Active = {{ IsActive | sqlBoolean }}");
            const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
            const parsed = expr.parsed as MJTemplateExprContent;
            expect(parsed.variable).toBe('IsActive');
            expect(parsed.filters[0].name).toBe('sqlBoolean');
        });

        it('should tokenize sqlIdentifier filter', () => {
            const tokens = MJLexer.Tokenize("ORDER BY {{ SortCol | sqlIdentifier }}");
            const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
            const parsed = expr.parsed as MJTemplateExprContent;
            expect(parsed.variable).toBe('SortCol');
            expect(parsed.filters[0].name).toBe('sqlIdentifier');
        });

        it('should tokenize bare variable (no filter)', () => {
            const tokens = MJLexer.Tokenize("WHERE Year = {{ CurrentYear }}");
            const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
            const parsed = expr.parsed as MJTemplateExprContent;
            expect(parsed.variable).toBe('CurrentYear');
            expect(parsed.filters).toHaveLength(0);
        });
    });

    describe('Composition References', () => {
        it('should tokenize a simple composition reference', () => {
            const tokens = MJLexer.Tokenize('FROM {{query:"Sales/Monthly Revenue"}} r');
            const compToken = tokens.find(t => t.type === 'MJ_COMPOSITION_REF')!;
            expect(compToken).toBeDefined();

            const parsed = compToken.parsed as MJCompositionRefContent;
            expect(parsed.categoryPath).toBe('Sales');
            expect(parsed.queryName).toBe('Monthly Revenue');
            expect(parsed.parameters).toHaveLength(0);
        });

        it('should parse composition with static parameters', () => {
            const tokens = MJLexer.Tokenize(`FROM {{query:"Reports/Summary(region='West')"}} r`);
            const comp = tokens.find(t => t.type === 'MJ_COMPOSITION_REF')!;
            const parsed = comp.parsed as MJCompositionRefContent;
            expect(parsed.queryName).toBe('Summary');
            expect(parsed.parameters).toHaveLength(1);
            expect(parsed.parameters[0].key).toBe('region');
            expect(parsed.parameters[0].value).toBe('West');
            expect(parsed.parameters[0].isPassThrough).toBe(false);
        });

        it('should parse composition with pass-through parameters', () => {
            const tokens = MJLexer.Tokenize('FROM {{query:"Analytics/Counts(min=MinCount)"}} mac');
            const comp = tokens.find(t => t.type === 'MJ_COMPOSITION_REF')!;
            const parsed = comp.parsed as MJCompositionRefContent;
            expect(parsed.parameters).toHaveLength(1);
            expect(parsed.parameters[0].key).toBe('min');
            expect(parsed.parameters[0].value).toBe('MinCount');
            expect(parsed.parameters[0].isPassThrough).toBe(true);
        });

        it('should parse composition with mixed parameters', () => {
            const tokens = MJLexer.Tokenize(
                `FROM {{query:"Path/Query(a='literal', b=variable)"}} t`
            );
            const comp = tokens.find(t => t.type === 'MJ_COMPOSITION_REF')!;
            const parsed = comp.parsed as MJCompositionRefContent;
            expect(parsed.parameters).toHaveLength(2);
            expect(parsed.parameters[0]).toEqual({ key: 'a', value: 'literal', isPassThrough: false });
            expect(parsed.parameters[1]).toEqual({ key: 'b', value: 'variable', isPassThrough: true });
        });

        it('should parse multi-segment category paths', () => {
            const tokens = MJLexer.Tokenize(
                '{{query:"Golden-Queries/Engagement Analytics/Member Activity Counts(MinActivityCount=MinActivityCount, MembershipType=MembershipType)"}}'
            );
            const comp = tokens.find(t => t.type === 'MJ_COMPOSITION_REF')!;
            const parsed = comp.parsed as MJCompositionRefContent;
            expect(parsed.categoryPath).toBe('Golden-Queries/Engagement Analytics');
            expect(parsed.queryName).toBe('Member Activity Counts');
            expect(parsed.parameters).toHaveLength(2);
        });
    });

    describe('Block Tags', () => {
        it('should tokenize if/endif block', () => {
            const tokens = MJLexer.Tokenize('{% if Region %}AND Region = \'x\'{% endif %}');
            const ifToken = tokens.find(t => t.type === 'MJ_IF_OPEN')!;
            const endifToken = tokens.find(t => t.type === 'MJ_ENDIF')!;

            expect(ifToken).toBeDefined();
            expect(endifToken).toBeDefined();

            const parsed = ifToken.parsed as MJBlockTagContent;
            expect(parsed.expression).toBe('Region');
        });

        it('should tokenize if/else/endif block', () => {
            const sql = '{% if StartDate %}WHERE d >= x{% else %}WHERE 1=1{% endif %}';
            const tokens = MJLexer.Tokenize(sql);

            expect(tokens.filter(t => t.type === 'MJ_IF_OPEN')).toHaveLength(1);
            expect(tokens.filter(t => t.type === 'MJ_ELSE')).toHaveLength(1);
            expect(tokens.filter(t => t.type === 'MJ_ENDIF')).toHaveLength(1);
        });

        it('should tokenize if/elif/else/endif block', () => {
            const sql = '{% if A %}a{% elif B %}b{% else %}c{% endif %}';
            const tokens = MJLexer.Tokenize(sql);

            expect(tokens.filter(t => t.type === 'MJ_IF_OPEN')).toHaveLength(1);
            expect(tokens.filter(t => t.type === 'MJ_ELIF')).toHaveLength(1);
            expect(tokens.filter(t => t.type === 'MJ_ELSE')).toHaveLength(1);
            expect(tokens.filter(t => t.type === 'MJ_ENDIF')).toHaveLength(1);
        });

        it('should tokenize nested if blocks', () => {
            const sql = EMAIL_ENGAGEMENT;
            const tokens = MJLexer.Tokenize(sql);

            const ifTokens = tokens.filter(t => t.type === 'MJ_IF_OPEN');
            const endifTokens = tokens.filter(t => t.type === 'MJ_ENDIF');
            const elseTokens = tokens.filter(t => t.type === 'MJ_ELSE');

            // email-engagement has {% if StartDate %}, {% if EndDate %}, nested {% if StartDate %}, {% else %}
            expect(ifTokens.length).toBeGreaterThanOrEqual(3);
            expect(endifTokens.length).toBeGreaterThanOrEqual(3);
            expect(elseTokens.length).toBeGreaterThanOrEqual(1);
        });

        it('should tokenize compound condition expressions', () => {
            const tokens = MJLexer.Tokenize('{% if MinActivityCount or MembershipType %}WHERE 1=1{% endif %}');
            const ifToken = tokens.find(t => t.type === 'MJ_IF_OPEN')!;
            const parsed = ifToken.parsed as MJBlockTagContent;
            expect(parsed.expression).toBe('MinActivityCount or MembershipType');
        });

        it('should tokenize for/endfor block', () => {
            const tokens = MJLexer.Tokenize('{% for item in items %}{{ item }}{% endfor %}');
            const forToken = tokens.find(t => t.type === 'MJ_FOR_OPEN')!;
            const endforToken = tokens.find(t => t.type === 'MJ_ENDFOR')!;

            expect(forToken).toBeDefined();
            expect(endforToken).toBeDefined();

            const parsed = forToken.parsed as MJBlockTagContent;
            expect(parsed.loopVariable).toBe('item');
            expect(parsed.loopIterable).toBe('items');
        });

        it('should tokenize set block', () => {
            const tokens = MJLexer.Tokenize('{% set total = price * quantity %}');
            const setToken = tokens.find(t => t.type === 'MJ_SET')!;
            expect(setToken).toBeDefined();

            const parsed = setToken.parsed as MJSetContent;
            expect(parsed.variable).toBe('total');
            expect(parsed.expression).toBe('price * quantity');
        });
    });

    describe('Comments', () => {
        it('should tokenize template comments', () => {
            const tokens = MJLexer.Tokenize('SELECT 1 {# This is a comment #} AS Val');
            const commentToken = tokens.find(t => t.type === 'MJ_COMMENT')!;
            expect(commentToken).toBeDefined();
            const parsed = commentToken.parsed as MJCommentContent;
            expect(parsed.text).toBe('This is a comment');
        });
    });

    describe('Position Tracking', () => {
        it('should track correct start/end positions', () => {
            const sql = 'SELECT {{ Region | sqlString }} FROM t';
            const tokens = MJLexer.Tokenize(sql);

            const sqlToken1 = tokens[0];
            expect(sqlToken1.start).toBe(0);
            expect(sqlToken1.end).toBe(7);
            expect(sqlToken1.raw).toBe('SELECT ');

            const exprToken = tokens[1];
            expect(exprToken.start).toBe(7);
            expect(exprToken.end).toBe(31);
            expect(exprToken.raw).toBe('{{ Region | sqlString }}');

            const sqlToken2 = tokens[2];
            expect(sqlToken2.start).toBe(31);
            expect(sql.substring(sqlToken2.start, sqlToken2.end)).toBe(' FROM t');
        });

        it('should preserve original SQL exactly through token concatenation', () => {
            const testCases = [
                MEMBER_ACTIVITY_COUNTS,
                CHAPTER_ENGAGEMENT_SUMMARY,
                MEMBER_LIFETIME_REVENUE,
                EMAIL_ENGAGEMENT,
                CTA_PRESIDENTS,
                DISTRICT_BENEFITS,
                EDUCATOR_COUNT,
                LOWEST_SALARY,
                REJOINED_AFTER_LAPSE,
                LAPSED_MEMBERS,
                SIMPLE_COMPOSITION,
                MIXED_COMPOSITION,
            ];

            for (const sql of testCases) {
                const tokens = MJLexer.Tokenize(sql);
                const reconstructed = tokens.map(t => t.raw).join('');
                expect(reconstructed).toBe(sql);
            }
        });
    });

    describe('Parse (convenience method)', () => {
        it('should detect no MJ extensions in plain SQL', () => {
            const result = MJLexer.Parse('SELECT * FROM Users WHERE Active = 1');
            expect(result.hasMJExtensions).toBe(false);
            expect(result.hasTemplateExpressions).toBe(false);
            expect(result.hasCompositionRefs).toBe(false);
            expect(result.hasConditionalBlocks).toBe(false);
        });

        it('should detect template expressions', () => {
            const result = MJLexer.Parse('WHERE Name = {{ Name | sqlString }}');
            expect(result.hasMJExtensions).toBe(true);
            expect(result.hasTemplateExpressions).toBe(true);
        });

        it('should detect composition references', () => {
            const result = MJLexer.Parse('FROM {{query:"Sales/Revenue"}} r');
            expect(result.hasMJExtensions).toBe(true);
            expect(result.hasCompositionRefs).toBe(true);
        });

        it('should detect conditional blocks', () => {
            const result = MJLexer.Parse('{% if A %}x{% endif %}');
            expect(result.hasMJExtensions).toBe(true);
            expect(result.hasConditionalBlocks).toBe(true);
        });

        it('should detect loop blocks', () => {
            const result = MJLexer.Parse('{% for x in arr %}{{ x }}{% endfor %}');
            expect(result.hasMJExtensions).toBe(true);
            expect(result.hasLoopBlocks).toBe(true);
        });
    });

    describe('Real-world query tokenization', () => {
        it('should tokenize member-activity-counts (nested conditionals + expressions)', () => {
            const tokens = MJLexer.Tokenize(MEMBER_ACTIVITY_COUNTS);
            const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
            const ifTokens = tokens.filter(t => t.type === 'MJ_IF_OPEN');
            const endifTokens = tokens.filter(t => t.type === 'MJ_ENDIF');

            // 2 expressions: MinActivityCount, MembershipType (inside quotes, detected as separate)
            expect(exprTokens.length).toBeGreaterThanOrEqual(2);
            // 3 if blocks: outer + MinActivityCount + MembershipType
            expect(ifTokens).toHaveLength(3);
            expect(endifTokens).toHaveLength(3);
        });

        it('should tokenize chapter-engagement-summary (conditions inside CTE)', () => {
            const tokens = MJLexer.Tokenize(CHAPTER_ENGAGEMENT_SUMMARY);
            const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
            expect(exprTokens).toHaveLength(2); // ChapterType, Region
        });

        it('should tokenize email-engagement (deeply nested conditionals)', () => {
            const tokens = MJLexer.Tokenize(EMAIL_ENGAGEMENT);
            const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
            expect(exprTokens).toHaveLength(3); // StartDate, 2x EndDate
        });

        it('should tokenize district-benefits (DECLARE + multiple expressions)', () => {
            const tokens = MJLexer.Tokenize(DISTRICT_BENEFITS);
            const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
            expect(exprTokens).toHaveLength(2); // DistrictName, CurrentYear
        });

        it('should tokenize educator-count (arithmetic in expressions)', () => {
            const tokens = MJLexer.Tokenize(EDUCATOR_COUNT);
            const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
            // DistrictName, CurrentYear, LookbackYears
            expect(exprTokens).toHaveLength(3);
        });

        it('should tokenize rejoined-after-lapse (repeated variable)', () => {
            const tokens = MJLexer.Tokenize(REJOINED_AFTER_LAPSE);
            const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
            // CurrentYear appears 3 times
            expect(exprTokens).toHaveLength(3);
            const varNames = exprTokens.map(t => (t.parsed as MJTemplateExprContent).variable);
            expect(varNames.every(n => n === 'CurrentYear')).toBe(true);
        });

        it('should tokenize composition with template expressions', () => {
            const tokens = MJLexer.Tokenize(MIXED_COMPOSITION);
            const compTokens = tokens.filter(t => t.type === 'MJ_COMPOSITION_REF');
            const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
            const ifTokens = tokens.filter(t => t.type === 'MJ_IF_OPEN');

            expect(compTokens).toHaveLength(1);
            expect(exprTokens).toHaveLength(1); // Region
            expect(ifTokens).toHaveLength(1);
        });
    });

    describe('Edge Cases', () => {
        it('should handle adjacent MJ tokens with no SQL between them', () => {
            const tokens = MJLexer.Tokenize('{{ A | sqlNumber }}{{ B | sqlNumber }}');
            const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
            expect(exprTokens).toHaveLength(2);
        });

        it('should handle MJ tokens with only whitespace between them', () => {
            const tokens = MJLexer.Tokenize('{{ A }}  {{ B }}');
            expect(tokens).toHaveLength(3); // expr, whitespace, expr
        });

        it('should handle unclosed {{ gracefully', () => {
            const tokens = MJLexer.Tokenize('SELECT {{ unclosed FROM t');
            // Unclosed {{ should be treated as part of SQL text
            expect(tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR')).toHaveLength(0);
            expect(tokens.filter(t => t.type === 'SQL_TEXT')).toHaveLength(1);
        });

        it('should handle single curly braces in SQL (JSON)', () => {
            const tokens = MJLexer.Tokenize("SELECT JSON_VALUE(data, '$.name') FROM t WHERE x = {1}");
            const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
            expect(exprTokens).toHaveLength(0); // single braces are not MJ tokens
        });

        it('should handle empty {{ }} token', () => {
            const tokens = MJLexer.Tokenize('SELECT {{}} FROM t');
            const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
            expect(exprTokens).toHaveLength(1);
            const parsed = exprTokens[0].parsed as MJTemplateExprContent;
            expect(parsed.variable).toBe('');
        });

        it('should handle MJ token at very start of string', () => {
            const tokens = MJLexer.Tokenize('{{ Year | sqlNumber }}');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].type).toBe('MJ_TEMPLATE_EXPR');
            expect(tokens[0].start).toBe(0);
        });

        it('should handle MJ token at very end of string', () => {
            const sql = 'WHERE Year = {{ Year | sqlNumber }}';
            const tokens = MJLexer.Tokenize(sql);
            const last = tokens[tokens.length - 1];
            expect(last.type).toBe('MJ_TEMPLATE_EXPR');
            expect(last.end).toBe(sql.length);
        });
    });
});
