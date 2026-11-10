import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    BaseAgent,
    type ActionResultSummary,
    type ResolvedActionExpirationConfig,
} from '../base-agent';
import { ArtifactToolManager } from '../ArtifactToolManager';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineBase, type ActionParam, type MJActionEntityExtended } from '@memberjunction/actions-base';
import type { MJAIAgentActionEntity, MJActionEntity_IActionConfiguration } from '@memberjunction/core-entities';
import type { AgentChatMessage, AgentChatMessageMetadata, ExecuteAgentParams } from '@memberjunction/ai-core-plus';

/**
 * Exposes protected BaseAgent lifecycle helpers for focused unit testing without unsafe casts.
 */
class UnifiedActionPathwayProbeAgent extends BaseAgent {
    public ResolveExpiration(
        actionEntity: MJActionEntityExtended | undefined,
        agentId: string,
        params?: ExecuteAgentParams
    ): ResolvedActionExpirationConfig | undefined {
        return this.resolveActionExpirationConfig(actionEntity, agentId, params);
    }

    public ResolveMaxExecutions(actionEntity: MJActionEntityExtended, agentId: string): number | null {
        return this.resolveActionMaxExecutionsPerRun(actionEntity, agentId);
    }

    public RegisterOutputs(
        actionName: string,
        actionEntity: MJActionEntityExtended | undefined,
        outputParams: ActionParam[],
        message: string | undefined,
        stepNumber: number,
        expirationConfig?: ResolvedActionExpirationConfig
    ): string[] {
        return this.registerActionOutputArtifacts(
            actionName,
            actionEntity,
            outputParams,
            message,
            stepNumber,
            expirationConfig
        );
    }

    public FormatMarkdown(summaries: ActionResultSummary[]): string {
        return this.formatActionResultsAsMarkdown(summaries);
    }

    public Compact(
        message: AgentChatMessage,
        metadata: {
            compactMode: 'First N Chars' | 'AI Summary';
            compactLength: number;
            compactPromptId: string;
            originalLength: number;
        },
        params: ExecuteAgentParams
    ): Promise<string> {
        return this.compactMessage(message, metadata, params);
    }

    public GetArtifactManager(): ArtifactToolManager {
        return (this as unknown as { _artifactToolManager: ArtifactToolManager })._artifactToolManager;
    }

    public ResolveLoopMetadata(params: ExecuteAgentParams, actionName?: string): AgentChatMessageMetadata {
        return (
            this as unknown as {
                resolveLoopExpirationMetadata(p: ExecuteAgentParams, name?: string): AgentChatMessageMetadata;
            }
        ).resolveLoopExpirationMetadata(params, actionName);
    }
}

function makeActionEntity(
    id: string,
    name: string,
    config?: MJActionEntity_IActionConfiguration,
    defaultCompactPromptId?: string
): MJActionEntityExtended {
    return {
        ID: id,
        Name: name,
        Config_: config ? JSON.stringify(config) : null,
        Config_Object: config ?? null,
        DefaultCompactPromptID: defaultCompactPromptId ?? null,
    } as Partial<MJActionEntityExtended> as MJActionEntityExtended;
}

describe('Unified skill & direct action expiration, compaction, and artifact history toolchain (#6395)', () => {
    const SAGE_AGENT_ID = '55499C80-7596-46A9-9A91-B90B1A69A006';
    const RUN_ADHOC_QUERY_ID = '4B92BDED-4AD6-497A-B16E-BAE85BAB7563';

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('resolveActionExpirationConfig', () => {
        it('resolves expiration and compaction settings from Action.Config_Object when an action comes from a Skill (no AIAgentAction row)', () => {
            const agent = new UnifiedActionPathwayProbeAgent();
            vi.spyOn(AIEngine.Instance, 'AgentActions', 'get').mockReturnValue([]);

            const adhocQueryAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
                resultExpirationTurns: 1,
                resultExpirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
            });

            const resolved = agent.ResolveExpiration(adhocQueryAction, SAGE_AGENT_ID);
            expect(resolved).toEqual({
                expirationTurns: 1,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
                compactPromptId: undefined,
            });
        });

        it('parses raw Config_ JSON strings when Config_Object is not pre-hydrated', () => {
            const agent = new UnifiedActionPathwayProbeAgent();
            vi.spyOn(AIEngine.Instance, 'AgentActions', 'get').mockReturnValue([]);

            const rawOnlyAction = {
                ID: RUN_ADHOC_QUERY_ID,
                Name: 'Run Ad-hoc Query',
                Config_: JSON.stringify({
                    resultExpirationTurns: 2,
                    resultExpirationMode: 'Remove',
                }),
                Config_Object: null,
            } as Partial<MJActionEntityExtended> as MJActionEntityExtended;

            const resolved = agent.ResolveExpiration(rawOnlyAction, SAGE_AGENT_ID);
            expect(resolved).toEqual({
                expirationTurns: 2,
                expirationMode: 'Remove',
                compactMode: undefined,
                compactLength: undefined,
                compactPromptId: undefined,
            });
        });

        it('allows an active per-agent AIAgentAction row with ResultExpirationTurns to override Action.Config_Object while inheriting unset compact fields', () => {
            const agent = new UnifiedActionPathwayProbeAgent();
            const adhocQueryAction = makeActionEntity(
                RUN_ADHOC_QUERY_ID,
                'Run Ad-hoc Query',
                {
                    resultExpirationTurns: 1,
                    resultExpirationMode: 'Compact',
                    compactMode: 'First N Chars',
                    compactLength: 2000,
                },
                'DEFAULT-PROMPT-ID'
            );

            // Agent row overrides turns to 3, leaves CompactLength null so it inherits 2000 from Action.Config
            vi.spyOn(AIEngine.Instance, 'AgentActions', 'get').mockReturnValue([
                {
                    AgentID: SAGE_AGENT_ID,
                    ActionID: RUN_ADHOC_QUERY_ID,
                    Status: 'Active',
                    ResultExpirationTurns: 3,
                    ResultExpirationMode: 'Compact',
                    CompactMode: null,
                    CompactLength: null,
                    CompactPromptID: null,
                } as Partial<MJAIAgentActionEntity> as MJAIAgentActionEntity,
            ]);

            const resolved = agent.ResolveExpiration(adhocQueryAction, SAGE_AGENT_ID);
            expect(resolved).toEqual({
                expirationTurns: 3,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
                compactPromptId: 'DEFAULT-PROMPT-ID',
            });
        });

        it('falls back to Action.Config_Object when an AIAgentAction row exists but leaves ResultExpirationTurns null', () => {
            const agent = new UnifiedActionPathwayProbeAgent();
            const adhocQueryAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
                resultExpirationTurns: 1,
                resultExpirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
            });

            vi.spyOn(AIEngine.Instance, 'AgentActions', 'get').mockReturnValue([
                {
                    AgentID: SAGE_AGENT_ID,
                    ActionID: RUN_ADHOC_QUERY_ID,
                    Status: 'Active',
                    ResultExpirationTurns: null,
                    ResultExpirationMode: 'None',
                } as Partial<MJAIAgentActionEntity> as MJAIAgentActionEntity,
            ]);

            const resolved = agent.ResolveExpiration(adhocQueryAction, SAGE_AGENT_ID);
            expect(resolved).toEqual({
                expirationTurns: 1,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
                compactPromptId: undefined,
            });
        });

        it('gives ExecuteAgentParams.messageExpirationOverride highest precedence over both AIAgentAction and Action.Config', () => {
            const agent = new UnifiedActionPathwayProbeAgent();
            const adhocQueryAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
                resultExpirationTurns: 1,
                resultExpirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
            });

            const params = {
                messageExpirationOverride: {
                    expirationTurns: 0,
                    expirationMode: 'Remove',
                },
            } as Partial<ExecuteAgentParams> as ExecuteAgentParams;

            const resolved = agent.ResolveExpiration(adhocQueryAction, SAGE_AGENT_ID, params);
            expect(resolved).toEqual({
                expirationTurns: 0,
                expirationMode: 'Remove',
                compactMode: undefined,
                compactLength: undefined,
                compactPromptId: undefined,
            });
        });
    });

    describe('resolveLoopExpirationMetadata & resolveActionMaxExecutionsPerRun', () => {
        it('resolves ForEach/While loop expiration metadata from Action.Config when the action is provided via a Skill', () => {
            const agent = new UnifiedActionPathwayProbeAgent();
            const adhocQueryAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
                resultExpirationTurns: 1,
                resultExpirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
            });

            vi.spyOn(AIEngine.Instance, 'AgentActions', 'get').mockReturnValue([]);
            vi.spyOn(ActionEngineBase.Instance, 'Actions', 'get').mockReturnValue([adhocQueryAction]);

            const params = {
                agent: { ID: SAGE_AGENT_ID, Name: 'Sage' },
            } as Partial<ExecuteAgentParams> as ExecuteAgentParams;

            const metadata = agent.ResolveLoopMetadata(params, 'Run Ad-hoc Query');
            expect(metadata).toMatchObject({
                messageType: 'loop-result',
                expirationTurns: 1,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
            });
        });

        it('resolves maxExecutionsPerRun from Action.Config when no AIAgentAction row limit is set', () => {
            const agent = new UnifiedActionPathwayProbeAgent();
            vi.spyOn(AIEngine.Instance, 'AgentActions', 'get').mockReturnValue([]);

            const limitedAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
                maxExecutionsPerRun: 5,
            });
            expect(agent.ResolveMaxExecutions(limitedAction, SAGE_AGENT_ID)).toBe(5);
        });
    });

    describe('registerActionOutputArtifacts and post-compaction history tool querying', () => {
        it('registers tabular skill-action outputs in ArtifactToolManager and keeps full rows queryable after First N Chars compaction', async () => {
            const agent = new UnifiedActionPathwayProbeAgent();
            const adhocQueryAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
                resultExpirationTurns: 1,
                resultExpirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
            });
            const expirationConfig = agent.ResolveExpiration(adhocQueryAction, SAGE_AGENT_ID);

            const rows = Array.from({ length: 50 }, (_, i) => ({
                RowNum: i + 1,
                CustomerName: `Customer ${i + 1}`,
                Category: i % 2 === 0 ? 'Enterprise' : 'SMB',
                Revenue: (i + 1) * 1000,
            }));
            const csvLines = ['"RowNum","CustomerName","Category","Revenue"'];
            for (const r of rows) {
                csvLines.push(`"${r.RowNum}","${r.CustomerName}","${r.Category}","${r.Revenue}"`);
            }
            const formattedCsv = csvLines.join('\n');

            const outputParams: ActionParam[] = [
                { Name: 'Results', Type: 'Output', Value: rows },
                { Name: 'FormattedResults', Type: 'Output', Value: formattedCsv },
                {
                    Name: 'Columns',
                    Type: 'Output',
                    Value: [
                        { ColumnName: 'RowNum', DataType: 'int' },
                        { ColumnName: 'CustomerName', DataType: 'nvarchar' },
                        { ColumnName: 'Category', DataType: 'nvarchar' },
                        { ColumnName: 'Revenue', DataType: 'float' },
                    ],
                },
                { Name: 'RowCount', Type: 'Output', Value: rows.length },
            ];

            // Register outputs on the unified action pathway
            const artifactIds = agent.RegisterOutputs(
                'Run Ad-hoc Query',
                adhocQueryAction,
                outputParams,
                `# Query Results\n\n${formattedCsv}`,
                1,
                expirationConfig
            );

            // Should deduplicate Results + FormattedResults + Message into a single Data Snapshot artifact 'A'
            expect(artifactIds).toEqual(['A']);
            const manager = agent.GetArtifactManager();
            expect(manager.HasArtifacts()).toBe(true);
            expect(manager.ToManifestString()).toContain('**A** — Data Snapshot: "Run Ad-hoc Query — Results (Step 1)"');

            // Format markdown summary and verify artifact handle is surfaced
            const summaryMarkdown = agent.FormatMarkdown([
                {
                    actionName: 'Run Ad-hoc Query',
                    success: true,
                    params: outputParams,
                    resultCode: 'SUCCESS',
                    message: `# Query Results\n\n${formattedCsv}`,
                    artifactIds,
                },
            ]);
            expect(summaryMarkdown).toContain('**Artifact Handle(s):** `A`');

            // Simulate turn expiration & compaction (First N Chars = 200 chars for test brevity)
            const messageToCompact: AgentChatMessage = {
                role: 'user',
                content: summaryMarkdown,
                metadata: {
                    turnAdded: 1,
                    messageType: 'action-result',
                    expirationTurns: 1,
                    expirationMode: 'Compact',
                    compactMode: 'First N Chars',
                    compactLength: 200,
                    artifactIds,
                },
            };
            const dummyParams = {
                agent: { ID: SAGE_AGENT_ID, Name: 'Sage' },
            } as Partial<ExecuteAgentParams> as ExecuteAgentParams;

            const compactedText = await agent.Compact(
                messageToCompact,
                {
                    compactMode: 'First N Chars',
                    compactLength: 200,
                    compactPromptId: '',
                    originalLength: summaryMarkdown.length,
                },
                dummyParams
            );

            expect(compactedText.length).toBeLessThan(450);
            expect(compactedText).toContain('Full output remains queryable via artifact tools on Artifact A.');

            // Verify the agent can still iterate, seek, filter, and aggregate all 50 rows via Artifact A!
            const pageCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'get_rows',
                input: { table: 'Results', start: 45, count: 5 },
            });
            expect(pageCall.result.success).toBe(true);
            expect(pageCall.result.data).toHaveLength(5);
            expect((pageCall.result.data as Array<Record<string, unknown>>)[4].CustomerName).toBe('Customer 50');

            // Also works when table name is omitted on a single-table action output snapshot
            const searchCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'search_rows',
                input: { field: 'CustomerName', operator: 'eq', value: 'Customer 42' },
            });
            expect(searchCall.result.success).toBe(true);
            expect((searchCall.result.data as { rows: Array<Record<string, unknown>> }).rows).toEqual([
                { RowNum: 42, CustomerName: 'Customer 42', Category: 'SMB', Revenue: 42000 },
            ]);

            const aggCall = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'aggregate',
                input: { table: 'Results', field: 'Revenue', operation: 'sum' },
            });
            expect(aggCall.result.success).toBe(true);
            expect((aggCall.result.data as { value: number }).value).toBe(1275000);
        });

        it('registers large plain-text outputs in TextToolLibrary so grep and get_lines work after expiration', async () => {
            const agent = new UnifiedActionPathwayProbeAgent();
            const largeLog = Array.from({ length: 100 }, (_, i) => `Line ${i}: status=${i === 73 ? 'ERROR_TIMEOUT' : 'OK'}`).join('\n');

            const artifactIds = agent.RegisterOutputs(
                'Fetch Build Log',
                undefined,
                [{ Name: 'LogText', Type: 'Output', Value: largeLog }],
                'Build log fetched',
                2,
                { expirationTurns: 1, expirationMode: 'Remove' }
            );

            expect(artifactIds).toEqual(['A']);
            const manager = agent.GetArtifactManager();
            const grepResult = await manager.ExecuteSingleToolCall({
                artifactId: 'A',
                tool: 'grep',
                input: { pattern: 'ERROR_TIMEOUT' },
            });
            expect(grepResult.result.success).toBe(true);
            expect(grepResult.result.data).toEqual([{ lineNumber: 73, text: 'Line 73: status=ERROR_TIMEOUT' }]);
        });
    });

    describe('Core metadata verification (#6395)', () => {
        const repoRoot = path.resolve(__dirname, '../../../../..');

        it('sets MaxIterationsPerRun = 20 on Sage in metadata/agents/.sage-agent.json', () => {
            const sageRaw = fs.readFileSync(path.join(repoRoot, 'metadata/agents/.sage-agent.json'), 'utf-8');
            const sageJson = JSON.parse(sageRaw) as Array<{ fields: Record<string, unknown> }>;
            expect(sageJson[0].fields.Name).toBe('Sage');
            expect(sageJson[0].fields.MaxIterationsPerRun).toBe(20);
        });

        it('configures 1-turn Compact (First N Chars, 2000 chars) expiration on Run Ad-hoc Query and Run Stored Query in metadata/actions/', () => {
            const adhocRaw = fs.readFileSync(path.join(repoRoot, 'metadata/actions/.run-adhoc-query.json'), 'utf-8');
            const adhocJson = JSON.parse(adhocRaw) as Array<{ fields: Record<string, unknown> }>;
            expect(adhocJson[0].fields.Name).toBe('Run Ad-hoc Query');
            expect(adhocJson[0].fields.Config).toEqual({
                resultExpirationMode: 'Compact',
                resultExpirationTurns: 1,
                compactMode: 'First N Chars',
                compactLength: 2000,
            });

            const storedRaw = fs.readFileSync(path.join(repoRoot, 'metadata/actions/.run-stored-query.json'), 'utf-8');
            const storedJson = JSON.parse(storedRaw) as Array<{ fields: Record<string, unknown> }>;
            expect(storedJson[0].fields.Name).toBe('Run Stored Query');
            expect(storedJson[0].fields.Config).toEqual({
                resultExpirationMode: 'Compact',
                resultExpirationTurns: 1,
                compactMode: 'First N Chars',
                compactLength: 2000,
            });
        });
    });
});
