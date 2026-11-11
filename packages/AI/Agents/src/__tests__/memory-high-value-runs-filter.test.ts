import { describe, it, expect } from 'vitest';
import { BuildHighValueAgentRunsFilter, MemoryFilterQuoting } from '../memory-high-value-runs-filter';

/**
 * #4435 phase 1: the memory manager's high-value-runs filter is quoted with the provider's dialect,
 * so on PostgreSQL it no longer relies on the runtime auto-quote shim to find PascalCase columns.
 */
const pg: MemoryFilterQuoting = {
    QuoteIdentifier: (n) => `"${n}"`,
    QuoteSchema: (s, o) => `${s}."${o}"`,
};
const sqlServer: MemoryFilterQuoting = {
    QuoteIdentifier: (n) => `[${n}]`,
    QuoteSchema: (s, o) => `[${s}].[${o}]`,
};

describe('BuildHighValueAgentRunsFilter', () => {
    it('quotes every column and view for PostgreSQL', () => {
        const f = BuildHighValueAgentRunsFilter(pg, '__mj', null);
        expect(f.startsWith('"ID" IN ( SELECT DISTINCT ar."ID" FROM __mj."vwAIAgentRuns" ar')).toBe(true);
        expect(f).toContain('ON ar."ConversationID" = c."ID"');
        expect(f).toContain('__mj."vwArtifactUses" au');
        expect(f).toContain(`SUM(CASE WHEN au."UsageType" = 'Shared' THEN 1 ELSE 0 END) >= 2`);
        expect(f).toContain('GROUP BY au."ArtifactVersionID"');
        // no bare PascalCase identifier is left for the shim to rewrite
        expect(f).not.toMatch(/\b(?:ar|c|cd|cda|av|au)\.[A-Za-z_]/);
    });

    it('quotes with brackets for SQL Server and uses the given core schema', () => {
        const f = BuildHighValueAgentRunsFilter(sqlServer, 'mjcore', null);
        expect(f).toContain('FROM [mjcore].[vwAIAgentRuns] ar');
        expect(f).toContain('WHERE au.[ArtifactVersionID] = av.[ID]');
    });

    it('adds a quoted since window when provided', () => {
        const f = BuildHighValueAgentRunsFilter(pg, '__mj', new Date('2026-06-01T00:00:00.000Z'));
        expect(f).toContain(`AND au."__mj_CreatedAt" >= '2026-06-01T00:00:00.000Z'`);
        expect(BuildHighValueAgentRunsFilter(pg, '__mj', null)).not.toContain('__mj_CreatedAt');
    });
});
