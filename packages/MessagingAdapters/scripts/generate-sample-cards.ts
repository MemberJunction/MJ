#!/usr/bin/env npx tsx
/**
 * Generate sample Adaptive Card JSON from real agent run data in the DB.
 *
 * Usage:
 *   cd packages/MessagingAdapters
 *   npx tsx scripts/generate-sample-cards.ts
 *
 * Outputs one JSON file per agent run into scripts/sample-cards/
 * Paste any of them into https://adaptivecards.io/designer/ (host: Microsoft Teams)
 */

import sql from 'mssql';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { buildRichAdaptiveCard, buildErrorCard } from '../src/teams/teams-card-builder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'sample-cards');

// ─── DB Connection ───────────────────────────────────────────────────────────

const DB_CONFIG: sql.config = {
    server: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '1433', 10),
    database: process.env.DB_DATABASE ?? 'MJ_Local',
    user: process.env.DB_USERNAME ?? 'MJ_Connect',
    password: process.env.DB_PASSWORD ?? 'YourConnectPassword2!',
    options: {
        trustServerCertificate: true,
        encrypt: false,
    },
};

// ─── Query ───────────────────────────────────────────────────────────────────

/**
 * Pull one recent completed run per agent, preferring runs with longer messages.
 * Uses ROW_NUMBER() to pick the best run from each agent.
 */
const QUERY = `
    WITH RankedRuns AS (
        SELECT
            r.ID,
            r.Status,
            r.StartedAt,
            r.CompletedAt,
            r.Success,
            r.ErrorMessage,
            r.Result,
            r.FinalPayload,
            r.Message,
            r.TotalTokensUsed,
            r.TotalCost,
            r.TotalCostRollup,
            r.ConversationID,
            a.Name AS AgentName,
            a.LogoURL AS AgentLogoURL,
            (SELECT COUNT(*) FROM __mj.vwAIAgentRunSteps s WHERE s.AgentRunID = r.ID) AS StepCount,
            ROW_NUMBER() OVER (
                PARTITION BY a.Name
                ORDER BY LEN(ISNULL(r.Message, '')) DESC, r.CompletedAt DESC
            ) AS rn
        FROM __mj.vwAIAgentRuns r
        JOIN __mj.vwAIAgents a ON r.AgentID = a.ID
        WHERE r.Status = 'Completed'
          AND (r.Message IS NOT NULL OR r.Result IS NOT NULL)
    )
    SELECT TOP 8 *
    FROM RankedRuns
    WHERE rn = 1
    ORDER BY LEN(ISNULL(Message, '')) DESC
`;

// ─── Types for query results ─────────────────────────────────────────────────

interface AgentRunRow {
    ID: string;
    Status: string;
    StartedAt: Date;
    CompletedAt: Date | null;
    Success: boolean | null;
    ErrorMessage: string | null;
    Result: string | null;
    FinalPayload: string | null;
    Message: string | null;
    TotalTokensUsed: number | null;
    TotalCost: number | null;
    TotalCostRollup: number | null;
    ConversationID: string | null;
    AgentName: string;
    AgentLogoURL: string | null;
    StepCount: number;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('Connecting to database...');
    const pool = await sql.connect(DB_CONFIG);

    console.log('Querying recent completed agent runs...');
    const result = await pool.request().query<AgentRunRow>(QUERY);
    const rows = result.recordset;

    if (rows.length === 0) {
        console.log('No completed agent runs with messages found.');
        await pool.close();
        return;
    }

    console.log(`Found ${rows.length} agent runs. Generating cards...\n`);

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    for (const row of rows) {
        const responseText = row.Message ?? row.Result ?? '(no message)';

        // Build mock agent object matching MJAIAgentEntityExtended shape
        const agent = {
            Name: row.AgentName,
            LogoURL: row.AgentLogoURL,
        };

        // Build mock ExecuteAgentResult matching what the card builder expects
        const mockResult = {
            success: row.Success ?? true,
            payload: row.FinalPayload ? tryParseJSON(row.FinalPayload) : undefined,
            agentRun: {
                ID: row.ID,
                StartedAt: row.StartedAt,
                CompletedAt: row.CompletedAt,
                Steps: Array.from({ length: row.StepCount }, (_, i) => ({ StepNumber: i + 1 })),
                TotalTokensUsed: row.TotalTokensUsed,
                TotalCost: row.TotalCost,
                TotalCostRollup: row.TotalCostRollup,
                Message: row.Message,
                ErrorMessage: row.ErrorMessage,
            },
            // These are runtime-only and not persisted, but we can simulate empty
            actionableCommands: undefined,
            automaticCommands: undefined,
            mediaOutputs: undefined,
        };

        // Generate the rich card
        const card = buildRichAdaptiveCard(
            mockResult as never,
            agent as never,
            responseText,
            {
                explorerBaseURL: 'https://explorer.example.com',
                conversationId: row.ConversationID ?? undefined,
            }
        );

        // Also generate an error card as a sample
        const slug = sanitizeFilename(`${row.AgentName}-${row.ID.substring(0, 8)}`);
        const cardPath = path.join(OUTPUT_DIR, `${slug}.json`);
        fs.writeFileSync(cardPath, JSON.stringify(card, null, 2));

        const payloadSize = JSON.stringify(card).length;
        const bodyCount = (card.body as Record<string, unknown>[]).length;
        const actionCount = (card.actions as Record<string, unknown>[] | undefined)?.length ?? 0;

        console.log(`  ${row.AgentName} (${row.ID.substring(0, 8)}...)`);
        console.log(`    Message: ${responseText.substring(0, 80)}${responseText.length > 80 ? '...' : ''}`);
        console.log(`    Card: ${bodyCount} body elements, ${actionCount} actions, ${(payloadSize / 1024).toFixed(1)}KB`);
        console.log(`    Saved: ${cardPath}\n`);
    }

    // Generate one error card sample
    const errorCard = buildErrorCard('Agent execution failed: timeout after 60 seconds');
    const errorPath = path.join(OUTPUT_DIR, 'error-card-sample.json');
    fs.writeFileSync(errorPath, JSON.stringify(errorCard, null, 2));
    console.log(`  Error card sample saved: ${errorPath}\n`);

    console.log(`Done! Paste any JSON file into https://adaptivecards.io/designer/`);
    console.log(`Select "Microsoft Teams" as the host app to preview rendering.`);

    await pool.close();
}

function tryParseJSON(str: string): unknown {
    try {
        return JSON.parse(str);
    } catch {
        return str;
    }
}

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
