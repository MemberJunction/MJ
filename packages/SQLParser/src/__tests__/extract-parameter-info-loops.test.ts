/**
 * Regression tests for ExtractParameterInfo handling of `{% for ... in ... %}`
 * Nunjucks loops.
 *
 * Bug B from Skip-Brain query rendering triage:
 *   `ExtractParameterInfo` walks every `{{ var | filters }}` template
 *   expression and registers `var` as a query parameter. When `var` is
 *   actually a loop-local variable bound by a surrounding `{% for var in
 *   iterable %}` block, this is wrong:
 *     - The loop variable (`kw`) is NOT a parameter the caller can supply.
 *     - The iterable (`OrgKeywords`) IS a parameter, but currently goes
 *       unregistered because it appears only inside a `{% for %}` block tag.
 *
 *   The downstream effect: when the validator runs against caller-provided
 *   parameters, it reports both "Required parameter 'kw' is missing" and
 *   "Unknown parameter: 'OrgKeywords'" — even though Skip's SQL is valid.
 *
 * Source: Skip-Brain run 0FEF1C47-92DD-411C-8107-511E9CE42362, step
 *   "Create Client Query: Session Speaker Participation By Organization".
 *
 * See SKIP-QUERY-RENDERING-BUGS.md at the MJ repo root for the full
 * triage write-up.
 */
import { describe, it, expect } from 'vitest';
import { SQLParser } from '../sql-parser.js';

const extractParameterInfo = SQLParser.ExtractParameterInfo.bind(SQLParser);

// ============================================================================
// Edge case SQL strings (verbatim from Skip-Brain failures where applicable)
// ============================================================================

/**
 * Skip run 0FEF1C47 — "Session Speaker Participation By Organization".
 * Skip's Query Designer wrote this SQL; the validator rejected it.
 */
const SKIP_FOR_LOOP_OVER_ARRAY = `WITH [Target_Employees] AS (
    SELECT DISTINCT [FullName]
    FROM (
        SELECT LTRIM(RTRIM(ISNULL([FirstName], '') + ' ' + ISNULL([LastName], ''))) AS [FullName]
        FROM [ym].[vwMembers]
        WHERE (
            {% for kw in OrgKeywords %}
            [EmployerName] LIKE {{ kw | sqlLikeContains }} {% if not loop.last %}OR {% endif %}
            {% endfor %}
        )
    ) [e]
    WHERE [e].[FullName] IS NOT NULL AND [e].[FullName] <> ''
)
SELECT *
FROM [document].[vwSessions] s
WHERE YEAR(s.[Date]) >= {{ StartYear | sqlNumber }}
  AND YEAR(s.[Date]) <= {{ EndYear | sqlNumber }}`;

/** Loop variable referenced via dotted property access (loop.last). */
const FOR_LOOP_WITH_LOOP_LAST = `{% for kw in tags %}
    [Tag] = {{ kw | sqlString }} {% if not loop.last %}OR {% endif %}
{% endfor %}`;

/** Loop iterable used elsewhere too — should be registered exactly once. */
const FOR_LOOP_ITERABLE_USED_OUTSIDE = `WHERE 1 = 1
{% if MemberTypes %}
    AND [MemberTypeCode] IN (
        {% for mt in MemberTypes %}
            {{ mt | sqlString }}{% if not loop.last %}, {% endif %}
        {% endfor %}
    )
{% endif %}`;

/**
 * Mixed: loop-driven IN clause AND a separate parameter outside the loop.
 * Both `OrgKeywords` (loop iterable) and `StartYear` (outside) must be
 * registered; loop-local `kw` must NOT.
 */
const FOR_LOOP_AND_PLAIN_PARAMS = `SELECT *
FROM [Sessions] s
WHERE (
    {% for kw in OrgKeywords %}
        [EmployerName] LIKE {{ kw | sqlLikeContains }} {% if not loop.last %}OR {% endif %}
    {% endfor %}
)
AND YEAR(s.[Date]) >= {{ StartYear | sqlNumber }}`;

// ============================================================================
// Tests
// ============================================================================

describe('ExtractParameterInfo — Nunjucks {% for %} loops (Skip Bug B)', () => {
    it('registers the loop iterable as a parameter (Skip 0FEF1C47)', () => {
        const params = extractParameterInfo(SKIP_FOR_LOOP_OVER_ARRAY);
        const orgKeywords = params.find(p => p.name === 'OrgKeywords');

        expect(orgKeywords).toBeDefined();
        // Caller must provide it — the SQL has no `{% if OrgKeywords %}` guard.
        expect(orgKeywords!.isRequired).toBe(true);
        // The iterable feeds a `{% for %}` block, so it should be inferred as array.
        expect(orgKeywords!.type).toBe('array');
    });

    it('does NOT register the loop variable as a parameter (Skip 0FEF1C47)', () => {
        const params = extractParameterInfo(SKIP_FOR_LOOP_OVER_ARRAY);
        const kw = params.find(p => p.name === 'kw');
        expect(kw).toBeUndefined();
    });

    it('does NOT register loop.last / loop.* as a parameter', () => {
        const params = extractParameterInfo(FOR_LOOP_WITH_LOOP_LAST);

        // Loop-local `kw` must not leak.
        expect(params.find(p => p.name === 'kw')).toBeUndefined();

        // `loop`, `loop.last`, etc. are Nunjucks-internal — not user parameters.
        expect(params.find(p => p.name === 'loop')).toBeUndefined();
        expect(params.find(p => p.name === 'loop.last')).toBeUndefined();
        expect(params.find(p => p.name === 'loop.first')).toBeUndefined();
    });

    it('still registers the iterable when it appears only inside the {% for %} tag', () => {
        const params = extractParameterInfo(FOR_LOOP_WITH_LOOP_LAST);
        const tags = params.find(p => p.name === 'tags');
        expect(tags).toBeDefined();
        expect(tags!.type).toBe('array');
    });

    it('keeps non-loop parameters working alongside a loop iterable', () => {
        const params = extractParameterInfo(FOR_LOOP_AND_PLAIN_PARAMS);

        expect(params.find(p => p.name === 'OrgKeywords')).toBeDefined();
        expect(params.find(p => p.name === 'StartYear')).toBeDefined();

        // Loop-local must not leak.
        expect(params.find(p => p.name === 'kw')).toBeUndefined();
    });

    it('marks iterable as optional when guarded by {% if iterable %}', () => {
        const params = extractParameterInfo(FOR_LOOP_ITERABLE_USED_OUTSIDE);
        const memberTypes = params.find(p => p.name === 'MemberTypes');

        expect(memberTypes).toBeDefined();
        // `{% if MemberTypes %}` makes it optional (same convention as
        // existing condition-guarded parameters).
        expect(memberTypes!.isRequired).toBe(false);

        // Loop-local must not leak.
        expect(params.find(p => p.name === 'mt')).toBeUndefined();
    });

    it('does not double-register the iterable when used in both the for tag and elsewhere', () => {
        // FOR_LOOP_ITERABLE_USED_OUTSIDE references MemberTypes only once
        // (in the for tag and the if condition). Should appear exactly once.
        const params = extractParameterInfo(FOR_LOOP_ITERABLE_USED_OUTSIDE);
        const memberTypesCount = params.filter(p => p.name === 'MemberTypes').length;
        expect(memberTypesCount).toBe(1);
    });
});
