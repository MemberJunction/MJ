/**
 * Unit tests for deterministic QueryField extraction from SELECT columns.
 *
 * Tests the BuildFieldsFromSelectColumns() function and the merge priority
 * logic that ensures deterministic fields are the PRIMARY source, with
 * LLM providing enriched descriptions as a FALLBACK.
 */
import { describe, it, expect } from 'vitest';
import { SQLParser } from '@memberjunction/sql-parser';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { BuildFieldsFromSelectColumns } from '../custom/query-extraction/resolve';
import type { ExtractedField } from '../custom/query-extraction/types';

const tsqlDialect = new SQLServerDialect();

// ═══════════════════════════════════════════════════
// BuildFieldsFromSelectColumns — deterministic extraction
// ═══════════════════════════════════════════════════

describe('BuildFieldsFromSelectColumns', () => {
    describe('Simple column lists', () => {
        it('should extract fields from SELECT col1, col2 FROM table', () => {
            const sql = 'SELECT col1, col2 FROM MyTable';
            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).not.toBeNull();
            expect(fields).toHaveLength(2);
            expect(fields![0].name).toBe('col1');
            expect(fields![0].isComputed).toBe(false);
            expect(fields![0].sourceFieldName).toBe('col1');
            expect(fields![1].name).toBe('col2');
        });

        it('should extract fields with table qualifiers', () => {
            const sql = 'SELECT t.ID, t.Name, t.Email FROM __mj.vwUsers t';
            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).not.toBeNull();
            expect(fields).toHaveLength(3);
            expect(fields![0].name).toBe('ID');
            expect(fields![0].sourceFieldName).toBe('ID');
            expect(fields![1].name).toBe('Name');
            expect(fields![2].name).toBe('Email');
        });
    });

    describe('Aliased columns', () => {
        it('should extract fields from SELECT col1 AS Alias1, col2 AS Alias2', () => {
            const sql = 'SELECT col1 AS Alias1, col2 AS Alias2 FROM MyTable';
            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).not.toBeNull();
            expect(fields).toHaveLength(2);
            expect(fields![0].name).toBe('Alias1');
            expect(fields![0].sourceFieldName).toBe('col1');
            expect(fields![0].isComputed).toBe(false);
            expect(fields![1].name).toBe('Alias2');
            expect(fields![1].sourceFieldName).toBe('col2');
        });

        it('should handle mixed aliased and non-aliased columns', () => {
            const sql = 'SELECT t.ID, t.FirstName AS Name, t.Email FROM __mj.vwUsers t';
            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).not.toBeNull();
            expect(fields).toHaveLength(3);
            expect(fields![0].name).toBe('ID');
            expect(fields![0].sourceFieldName).toBe('ID');
            expect(fields![1].name).toBe('Name');
            expect(fields![1].sourceFieldName).toBe('FirstName');
            expect(fields![2].name).toBe('Email');
        });
    });

    describe('Aggregate functions and expressions', () => {
        it('should extract fields from aggregate functions', () => {
            const sql = 'SELECT COUNT(*) AS Total, SUM(Amount) AS Revenue FROM Orders';
            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).not.toBeNull();
            expect(fields).toHaveLength(2);

            const total = fields!.find(f => f.name === 'Total');
            expect(total).toBeDefined();
            expect(total!.isComputed).toBe(true);
            expect(total!.sourceFieldName).toBeNull(); // expressions don't have a source field

            const revenue = fields!.find(f => f.name === 'Revenue');
            expect(revenue).toBeDefined();
            expect(revenue!.isComputed).toBe(true);
        });

        it('should handle MAX, MIN, AVG aggregates', () => {
            const sql = 'SELECT MAX(Score) AS HighScore, MIN(Score) AS LowScore, AVG(Score) AS AvgScore FROM Results';
            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).not.toBeNull();
            expect(fields).toHaveLength(3);
            expect(fields!.every(f => f.isComputed)).toBe(true);
        });
    });

    describe('SELECT * handling', () => {
        it('should return null for SELECT * (defers to BuildFieldsForSelectStar)', () => {
            const sql = 'SELECT * FROM Users';
            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).toBeNull();
        });

        it('should return null for SELECT t.* FROM table t', () => {
            const sql = 'SELECT t.* FROM Users t';
            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).toBeNull();
        });
    });

    describe('Nunjucks template expressions in WHERE', () => {
        it('should extract fields correctly when SQL contains Nunjucks templates', () => {
            const sql = `SELECT s.Name AS SpeakerName, s.Rating, COUNT(*) AS SessionCount
FROM Speakers s
JOIN Sessions sess ON s.ID = sess.SpeakerID
WHERE sess.Year = {{ Year | sqlNumber }}
{% if MinRating %}AND s.Rating >= {{ MinRating | sqlNumber }}{% endif %}
GROUP BY s.Name, s.Rating`;

            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).not.toBeNull();
            expect(fields).toHaveLength(3);

            expect(fields![0].name).toBe('SpeakerName');
            expect(fields![0].sourceFieldName).toBe('Name');
            expect(fields![0].isComputed).toBe(false);

            expect(fields![1].name).toBe('Rating');
            expect(fields![1].isComputed).toBe(false);

            expect(fields![2].name).toBe('SessionCount');
            expect(fields![2].isComputed).toBe(true);
        });
    });

    describe('Complex queries with JOINs', () => {
        it('should extract fields from multi-JOIN query', () => {
            const sql = `SELECT
    m.FirstName,
    m.LastName,
    mt.Name AS MembershipType,
    c.Name AS ChapterName
FROM [AssociationDemo].[vwMembers] m
LEFT JOIN [AssociationDemo].[vwMemberships] ms ON ms.MemberID = m.ID
INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
LEFT JOIN [AssociationDemo].[vwChapters] c ON m.ChapterID = c.ID`;

            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).not.toBeNull();
            expect(fields).toHaveLength(4);
            expect(fields![0].name).toBe('FirstName');
            expect(fields![1].name).toBe('LastName');
            expect(fields![2].name).toBe('MembershipType');
            expect(fields![2].sourceFieldName).toBe('Name');
            expect(fields![3].name).toBe('ChapterName');
            expect(fields![3].sourceFieldName).toBe('Name');
        });
    });

    describe('TOP N and DISTINCT', () => {
        it('should extract fields from queries with TOP N', () => {
            const sql = 'SELECT TOP 10 ID, Name, Score FROM Students ORDER BY Score DESC';
            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).not.toBeNull();
            expect(fields).toHaveLength(3);
            expect(fields![0].name).toBe('ID');
            expect(fields![1].name).toBe('Name');
            expect(fields![2].name).toBe('Score');
        });

        it('should extract fields from queries with DISTINCT', () => {
            const sql = 'SELECT DISTINCT Region, City FROM Locations';
            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).not.toBeNull();
            expect(fields).toHaveLength(2);
            expect(fields![0].name).toBe('Region');
            expect(fields![1].name).toBe('City');
        });
    });

    describe('Empty / no columns', () => {
        it('should return null for empty selectColumns', () => {
            const fields = BuildFieldsFromSelectColumns([]);
            expect(fields).toBeNull();
        });
    });

    describe('Real-world production queries', () => {
        it('should extract fields from Speaker Performance query (CASE production bug)', () => {
            const sql = `SELECT
    s.Name AS SpeakerName,
    s.Title AS SpeakerTitle,
    COUNT(DISTINCT sess.ID) AS TotalSessions,
    AVG(CAST(r.Rating AS FLOAT)) AS AvgRating,
    SUM(sess.AttendeeCount) AS TotalAttendees
FROM [CASE].[vwSpeakers] s
JOIN [CASE].[vwSessions] sess ON s.ID = sess.SpeakerID
LEFT JOIN [CASE].[vwRatings] r ON sess.ID = r.SessionID
GROUP BY s.Name, s.Title
ORDER BY AvgRating DESC`;

            const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
            const fields = BuildFieldsFromSelectColumns(selectColumns);

            expect(fields).not.toBeNull();
            expect(fields).toHaveLength(5);

            const speakerName = fields!.find(f => f.name === 'SpeakerName')!;
            expect(speakerName.sourceFieldName).toBe('Name');
            expect(speakerName.isComputed).toBe(false);

            const totalSessions = fields!.find(f => f.name === 'TotalSessions')!;
            expect(totalSessions.isComputed).toBe(true);
            expect(totalSessions.sourceFieldName).toBeNull();

            const avgRating = fields!.find(f => f.name === 'AvgRating')!;
            expect(avgRating.isComputed).toBe(true);
        });
    });
});

// ═══════════════════════════════════════════════════
// supplementDeterministicWithLLM — merge priority tests
// Re-implemented as a pure function for testing
// ═══════════════════════════════════════════════════

function supplementDeterministicWithLLM(
    deterministicFields: ExtractedField[],
    llmFields: ExtractedField[] | null
): ExtractedField[] {
    if (!llmFields || llmFields.length === 0) return deterministicFields;

    const llmByName = new Map<string, ExtractedField>();
    for (const lf of llmFields) {
        llmByName.set(lf.name.toLowerCase(), lf);
    }

    return deterministicFields.map(df => {
        const llmMatch = llmByName.get(df.name.toLowerCase());
        if (!llmMatch) return df;

        return {
            ...df,
            description: llmMatch.description || df.description,
            type: df.isComputed ? (llmMatch.type || df.type) : df.type,
            isSummary: llmMatch.isSummary ?? df.isSummary,
            computationDescription: llmMatch.computationDescription ?? df.computationDescription,
            sourceEntity: df.sourceEntity ?? llmMatch.sourceEntity,
        };
    });
}

describe('Merge Priority: Deterministic vs LLM', () => {
    it('should use deterministic fields as primary source', () => {
        const det: ExtractedField[] = [
            { name: 'ID', description: 'ID', type: 'string', optional: false, isComputed: false },
            { name: 'Name', description: 'Name', type: 'string', optional: false, isComputed: false },
        ];
        const llm: ExtractedField[] = [
            { name: 'ID', description: 'Unique identifier', type: 'string', optional: false },
            { name: 'Name', description: 'Full user name', type: 'string', optional: false },
            { name: 'HallucinatedField', description: 'Does not exist', type: 'string', optional: false },
        ];

        const result = supplementDeterministicWithLLM(det, llm);

        // Only deterministic fields survive; LLM hallucination is dropped
        expect(result).toHaveLength(2);
        expect(result.find(f => f.name === 'HallucinatedField')).toBeUndefined();
    });

    it('should supplement deterministic descriptions with LLM descriptions', () => {
        const det: ExtractedField[] = [
            { name: 'SpeakerName', description: 'Name (aliased as SpeakerName)', type: 'string', optional: false, isComputed: false },
        ];
        const llm: ExtractedField[] = [
            { name: 'SpeakerName', description: 'Full name of the speaker who presented', type: 'string', optional: false },
        ];

        const result = supplementDeterministicWithLLM(det, llm);
        expect(result[0].description).toBe('Full name of the speaker who presented');
    });

    it('should keep deterministic description when LLM has no match', () => {
        const det: ExtractedField[] = [
            { name: 'Rating', description: 'Rating', type: 'string', optional: false, isComputed: false },
        ];

        const result = supplementDeterministicWithLLM(det, []);
        expect(result[0].description).toBe('Rating');
    });

    it('should return deterministic fields unchanged when LLM is null', () => {
        const det: ExtractedField[] = [
            { name: 'ID', description: 'ID', type: 'string', optional: false, isComputed: false },
        ];

        const result = supplementDeterministicWithLLM(det, null);
        expect(result).toBe(det); // Same reference
    });

    it('should use LLM type for computed fields only', () => {
        const det: ExtractedField[] = [
            { name: 'Total', description: 'Computed column: COUNT(*)', type: 'string', optional: false, isComputed: true },
            { name: 'Name', description: 'Name', type: 'string', optional: false, isComputed: false },
        ];
        const llm: ExtractedField[] = [
            { name: 'Total', description: 'Total count', type: 'number', optional: false },
            { name: 'Name', description: 'User name', type: 'number', optional: false }, // LLM wrong about non-computed type
        ];

        const result = supplementDeterministicWithLLM(det, llm);
        expect(result[0].type).toBe('number'); // Computed: LLM type accepted
        expect(result[1].type).toBe('string'); // Non-computed: deterministic type preserved
    });

    it('should use LLM sourceEntity when deterministic has none', () => {
        const det: ExtractedField[] = [
            { name: 'SpeakerName', description: 'Name', type: 'string', optional: false, isComputed: false, sourceEntity: null },
        ];
        const llm: ExtractedField[] = [
            { name: 'SpeakerName', description: 'Speaker name', type: 'string', optional: false, sourceEntity: 'Speakers' },
        ];

        const result = supplementDeterministicWithLLM(det, llm);
        expect(result[0].sourceEntity).toBe('Speakers');
    });

    it('should not overwrite existing deterministic sourceEntity with LLM', () => {
        const det: ExtractedField[] = [
            { name: 'Name', description: 'Name', type: 'string', optional: false, isComputed: false, sourceEntity: 'Users' },
        ];
        const llm: ExtractedField[] = [
            { name: 'Name', description: 'User name', type: 'string', optional: false, sourceEntity: 'People' },
        ];

        const result = supplementDeterministicWithLLM(det, llm);
        expect(result[0].sourceEntity).toBe('Users'); // Deterministic preserved
    });

    it('should handle case-insensitive name matching between deterministic and LLM', () => {
        const det: ExtractedField[] = [
            { name: 'SpeakerName', description: 'Name', type: 'string', optional: false, isComputed: false },
        ];
        const llm: ExtractedField[] = [
            { name: 'speakername', description: 'Full speaker name from presentation data', type: 'string', optional: false },
        ];

        const result = supplementDeterministicWithLLM(det, llm);
        expect(result[0].description).toBe('Full speaker name from presentation data');
    });
});

// ═══════════════════════════════════════════════════
// Destructive null behavior — regression tests
// ═══════════════════════════════════════════════════

describe('Non-destructive field handling when extraction fails', () => {
    it('should produce non-null finalFields for explicit SELECT columns even without LLM', () => {
        // This simulates the production bug: a query with explicit columns,
        // LLM fails, and without the fix, finalFields would be null → fields deleted.
        const sql = `SELECT s.Name AS SpeakerName, COUNT(*) AS Total
FROM Speakers s GROUP BY s.Name`;

        const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
        const fields = BuildFieldsFromSelectColumns(selectColumns);

        // With the fix, deterministic extraction produces fields even without LLM
        expect(fields).not.toBeNull();
        expect(fields!.length).toBeGreaterThan(0);
    });

    it('should produce non-null fields for complex production query that previously failed', () => {
        // Simulates the "Speaker Performance And Rating Metrics" query from CASE DB
        const sql = `SELECT
    s.Name,
    s.Title,
    COUNT(DISTINCT sess.ID) AS TotalSessions,
    AVG(CAST(r.Rating AS FLOAT)) AS AvgRating,
    SUM(sess.AttendeeCount) AS TotalAttendees,
    MIN(sess.Date) AS FirstSession,
    MAX(sess.Date) AS LastSession
FROM Speakers s
JOIN Sessions sess ON s.ID = sess.SpeakerID
LEFT JOIN Ratings r ON sess.ID = r.SessionID
WHERE sess.Year >= {{ StartYear | sqlNumber }}
{% if SpeakerCategory %}AND s.Category = {{ SpeakerCategory | sqlString }}{% endif %}
GROUP BY s.Name, s.Title
ORDER BY AvgRating DESC`;

        const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
        const fields = BuildFieldsFromSelectColumns(selectColumns);

        expect(fields).not.toBeNull();
        expect(fields).toHaveLength(7);

        // Verify computed vs non-computed classification
        const computed = fields!.filter(f => f.isComputed);
        const direct = fields!.filter(f => !f.isComputed);

        expect(direct.map(f => f.name).sort()).toEqual(['Name', 'Title']);
        expect(computed.length).toBe(5); // TotalSessions, AvgRating, TotalAttendees, FirstSession, LastSession
    });
});

// ═══════════════════════════════════════════════════
// UNION ALL and subquery handling
// ═══════════════════════════════════════════════════

describe('Complex SQL patterns', () => {
    it('should extract fields from CTE-based queries', () => {
        const sql = `WITH TopSpeakers AS (
    SELECT s.Name, COUNT(*) AS SessionCount
    FROM Speakers s JOIN Sessions sess ON s.ID = sess.SpeakerID
    GROUP BY s.Name
)
SELECT Name, SessionCount FROM TopSpeakers WHERE SessionCount > 5`;

        const selectColumns = SQLParser.ExtractSelectColumns(sql, tsqlDialect);
        const fields = BuildFieldsFromSelectColumns(selectColumns);

        // Should extract from the outermost SELECT
        expect(fields).not.toBeNull();
        expect(fields!.length).toBeGreaterThanOrEqual(2);
    });
});
