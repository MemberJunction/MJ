/**
 * The identifier quoting a filter builder needs: a database dialect's `QuoteIdentifier` and
 * `QuoteSchema`. A provider's `Dialect` satisfies it.
 */
export interface MemoryFilterQuoting {
    QuoteIdentifier(name: string): string;
    QuoteSchema(schema: string, object: string): string;
}

/**
 * Builds the `ExtraFilter` that selects agent runs whose conversations produced high-usage artifacts
 * (shared at least twice, or used at least five times), optionally since a point in time.
 *
 * Every identifier is quoted with the provider's dialect. The previous text was bare PascalCase,
 * which PostgreSQL folds to lowercase, so it only worked because the runtime auto-quote shim
 * rewrote it; the shim is being retired (#4435), and this filter no longer depends on it.
 */
export function BuildHighValueAgentRunsFilter(q: MemoryFilterQuoting, coreSchema: string, since: Date | null): string {
    const id = (name: string): string => q.QuoteIdentifier(name);
    const col = (alias: string, name: string): string => `${alias}.${id(name)}`;
    const view = (name: string): string => q.QuoteSchema(coreSchema, name);
    const sinceFilter = since ? `AND ${col('au', '__mj_CreatedAt')} >= '${since.toISOString()}'` : '';

    return `
        ${id('ID')} IN (
            SELECT DISTINCT ${col('ar', 'ID')}
            FROM ${view('vwAIAgentRuns')} ar
            INNER JOIN ${view('vwConversations')} c ON ${col('ar', 'ConversationID')} = ${col('c', 'ID')}
            INNER JOIN ${view('vwConversationDetails')} cd ON ${col('cd', 'ConversationID')} = ${col('c', 'ID')}
            INNER JOIN ${view('vwConversationDetailArtifacts')} cda ON ${col('cda', 'ConversationDetailID')} = ${col('cd', 'ID')}
            INNER JOIN ${view('vwArtifactVersions')} av ON ${col('av', 'ID')} = ${col('cda', 'ArtifactVersionID')}
            WHERE EXISTS (
                SELECT 1
                FROM ${view('vwArtifactUses')} au
                WHERE ${col('au', 'ArtifactVersionID')} = ${col('av', 'ID')}
                ${sinceFilter}
                GROUP BY ${col('au', 'ArtifactVersionID')}
                HAVING (
                    SUM(CASE WHEN ${col('au', 'UsageType')} = 'Shared' THEN 1 ELSE 0 END) >= 2
                    OR COUNT(*) >= 5
                )
            )
        )
    `.trim().replace(/\s+/g, ' ');
}
