/**
 * TEST-INVENTORY P9: the three shipped queries #5683 names yield their output columns.
 *
 * Reads the shipped SQL from `metadata/queries/SQL/` at test time (no copy). GetAgentRunTree has no
 * PostgreSQL variant yet (TEST-INVENTORY PG1), so only its SQL Server file is read.
 *
 * Today ExtractSelectColumns returns [] for all five files: each holds a construct node-sql-parser
 * rejects (multi-column `FOR JSON PATH` subqueries, `{% if %}` blocks, `OPENJSON … WITH`, `::text`
 * casts after `json_agg`), and the [] hides the parse error.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../sql-parser.js';

const SHIPPED_SQL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../metadata/queries/SQL');

interface ShippedQuery {
    /** The query's Name in metadata. */
    Name: string;
    /** File name under metadata/queries/SQL. */
    File: string;
    Dialect: SQLParserDialect;
    /** The output columns of the statement, in order, as `OutputName`s. */
    Columns: string[];
}

const CONVERSATION_COMPLETE_COLUMNS = ['*', 'UserImageURL', 'UserImageIconClass', 'AgentRunsJSON', 'ArtifactsJSON', 'RatingsJSON'];
const MEMORY_MANAGER_COLUMNS = [
    'ConversationID', 'UserID', 'AgentRunID', 'MessagesJSON', 'HasPositiveRating', 'HasNegativeRating', 'IsUnrated',
];
/** The first branch of the UNION ALL names the output columns. */
const AGENT_RUN_TREE_COLUMNS = [
    'NodeID', 'ParentNodeID', 'Depth', 'Sequence', 'NodeType', 'Name', 'Status', 'StartedAt', 'CompletedAt',
    'DurationMs', 'Cost', 'Tokens', 'PromptTokens', 'CompletionTokens', 'SourceEntity', 'SourceKind', 'SourceID',
    'Model', 'Vendor', 'InputPayload', 'OutputPayload', 'LoopMode', 'ActionID', 'AgentID', 'CreatedAt', 'NotStarted',
];

const ss = new SQLServerDialect();
const pg = new PostgreSQLDialect();

const SHIPPED: ShippedQuery[] = [
    { Name: 'GetConversationComplete', File: 'get-conversation-complete.sql', Dialect: ss, Columns: CONVERSATION_COMPLETE_COLUMNS },
    { Name: 'GetConversationComplete', File: 'get-conversation-complete.pg.sql', Dialect: pg, Columns: CONVERSATION_COMPLETE_COLUMNS },
    { Name: 'GetConversationsForMemoryManager', File: 'get-conversations-for-memory-manager.sql', Dialect: ss, Columns: MEMORY_MANAGER_COLUMNS },
    { Name: 'GetConversationsForMemoryManager', File: 'get-conversations-for-memory-manager.pg.sql', Dialect: pg, Columns: MEMORY_MANAGER_COLUMNS },
    { Name: 'GetAgentRunTree', File: 'get-agent-run-tree.sql', Dialect: ss, Columns: AGENT_RUN_TREE_COLUMNS },
];

function readShipped(file: string): string {
    return readFileSync(resolve(SHIPPED_SQL_DIR, file), 'utf8');
}

describe('P9: shipped queries yield their output columns', () => {
    it.each(SHIPPED)('$File is readable and names each expected column (setup)', ({ File, Columns }) => {
        const sql = readShipped(File);
        for (const column of Columns.filter((c) => c !== '*')) {
            expect(sql).toMatch(new RegExp(`\\b${column}\\b`));
        }
    });

    it('reads every table of GetConversationsForMemoryManager on SQL Server (a statement the parser does extract from)', () => {
        const refs = SQLParser.ExtractTableRefs(readShipped('get-conversations-for-memory-manager.sql'), ss);
        expect(refs.map((r) => `${r.SchemaName}.${r.TableName}`).sort()).toEqual([
            '__mj.vwAIAgentRuns', '__mj.vwConversationDetailRatings', '__mj.vwConversationDetails', '__mj.vwConversations',
        ]);
    });

    // Pinned: the public extractors return columns for SQL node-sql-parser rejects (DISCUSSION §6, 2026-10-27,
    // node-sql-parser's role (2); COMPAT-MAP §1.2 ExtractSelectColumns). P9, #5683. Observed today: [] for all five files.
    it.fails.each(SHIPPED)('$Name ($File) yields its output columns', ({ File, Dialect, Columns }) => {
        const columns = SQLParser.ExtractSelectColumns(readShipped(File), Dialect);
        expect(columns.map((c) => c.OutputName)).toEqual(Columns);
    });

    // Pinned: comments never reach the text fallback, and CTE names are not tables (DISCUSSION §6, 2026-10-27;
    // COMPAT-MAP §1.2 B1–B3). P3/P1 on the shipped corpus. Observed today: words from comments as dbo tables
    // ('dbo.the', 'dbo.to', 'dbo.this', 'dbo.because', …), the CTE 'dbo.Tree', and on PostgreSQL 'dbo.__mj' for every `__mj."X"`.
    it.fails.each(SHIPPED.filter((q) => q.File !== 'get-conversations-for-memory-manager.sql'))('$Name ($File) reads only __mj views as tables', ({ File, Dialect }) => {
        const refs = SQLParser.ExtractTableRefs(readShipped(File), Dialect);
        expect(refs.length).toBeGreaterThan(0);
        expect(refs.filter((r) => r.SchemaName !== '__mj').map((r) => `${r.SchemaName}.${r.TableName}`)).toEqual([]);
    });
});
