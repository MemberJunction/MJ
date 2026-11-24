import { describe, it, expect, vi, afterEach } from 'vitest';
import * as CoreLogging from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { ActionResult, type ActionParam } from '@memberjunction/actions-base';
import type {
    AgentChatMessage,
    AgentChatMessageMetadata,
    AgentSubAgentRequest,
    AIPromptRunResult,
    BaseAgentNextStep,
    MJAIAgentEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import {
    ActionLifecycleResolver,
    type ResolvedActionExpirationConfig,
} from '../ActionLifecycleResolver';
import { ActionResultSpilloverManager } from '../ActionResultSpilloverManager';
import { ArtifactToolManager } from '../ArtifactToolManager';
import { BuildToolResultTurn } from '../native-tools/tool-result-turns';
import {
    RUN_ADHOC_QUERY_ID,
    SAGE_AGENT_ID,
    UnifiedActionPathwayProbeAgent,
    makeActionEntity,
    makeAgentAction,
    makeAgentRun,
    makeExecuteParams,
    makeLargeRows,
} from './helpers/action-lifecycle-test-helpers';

describe('ActionResultSpilloverManager & lazy artifact spillover (#6395)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        ActionLifecycleResolver.ClearIncompleteConfigWarnings();
    });

    it('registers tabular skill-action outputs lazily and keeps full rows queryable after First N Chars compaction', async () => {
        const agent = new UnifiedActionPathwayProbeAgent();
        const adhocQueryAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
            resultExpirationTurns: 1,
            resultExpirationMode: 'Compact',
            compactMode: 'First N Chars',
            compactLength: 2000,
        });
        const expirationConfig = ActionLifecycleResolver.ResolveExpirationConfig(adhocQueryAction, SAGE_AGENT_ID);
        const rows = makeLargeRows(50);
        const formattedCsv = [
            '"RowNum","CustomerName","Category","Revenue"',
            ...rows.map(r => `"${r.RowNum}","${r.CustomerName}","${r.Category}","${r.Revenue}"`),
        ].join('\n');

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

        const manager = agent.GetArtifactManager();
        const metadata: AgentChatMessageMetadata = {
            turnAdded: 1,
            messageType: 'action-result',
            expirationTurns: 1,
            expirationMode: 'Compact',
            compactMode: 'First N Chars',
            compactLength: 200,
        };
        const queued = agent.QueueSpillover(metadata, {
            ActionName: 'Run Ad-hoc Query',
            OutputParams: outputParams,
            Message: `# Query Results\n\n${formattedCsv}`,
            StepNumber: 1,
            ExpirationConfig: expirationConfig,
        });
        expect(queued).toBe(true);
        expect(manager.HasArtifacts()).toBe(false);

        const summaryMarkdown = agent.FormatMarkdown([
            {
                actionName: 'Run Ad-hoc Query',
                success: true,
                params: outputParams,
                resultCode: 'SUCCESS',
                message: `# Query Results\n\n${formattedCsv}`,
            },
        ]);
        const messageToCompact: AgentChatMessage = { role: 'user', content: summaryMarkdown, metadata };
        const compactedText = await agent.Compact(
            messageToCompact,
            { compactMode: 'First N Chars', compactLength: 200, compactPromptId: '', originalLength: summaryMarkdown.length },
            makeExecuteParams()
        );

        expect(manager.HasArtifacts()).toBe(true);
        expect(manager.ToManifestString()).toContain('**A** — Data Snapshot: "Run Ad-hoc Query — Results (Step 1)"');
        expect(messageToCompact.metadata?.artifactIds).toEqual(['A']);
        expect(agent.GetSpilloverManager().HasPending(messageToCompact)).toBe(false);
        expect(compactedText.length).toBeLessThan(450);
        expect(compactedText).toContain('Full output remains queryable via artifact tools on Artifact A.');

        const pageCall = await manager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'get_rows',
            input: { table: 'Results', start: 45, count: 5 },
        });
        expect(pageCall.result.success).toBe(true);
        expect(pageCall.result.data).toHaveLength(5);
        expect((pageCall.result.data as Array<Record<string, unknown>>)[4].CustomerName).toBe('Customer 50');

        // Single-table snapshots allow omitting `table`
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

    it('registers large plain-text outputs in TextToolLibrary and requires explicit table on multi-table snapshots', async () => {
        const agent = new UnifiedActionPathwayProbeAgent();
        const largeLog = Array.from({ length: 100 }, (_, i) => `Line ${i}: status=${i === 73 ? 'ERROR_TIMEOUT' : 'OK'}`).join('\n');

        const manager = agent.GetArtifactManager();
        const artifactIds = agent.GetSpilloverManager().RegisterImmediate(
            {
                ActionName: 'Fetch Build Log',
                OutputParams: [{ Name: 'LogText', Type: 'Output', Value: largeLog }],
                Message: 'Build log fetched',
                StepNumber: 2,
                ExpirationConfig: { ExpirationTurns: 1, ExpirationMode: 'Remove' },
            },
            manager
        );

        expect(artifactIds).toEqual(['A']);
        const grepResult = await manager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'grep',
            input: { pattern: 'ERROR_TIMEOUT' },
        });
        expect(grepResult.result.success).toBe(true);
        expect((grepResult.result.data as { matches: Array<{ lineNumber: number; text: string }> }).matches).toEqual([
            { lineNumber: 73, text: 'Line 73: status=ERROR_TIMEOUT' },
        ]);

        // Multi-table Data Snapshot still requires explicit `table`
        const multiTableManager = new ArtifactToolManager();
        multiTableManager.Initialize([
            {
                name: 'Multi Table Snapshot',
                typeName: 'Data Snapshot',
                toolLibraryClass: 'DataSnapshotToolLibrary',
                content: JSON.stringify({
                    tables: [
                        { name: 'Customers', columns: [{ field: 'ID', sqlBaseType: 'int' }], rows: [{ ID: 1 }] },
                        { name: 'Orders', columns: [{ field: 'ID', sqlBaseType: 'int' }], rows: [{ ID: 2 }] },
                    ],
                }),
            },
        ]);
        const missingTableCall = await multiTableManager.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'search_rows',
            input: { field: 'ID', operator: 'eq', value: 1 },
        });
        expect(missingTableCall.result.success).toBe(false);
        expect(missingTableCall.result.errorMessage).toContain('Parameter "table" is required');
    });

    it('does NOT spill tiny lookup queries in Compact mode while still spilling in Remove mode', () => {
        const smallLookupRows = Array.from({ length: 6 }, (_, i) => ({ ID: String(i + 1), Name: `Lookup ${i + 1}` }));
        const csvBody = ['"ID","Name"', ...smallLookupRows.map(r => `"${r.ID}","${r.Name}"`)].join('\n');
        const smallOutputParams: ActionParam[] = [
            { Name: 'Results', Type: 'Output', Value: smallLookupRows },
            { Name: 'FormattedResults', Type: 'Output', Value: csvBody },
        ];

        const compactCfg: ResolvedActionExpirationConfig = {
            ExpirationTurns: 1,
            ExpirationMode: 'Compact',
            CompactMode: 'First N Chars',
            CompactLength: 2000,
        };
        const compactSpillover = new ActionResultSpilloverManager();
        const compactArtifacts = new ArtifactToolManager();
        expect(
            compactSpillover.RegisterImmediate(
                { ActionName: 'Run Ad-hoc Query', OutputParams: smallOutputParams, Message: `# Query Results\n\n${csvBody}`, StepNumber: 1, ExpirationConfig: compactCfg },
                compactArtifacts
            )
        ).toEqual([]);
        expect(compactSpillover.WouldSpillOver(smallOutputParams, `# Query Results\n\n${csvBody}`, compactCfg)).toBe(false);
        expect(compactArtifacts.HasArtifacts()).toBe(false);

        const removeSpillover = new ActionResultSpilloverManager();
        const removeArtifacts = new ArtifactToolManager();
        expect(
            removeSpillover.RegisterImmediate(
                { ActionName: 'Run Ad-hoc Query', OutputParams: smallOutputParams, Message: `# Query Results\n\n${csvBody}`, StepNumber: 1, ExpirationConfig: { ExpirationTurns: 1, ExpirationMode: 'Remove' } },
                removeArtifacts
            )
        ).toEqual(['A']);
        expect(removeArtifacts.HasArtifacts()).toBe(true);
    });

    it('keeps ArtifactToolManager empty while inline, materializes on Compact/Remove expiry, and isolates separate runs', async () => {
        const agent = new UnifiedActionPathwayProbeAgent();
        const compactConfig: ResolvedActionExpirationConfig = {
            ExpirationTurns: 1,
            ExpirationMode: 'Compact',
            CompactMode: 'First N Chars',
            CompactLength: 200,
        };
        const rows = makeLargeRows(40);
        const outputParams: ActionParam[] = [{ Name: 'Results', Type: 'Output', Value: rows }];
        const longText = `## Run Ad-hoc Query\n${JSON.stringify(rows)}`;

        const userMeta: AgentChatMessageMetadata = {
            turnAdded: 1,
            messageType: 'action-result',
            expirationTurns: 1,
            expirationMode: 'Compact',
            compactMode: 'First N Chars',
            compactLength: 200,
        };
        const toolMeta: AgentChatMessageMetadata = {
            turnAdded: 2,
            messageType: 'action-result',
            expirationTurns: 1,
            expirationMode: 'Compact',
            compactMode: 'First N Chars',
            compactLength: 200,
        };
        expect(agent.QueueSpillover(userMeta, { ActionName: 'Run Ad-hoc Query', OutputParams: outputParams, Message: longText, StepNumber: 1, ExpirationConfig: compactConfig })).toBe(true);
        expect(agent.QueueSpillover(toolMeta, { ActionName: 'Run Ad-hoc Query', OutputParams: outputParams, Message: longText, StepNumber: 2, ExpirationConfig: compactConfig })).toBe(true);

        const manager = agent.GetArtifactManager();
        expect(manager.HasArtifacts()).toBe(false);

        const callTurn: AgentChatMessage = {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'call_1', name: 'Run_Ad_hoc_Query', arguments: {} }],
        };
        const toolTurn = BuildToolResultTurn(
            [{ toolCallId: 'call_1', toolName: 'Run_Ad_hoc_Query', content: longText, isError: false }],
            toolMeta
        );
        const conversationMessages: AgentChatMessage[] = [
            { role: 'user', content: 'Please analyze customer revenue.' },
            { role: 'user', content: longText, metadata: userMeta },
            callTurn,
            toolTurn,
        ];
        const params = makeExecuteParams({ conversationMessages });

        await agent.PruneExpired(params, 4);

        expect(manager.HasArtifacts()).toBe(true);
        expect(conversationMessages[1].metadata?.artifactIds).toEqual(['A']);
        expect(agent.GetSpilloverManager().HasPending(conversationMessages[1])).toBe(false);
        expect(conversationMessages[1].content).toContain('Full output remains queryable via artifact tools on Artifact A.');

        expect(conversationMessages[3].metadata?.artifactIds).toEqual(['B']);
        expect(agent.GetSpilloverManager().HasPending(conversationMessages[3])).toBe(false);
        expect(JSON.stringify(conversationMessages[3].content)).toContain('Full output remains queryable via artifact tools on Artifact B.');

        // Remove mode materializes before removal/stubbing
        const removeAgent = new UnifiedActionPathwayProbeAgent();
        const rmConfig: ResolvedActionExpirationConfig = { ExpirationTurns: 0, ExpirationMode: 'Remove' };
        const rmUserMeta: AgentChatMessageMetadata = { turnAdded: 1, messageType: 'action-result', expirationTurns: 0, expirationMode: 'Remove' };
        const rmToolMeta: AgentChatMessageMetadata = { turnAdded: 2, messageType: 'action-result', expirationTurns: 0, expirationMode: 'Remove' };
        expect(removeAgent.QueueSpillover(rmUserMeta, { ActionName: 'Fetch Log', OutputParams: outputParams, Message: longText, StepNumber: 1, ExpirationConfig: rmConfig })).toBe(true);
        expect(removeAgent.QueueSpillover(rmToolMeta, { ActionName: 'Fetch Log', OutputParams: outputParams, Message: longText, StepNumber: 2, ExpirationConfig: rmConfig })).toBe(true);
        expect(removeAgent.GetArtifactManager().HasArtifacts()).toBe(false);

        const rmMessages: AgentChatMessage[] = [
            { role: 'user', content: 'Initial request' },
            { role: 'user', content: longText, metadata: rmUserMeta },
            callTurn,
            BuildToolResultTurn([{ toolCallId: 'call_1', toolName: 'Fetch_Log', content: longText, isError: false }], rmToolMeta),
        ];
        await removeAgent.PruneExpired(makeExecuteParams({ conversationMessages: rmMessages }), 3);
        expect(removeAgent.GetArtifactManager().HasArtifacts()).toBe(true);
        expect(rmMessages).toHaveLength(3);
        expect(JSON.stringify(rmMessages[2].content)).toContain('Artifact B');

        // Clearing pending spillovers emits no dead hints
        const postRunAgent = new UnifiedActionPathwayProbeAgent();
        const staleMeta: AgentChatMessageMetadata = { turnAdded: 1, messageType: 'action-result' };
        expect(postRunAgent.QueueSpillover(staleMeta, { ActionName: 'Run Ad-hoc Query', OutputParams: outputParams, Message: longText, StepNumber: 1, ExpirationConfig: compactConfig })).toBe(true);
        postRunAgent.GetSpilloverManager().Clear();
        const postCompacted = await postRunAgent.Compact(
            { role: 'user', content: longText, metadata: staleMeta },
            { compactMode: 'First N Chars', compactLength: 200, compactPromptId: '', originalLength: longText.length },
            params
        );
        expect(postRunAgent.GetArtifactManager().HasArtifacts()).toBe(false);
        expect(postCompacted).not.toContain('Artifact ');

        // Separate agent instances never share private pending spillover state
        const run1Agent = new UnifiedActionPathwayProbeAgent();
        const run2Agent = new UnifiedActionPathwayProbeAgent();
        const run1Meta: AgentChatMessageMetadata = { turnAdded: 1, messageType: 'action-result' };
        const run2Meta: AgentChatMessageMetadata = { turnAdded: 1, messageType: 'action-result' };
        expect(run1Agent.QueueSpillover(run1Meta, { ActionName: 'Run Ad-hoc Query', OutputParams: outputParams, Message: longText, StepNumber: 1, ExpirationConfig: compactConfig })).toBe(true);
        expect(run2Agent.QueueSpillover(run2Meta, { ActionName: 'Run Ad-hoc Query', OutputParams: outputParams, Message: longText, StepNumber: 1, ExpirationConfig: compactConfig })).toBe(true);
        const run1Msg: AgentChatMessage = { role: 'user', content: longText, metadata: run1Meta };
        expect(run1Agent.GetSpilloverManager().HasPending(run1Msg)).toBe(true);
        expect(run2Agent.GetSpilloverManager().HasPending(run1Msg)).toBe(false);
        const run1StaleCompacted = await run2Agent.Compact(
            run1Msg,
            { compactMode: 'First N Chars', compactLength: 200, compactPromptId: '', originalLength: longText.length },
            params
        );
        expect(run2Agent.GetSpilloverManager().PendingCount).toBe(1);
        expect(run2Agent.GetArtifactManager().HasArtifacts()).toBe(false);
        expect(run1StaleCompacted).not.toContain('Artifact ');
    });

    it('materializes deferred spillovers across emergency context recovery strategies', async () => {
        const rows = makeLargeRows(40);
        const outputParams: ActionParam[] = [{ Name: 'Results', Type: 'Output', Value: rows }];
        const longText = `Large payload: ${JSON.stringify(rows)}`;
        const cfg: ResolvedActionExpirationConfig = {
            ExpirationTurns: 2,
            ExpirationMode: 'Compact',
            CompactMode: 'First N Chars',
            CompactLength: 300,
        };

        // 1. RemoveOldestToolResults
        const rmAgent = new UnifiedActionPathwayProbeAgent();
        const rmMeta1: AgentChatMessageMetadata = { turnAdded: 1, messageType: 'action-result' };
        const rmMeta2: AgentChatMessageMetadata = { turnAdded: 1, messageType: 'action-result' };
        rmAgent.QueueSpillover(rmMeta1, { ActionName: 'Run Query', OutputParams: outputParams, Message: longText, StepNumber: 1, ExpirationConfig: cfg });
        rmAgent.QueueSpillover(rmMeta2, { ActionName: 'Run Query', OutputParams: outputParams, Message: longText, StepNumber: 1, ExpirationConfig: cfg });
        const rmMsgs: AgentChatMessage[] = [
            { role: 'user', content: longText, metadata: rmMeta1 },
            { role: 'assistant', content: '', toolCalls: [{ id: 'tc1', name: 'Run_Query', arguments: {} }] },
            BuildToolResultTurn([{ toolCallId: 'tc1', toolName: 'Run_Query', content: longText, isError: false }], rmMeta2),
        ];
        rmAgent.RunRemoveRecovery(makeExecuteParams({ conversationMessages: rmMsgs }), 100_000, 7, 5);
        expect(rmAgent.GetArtifactManager().HasArtifacts()).toBe(true);
        expect(rmMsgs).toHaveLength(2);
        expect(rmMsgs[1].metadata?.artifactIds).toEqual(['A']);
        expect(JSON.stringify(rmMsgs[1].content)).toContain('Artifact A');

        // 2. CompactOldToolResults
        const cmpAgent = new UnifiedActionPathwayProbeAgent();
        const cmpMeta1: AgentChatMessageMetadata = { turnAdded: 1, messageType: 'action-result' };
        const cmpMeta2: AgentChatMessageMetadata = { turnAdded: 1, messageType: 'action-result' };
        cmpAgent.QueueSpillover(cmpMeta1, { ActionName: 'Run Query', OutputParams: outputParams, Message: longText, StepNumber: 1, ExpirationConfig: cfg });
        cmpAgent.QueueSpillover(cmpMeta2, { ActionName: 'Run Query', OutputParams: outputParams, Message: longText, StepNumber: 1, ExpirationConfig: cfg });
        const cmpMsgs: AgentChatMessage[] = [
            { role: 'user', content: longText, metadata: cmpMeta1 },
            { role: 'assistant', content: '', toolCalls: [{ id: 'tc2', name: 'Run_Query', arguments: {} }] },
            BuildToolResultTurn([{ toolCallId: 'tc2', toolName: 'Run_Query', content: longText, isError: false }], cmpMeta2),
        ];
        await cmpAgent.RunCompactRecovery(makeExecuteParams({ conversationMessages: cmpMsgs }), 100_000, 5, 3);
        expect(cmpAgent.GetArtifactManager().HasArtifacts()).toBe(true);
        expect(cmpMsgs[0].metadata?.artifactIds).toEqual(['A']);
        expect(String(cmpMsgs[0].content)).toContain('Artifact A');
        expect(cmpMsgs[2].metadata?.artifactIds).toEqual(['B']);
        expect(Array.isArray(cmpMsgs[2].content)).toBe(true);
        expect(JSON.stringify(cmpMsgs[2].content)).toContain('Artifact B');

        // 3. CompactAllToolResults preserves tool_result block array
        const allAgent = new UnifiedActionPathwayProbeAgent();
        const allMeta: AgentChatMessageMetadata = { turnAdded: 1, messageType: 'action-result' };
        allAgent.QueueSpillover(allMeta, { ActionName: 'Run Query', OutputParams: outputParams, Message: longText, StepNumber: 1, ExpirationConfig: cfg });
        const allMsgs: AgentChatMessage[] = [
            { role: 'assistant', content: '', toolCalls: [{ id: 'tc3', name: 'Run_Query', arguments: {} }] },
            BuildToolResultTurn([{ toolCallId: 'tc3', toolName: 'Run_Query', content: longText, isError: false }], allMeta),
        ];
        await allAgent.RunCompactAllRecovery(makeExecuteParams({ conversationMessages: allMsgs }), 100_000);
        expect(allAgent.GetArtifactManager().HasArtifacts()).toBe(true);
        expect(allMsgs[1].metadata?.artifactIds).toEqual(['A']);
        expect(Array.isArray(allMsgs[1].content)).toBe(true);
        expect(JSON.stringify(allMsgs[1].content)).toContain('Artifact A');
    });

    it('ignores ResultExpirationMode: None on parallel actions, honors caller opt-out, and transfers pending spillovers across merged tool turns', async () => {
        const agent = new UnifiedActionPathwayProbeAgent();
        vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([]);

        const nonExpiringAction = makeActionEntity('00000000-0000-0000-0000-000000000101', 'Fast Ping', {
            resultExpirationTurns: 0,
            resultExpirationMode: 'None',
        });
        const compactingAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
            resultExpirationTurns: 2,
            resultExpirationMode: 'Compact',
            compactMode: 'First N Chars',
            compactLength: 600,
        });
        const rows = makeLargeRows(35);

        agent.SetStubbedEffectiveActions([nonExpiringAction, compactingAction]);
        agent.EnableNoOpStepPersistence();
        agent.UseStubLoopAgentType();
        vi.spyOn(agent, 'ExecuteSingleAction').mockImplementation(async (_p, action) => {
            if (action.name === 'Fast Ping') {
                return Object.assign(new ActionResult(), { Success: true, Message: 'pong', Params: [], ResultCode: 'SUCCESS' });
            }
            return Object.assign(new ActionResult(), {
                Success: true,
                Message: `Query finished (${rows.length} rows)`,
                Params: [{ Name: 'Results', Type: 'Output', Value: rows }],
                ResultCode: 'SUCCESS',
            });
        });

        const conversationMessages: AgentChatMessage[] = [];
        await agent.ExecuteStep(makeExecuteParams({ conversationMessages }), {
            step: 'Actions',
            terminate: false,
            actions: [
                { name: 'Fast Ping', params: {} },
                { name: 'Run Ad-hoc Query', params: { Query: 'SELECT 1' } },
            ],
        } as BaseAgentNextStep);

        const resultMsg = conversationMessages[conversationMessages.length - 1];
        expect(resultMsg.metadata?.expirationMode).toBe('Compact');
        expect(resultMsg.metadata?.expirationTurns).toBe(2);
        expect(resultMsg.metadata?.compactLength).toBe(600);
        expect(agent.GetSpilloverManager().HasPending(resultMsg)).toBe(true);
        expect(agent.GetSpilloverManager().PendingCount).toBe(1);
        expect(agent.GetArtifactManager().HasArtifacts()).toBe(false);

        // Caller messageExpirationOverride = { expirationMode: 'None' } disables expiration
        const optOutMsgs: AgentChatMessage[] = [];
        await agent.ExecuteStep(
            makeExecuteParams({ conversationMessages: optOutMsgs, messageExpirationOverride: { expirationMode: 'None' } }),
            { step: 'Actions', terminate: false, actions: [{ name: 'Run Ad-hoc Query', params: { Query: 'SELECT 1' } }] } as BaseAgentNextStep
        );
        const optOutResult = optOutMsgs[optOutMsgs.length - 1];
        expect(optOutResult.metadata?.expirationMode).toBeUndefined();
        expect(optOutResult.metadata?.expirationTurns).toBeUndefined();

        // Merging adjacent native tool turns transfers private pending spillovers onto merged metadata
        const mergeAgent = new UnifiedActionPathwayProbeAgent();
        const callTurn: AgentChatMessage = {
            role: 'assistant',
            content: '',
            toolCalls: [
                { id: 'c1', name: 'Ping', arguments: {} },
                { id: 'c2', name: 'Run_Ad_hoc_Query', arguments: {} },
            ],
        };
        const firstMeta: AgentChatMessageMetadata = { turnAdded: 3, messageType: 'action-result', expirationTurns: 0, expirationMode: 'None', artifactIds: ['A'] };
        const secondMeta: AgentChatMessageMetadata = {
            turnAdded: 3,
            messageType: 'action-result',
            expirationTurns: 2,
            expirationMode: 'Compact',
            compactMode: 'First N Chars',
            compactLength: 750,
            artifactIds: ['B'],
        };
        expect(
            mergeAgent.QueueSpillover(secondMeta, {
                ActionName: 'Run Ad-hoc Query',
                OutputParams: [{ Name: 'Results', Type: 'Output', Value: rows }],
                Message: 'rows...',
                StepNumber: 3,
                ExpirationConfig: { ExpirationTurns: 2, ExpirationMode: 'Compact', CompactMode: 'First N Chars', CompactLength: 750 },
            })
        ).toBe(true);

        const firstToolTurn = BuildToolResultTurn([{ toolCallId: 'c1', toolName: 'Ping', content: 'ok', isError: false }], firstMeta);
        const secondToolTurn = BuildToolResultTurn([{ toolCallId: 'c2', toolName: 'Run_Ad_hoc_Query', content: 'R'.repeat(1200), isError: false }], secondMeta);

        const mergeMsgs: AgentChatMessage[] = [callTurn, firstToolTurn];
        mergeAgent.PushToolTurn(makeExecuteParams({ conversationMessages: mergeMsgs }), secondToolTurn);

        expect(mergeMsgs).toHaveLength(2);
        const merged = mergeMsgs[1];
        expect(merged.metadata?.expirationTurns).toBe(2);
        expect(merged.metadata?.expirationMode).toBe('Compact');
        expect(merged.metadata?.compactLength).toBe(750);
        expect(merged.metadata?.artifactIds).toEqual(['A', 'B']);
        expect(mergeAgent.GetSpilloverManager().HasPending(merged)).toBe(true);
        const materialized = mergeAgent.GetSpilloverManager().Materialize(merged);
        expect(materialized).toEqual(['A', 'B', 'A'].filter((v, i, arr) => arr.indexOf(v) === i));
        expect(mergeAgent.GetArtifactManager().HasArtifacts()).toBe(true);
    });

    it('does not materialize deferred spillovers when compaction or emergency recovery is a no-op', async () => {
        const agent = new UnifiedActionPathwayProbeAgent();
        const compactConfig: ResolvedActionExpirationConfig = {
            ExpirationTurns: 1,
            ExpirationMode: 'Compact',
            CompactMode: 'First N Chars',
            CompactLength: 2000,
        };
        const mediumParams: ActionParam[] = [{ Name: 'Payload', Type: 'Output', Value: { Body: 'p'.repeat(1600) } }];
        const mediumText = 'M'.repeat(1800);

        const userMeta: AgentChatMessageMetadata = {
            turnAdded: 1,
            messageType: 'action-result',
            expirationTurns: 1,
            expirationMode: 'Compact',
            compactMode: 'First N Chars',
            compactLength: 2000,
        };
        const toolMeta: AgentChatMessageMetadata = {
            turnAdded: 2,
            messageType: 'action-result',
            expirationTurns: 1,
            expirationMode: 'Compact',
            compactMode: 'First N Chars',
            compactLength: 2000,
        };
        expect(agent.QueueSpillover(userMeta, { ActionName: 'Run Ad-hoc Query', OutputParams: mediumParams, Message: mediumText, StepNumber: 1, ExpirationConfig: compactConfig })).toBe(true);
        expect(agent.QueueSpillover(toolMeta, { ActionName: 'Run Ad-hoc Query', OutputParams: mediumParams, Message: mediumText, StepNumber: 2, ExpirationConfig: compactConfig })).toBe(true);

        const conversationMessages: AgentChatMessage[] = [
            { role: 'user', content: 'Anchor request' },
            { role: 'user', content: mediumText, metadata: userMeta },
            { role: 'assistant', content: '', toolCalls: [{ id: 'call_noop', name: 'Run_Ad_hoc_Query', arguments: {} }] },
            BuildToolResultTurn([{ toolCallId: 'call_noop', toolName: 'Run_Ad_hoc_Query', content: mediumText, isError: false }], toolMeta),
        ];

        await agent.PruneExpired(makeExecuteParams({ conversationMessages }), 4);

        expect(agent.GetArtifactManager().HasArtifacts()).toBe(false);
        expect(conversationMessages[1].content).toBe(mediumText);
        expect(conversationMessages[1].metadata?.artifactIds).toBeUndefined();
        expect(agent.GetSpilloverManager().HasPending(conversationMessages[1])).toBe(true);
        expect(agent.GetSpilloverManager().HasPending(conversationMessages[3])).toBe(true);

        // Emergency recovery skips materializing on borderline 530-char text where hint overhead prevents savings
        const recAgent = new UnifiedActionPathwayProbeAgent();
        const recCfg: ResolvedActionExpirationConfig = { ExpirationTurns: 1, ExpirationMode: 'Compact', CompactMode: 'First N Chars', CompactLength: 500 };
        const borderlineText = 'R'.repeat(530);
        const recParamsList: ActionParam[] = [{ Name: 'Payload', Type: 'Output', Value: borderlineText }];
        const recUserMeta: AgentChatMessageMetadata = { turnAdded: 1, messageType: 'action-result' };
        const recToolMeta: AgentChatMessageMetadata = { turnAdded: 1, messageType: 'action-result' };
        expect(recAgent.QueueSpillover(recUserMeta, { ActionName: 'Run Query', OutputParams: recParamsList, Message: borderlineText, StepNumber: 1, ExpirationConfig: recCfg })).toBe(true);
        expect(recAgent.QueueSpillover(recToolMeta, { ActionName: 'Run Query', OutputParams: recParamsList, Message: borderlineText, StepNumber: 1, ExpirationConfig: recCfg })).toBe(true);
        const recMsgs: AgentChatMessage[] = [
            { role: 'user', content: borderlineText, metadata: recUserMeta },
            { role: 'assistant', content: '', toolCalls: [{ id: 'tc_noop', name: 'Run_Query', arguments: {} }] },
            BuildToolResultTurn([{ toolCallId: 'tc_noop', toolName: 'Run_Query', content: borderlineText, isError: false }], recToolMeta),
        ];
        await recAgent.RunCompactRecovery(makeExecuteParams({ conversationMessages: recMsgs }), 100_000, 5, 3);
        expect(recAgent.GetArtifactManager().HasArtifacts()).toBe(false);
        expect(recAgent.GetSpilloverManager().HasPending(recMsgs[0])).toBe(true);
        expect(recAgent.GetSpilloverManager().HasPending(recMsgs[2])).toBe(true);
    });

    it('isolates cloned sub-agent message metadata and keeps parent pending spillovers intact across sub-agent pruning', async () => {
        const parent = new UnifiedActionPathwayProbeAgent();
        const child = new UnifiedActionPathwayProbeAgent();
        const rows = makeLargeRows(40);
        const longText = `Large payload: ${JSON.stringify(rows)}`;
        const compactConfig: ResolvedActionExpirationConfig = {
            ExpirationTurns: 1,
            ExpirationMode: 'Compact',
            CompactMode: 'First N Chars',
            CompactLength: 300,
        };

        const parentMeta: AgentChatMessageMetadata = {
            turnAdded: 1,
            messageType: 'action-result',
            expirationTurns: 1,
            expirationMode: 'Compact',
            compactMode: 'First N Chars',
            compactLength: 300,
        };
        expect(
            parent.QueueSpillover(parentMeta, {
                ActionName: 'Run Ad-hoc Query',
                OutputParams: [{ Name: 'Results', Type: 'Output', Value: rows }],
                Message: longText,
                StepNumber: 1,
                ExpirationConfig: compactConfig,
            })
        ).toBe(true);

        const parentMsgs: AgentChatMessage[] = [
            { role: 'user', content: 'Analyze customer accounts' },
            { role: 'user', content: longText, metadata: parentMeta },
        ];
        const parentParams = makeExecuteParams({ conversationMessages: parentMsgs });

        vi.spyOn(AIEngine.Instance, 'AgentRelationships', 'get').mockReturnValue([]);
        const subAgentEntity = {
            ID: '00000000-0000-0000-0000-000000000888',
            MessageMode: 'All',
            MaxMessages: null,
        } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended;

        const childMsgs = parent.PrepareSubMessages(
            parentParams,
            { message: 'Summarize findings' } as Partial<AgentSubAgentRequest> as AgentSubAgentRequest,
            subAgentEntity
        ) as AgentChatMessage[];

        expect(childMsgs[1]).not.toBe(parentMsgs[1]);
        expect(childMsgs[1].metadata).not.toBe(parentMsgs[1].metadata);
        expect(child.GetSpilloverManager().HasPending(childMsgs[1])).toBe(false);

        await child.PruneExpired(
            makeExecuteParams({
                agent: { ID: subAgentEntity.ID, Name: 'SubAgent' } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended,
                conversationMessages: childMsgs,
            }),
            3
        );
        expect(child.GetArtifactManager().HasArtifacts()).toBe(false);
        expect(childMsgs[1].metadata?.isExpired).toBe(true);
        expect(childMsgs[1].metadata?.wasCompacted).toBe(true);

        expect(parentMsgs[1].metadata?.isExpired).toBeUndefined();
        expect(parentMsgs[1].metadata?.wasCompacted).toBeUndefined();
        expect(parentMsgs[1].content).toBe(longText);
        expect(parent.GetSpilloverManager().HasPending(parentMsgs[1])).toBe(true);

        await parent.PruneExpired(parentParams, 3);
        expect(parent.GetArtifactManager().HasArtifacts()).toBe(true);
        expect(parentMsgs[1].metadata?.wasCompacted).toBe(true);
        expect(parentMsgs[1].metadata?.artifactIds).toEqual(['A']);
        expect(parent.GetSpilloverManager().HasPending(parentMsgs[1])).toBe(false);
        expect(String(parentMsgs[1].content)).toContain('Artifact A');
    });

    it('queues one lazy spillover on ForEach completion and suppresses spillover when artifact tools are disabled', async () => {
        const agent = new UnifiedActionPathwayProbeAgent();
        vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([]);

        const adhocQueryAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
            resultExpirationTurns: 1,
            resultExpirationMode: 'Compact',
            compactMode: 'First N Chars',
            compactLength: 400,
        });
        const rows = makeLargeRows(35);
        agent.SetStubbedEffectiveActions([adhocQueryAction]);
        agent.EnableNoOpStepPersistence();
        agent.UseStubLoopAgentType();

        let iterCall = 0;
        vi.spyOn(agent, 'ExecuteSingleAction').mockImplementation(async () => {
            iterCall += 1;
            return Object.assign(new ActionResult(), {
                Success: true,
                Message: `Iteration ${iterCall}: ${'D'.repeat(750)}`,
                Params: [{ Name: 'Results', Type: 'Output', Value: rows }],
                ResultCode: 'SUCCESS',
            });
        });

        const conversationMessages: AgentChatMessage[] = [{ role: 'user', content: 'Run across all targets' }];
        const loopPayload = { queries: ['SELECT 1', 'SELECT 2', 'SELECT 3'] };
        const params = makeExecuteParams({ conversationMessages, payload: loopPayload });

        await agent.ExecuteStep(params, {
            step: 'ForEach',
            terminate: false,
            previousPayload: loopPayload,
            newPayload: loopPayload,
            forEach: {
                collectionPath: 'queries',
                itemVariable: 'query',
                action: { name: 'Run Ad-hoc Query', params: { Query: '{{query}}' } },
            },
        } as BaseAgentNextStep);

        expect(iterCall).toBe(3);
        expect(agent.GetSpilloverManager().PendingCount).toBe(1);
        expect(conversationMessages).toHaveLength(2);
        const loopMsg = conversationMessages[1];
        expect(loopMsg.metadata?.messageType).toBe('loop-result');
        expect(loopMsg.metadata?.expirationMode).toBe('Compact');
        expect(loopMsg.metadata?.expirationTurns).toBe(1);
        expect(agent.GetSpilloverManager().HasPending(loopMsg)).toBe(true);
        expect(agent.GetArtifactManager().HasArtifacts()).toBe(false);

        await agent.PruneExpired(params, 2);
        expect(agent.GetArtifactManager().HasArtifacts()).toBe(true);
        expect(conversationMessages[1].metadata?.artifactIds).toEqual(['A']);
        expect(conversationMessages[1].content).toContain('Artifact A');

        const grepCall = await agent.GetArtifactManager().ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'grep',
            input: { pattern: 'Iteration 3' },
        });
        expect(grepCall.result.success).toBe(true);
        expect(JSON.stringify(grepCall.result.data)).toContain('Iteration 3');

        // Suppression when includeArtifactToolsDocs: false or workspaceEnabled: false
        const runSuppressionCheck = async (workspaceEnabled: boolean, extraData?: Record<string, unknown>): Promise<void> => {
            const suppressedAgent = new UnifiedActionPathwayProbeAgent(workspaceEnabled);
            suppressedAgent.SetStubbedEffectiveActions([adhocQueryAction]);
            suppressedAgent.EnableNoOpStepPersistence();
            suppressedAgent.UseStubLoopAgentType();
            vi.spyOn(suppressedAgent, 'ExecuteSingleAction').mockResolvedValue(
                Object.assign(new ActionResult(), {
                    Success: true,
                    Message: `Query finished (${rows.length} rows)`,
                    Params: [{ Name: 'Results', Type: 'Output', Value: rows }],
                    ResultCode: 'SUCCESS',
                })
            );
            const msgs: AgentChatMessage[] = [{ role: 'user', content: 'Anchor request' }];
            const p = makeExecuteParams({ conversationMessages: msgs, ...(extraData ? { data: extraData } : {}) });
            await suppressedAgent.ExecuteStep(p, {
                step: 'Actions',
                terminate: false,
                actions: [{ name: 'Run Ad-hoc Query', params: { Query: 'SELECT 1' } }],
            } as BaseAgentNextStep);
            expect(suppressedAgent.GetSpilloverManager().PendingCount).toBe(0);
            await suppressedAgent.PruneExpired(p, 3);
            expect(suppressedAgent.GetArtifactManager().HasArtifacts()).toBe(false);
            expect(String(msgs[msgs.length - 1].content)).toContain('[Compacted:');
            expect(String(msgs[msgs.length - 1].content)).not.toContain('Artifact ');
        };
        await runSuppressionCheck(true, { __agentTypePromptParams: { includeArtifactToolsDocs: false } });
        await runSuppressionCheck(false);
    });

    it('supports multi-step Query Strategist workflows inheriting Action.Config and querying Data Snapshots after compaction', async () => {
        const QUERY_STRATEGIST_ID = '00000000-0000-0000-0000-000000000333';
        const RUN_STORED_QUERY_ID = '00000000-0000-0000-0000-000000000444';
        const agent = new UnifiedActionPathwayProbeAgent();

        vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([
            makeAgentAction({ AgentID: QUERY_STRATEGIST_ID, ActionID: RUN_ADHOC_QUERY_ID, ResultExpirationTurns: null }),
            makeAgentAction({ AgentID: QUERY_STRATEGIST_ID, ActionID: RUN_STORED_QUERY_ID, ResultExpirationTurns: null }),
        ]);

        const adhocAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
            resultExpirationMode: 'Compact',
            resultExpirationTurns: 1,
            compactMode: 'First N Chars',
            compactLength: 2000,
        });
        const storedAction = makeActionEntity(RUN_STORED_QUERY_ID, 'Run Stored Query', {
            resultExpirationMode: 'Compact',
            resultExpirationTurns: 1,
            compactMode: 'First N Chars',
            compactLength: 2000,
        });

        const customerRows = Array.from({ length: 50 }, (_, i) => ({ CustomerName: `Account ${i + 1}`, Revenue: (i + 1) * 100 }));
        const monthlyRows = Array.from({ length: 40 }, (_, i) => ({ Month: `Month ${i + 1}`, Revenue: (i + 1) * 50 }));

        agent.SetStubbedEffectiveActions([adhocAction, storedAction]);
        agent.EnableNoOpStepPersistence();
        agent.UseStubLoopAgentType();
        vi.spyOn(agent, 'ExecuteSingleAction').mockImplementation(async (_p, action) => {
            if (action.name === 'Run Ad-hoc Query') {
                return Object.assign(new ActionResult(), {
                    Success: true,
                    Message: `Ad-hoc query returned ${customerRows.length} rows. ${'X'.repeat(2400)}`,
                    Params: [
                        { Name: 'Results', Type: 'Output', Value: customerRows },
                        { Name: 'Columns', Type: 'Output', Value: [{ ColumnName: 'CustomerName', DataType: 'nvarchar' }, { ColumnName: 'Revenue', DataType: 'decimal' }] },
                        { Name: 'RowCount', Type: 'Output', Value: customerRows.length },
                    ],
                    ResultCode: 'SUCCESS',
                });
            }
            return Object.assign(new ActionResult(), {
                Success: true,
                Message: `Stored query returned ${monthlyRows.length} rows. ${'Y'.repeat(2400)}`,
                Params: [
                    { Name: 'Results', Type: 'Output', Value: monthlyRows },
                    { Name: 'RowCount', Type: 'Output', Value: monthlyRows.length },
                ],
                ResultCode: 'SUCCESS',
            });
        });

        const conversationMessages: AgentChatMessage[] = [{ role: 'user', content: 'Compare top accounts and monthly trends' }];
        const params = makeExecuteParams({
            agent: { ID: QUERY_STRATEGIST_ID, Name: 'Query Strategist' } as Partial<MJAIAgentEntityExtended> as MJAIAgentEntityExtended,
            conversationMessages,
        });

        await agent.ExecuteStep(params, {
            step: 'Actions',
            terminate: false,
            actions: [{ name: 'Run Ad-hoc Query', params: { Query: 'SELECT CustomerName, Revenue FROM vwAccounts' } }],
        } as BaseAgentNextStep);
        await agent.PruneExpired(params, 1);
        expect(agent.GetArtifactManager().HasArtifacts()).toBe(false);

        await agent.ExecuteStep(params, {
            step: 'Actions',
            terminate: false,
            actions: [{ name: 'Run Stored Query', params: { QueryName: 'Monthly Revenue Trend' } }],
        } as BaseAgentNextStep);
        expect(agent.GetArtifactManager().HasArtifacts()).toBe(false);

        await agent.PruneExpired(params, 2);
        const manager = agent.GetArtifactManager();
        expect(manager.HasArtifacts()).toBe(true);
        expect(manager.ToManifestString({ nativeTools: true })).toContain('Run Ad-hoc Query');

        const schemaCall = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'get_schema', input: { table: 'Results' } });
        expect(schemaCall.result.success).toBe(true);
        expect(JSON.stringify(schemaCall.result.data)).toContain('CustomerName');

        const aggCall = await manager.ExecuteSingleToolCall({ artifactId: 'A', tool: 'aggregate', input: { table: 'Results', field: 'Revenue', operation: 'sum' } });
        expect(aggCall.result.success).toBe(true);
        expect((aggCall.result.data as { value: number }).value).toBe(127500);
    });

    it('defers full tabular and nested-object serialization until Materialize runs and handles DAGs, cycles, undefined keys, BigInt, logs, and post-run hints', async () => {
        const agent = new UnifiedActionPathwayProbeAgent();
        let tailRowSerializations = 0;

        const rows: Array<Record<string, unknown>> = Array.from({ length: 200 }, (_, i) => ({
            CustomerName: `Enterprise Customer ${String(i + 1).padStart(3, '0')}`,
            Revenue: (i + 1) * 100,
            Details: `Account tier segment summary entry ${'Z'.repeat(40)}`,
        }));
        const lastIndex = rows.length - 1;
        const lastRowData = { ...rows[lastIndex] };
        rows[lastIndex] = {
            ...lastRowData,
            toJSON() {
                tailRowSerializations += 1;
                return lastRowData;
            },
        };

        const compactConfig: ResolvedActionExpirationConfig = {
            ExpirationTurns: 1,
            ExpirationMode: 'Compact',
            CompactMode: 'First N Chars',
            CompactLength: 2000,
        };

        const tabularMeta: AgentChatMessageMetadata = { messageType: 'action-result' };
        expect(agent.QueueSpillover(tabularMeta, { ActionName: 'Run Ad-hoc Query', OutputParams: [{ Name: 'Results', Type: 'Output', Value: rows }], Message: 'Returned 200 rows', StepNumber: 1, ExpirationConfig: compactConfig })).toBe(true);
        expect(tailRowSerializations).toBe(0);
        expect(agent.GetSpilloverManager().PendingCount).toBe(1);

        const ids = agent.GetSpilloverManager().Materialize({ role: 'user', content: 'inline', metadata: tabularMeta });
        expect(ids).toEqual(['A']);
        expect(tailRowSerializations).toBe(1);

        // Non-tabular nested object stops walking once CharThreshold is crossed
        let tailObjectReads = 0;
        const nestedPayload: Record<string, unknown> = { Summary: 'S'.repeat(2000) };
        Object.defineProperty(nestedPayload, 'HeavyTail', {
            enumerable: true,
            get() {
                tailObjectReads += 1;
                return { Blob: 'T'.repeat(5000) };
            },
        });
        const objMeta: AgentChatMessageMetadata = { messageType: 'action-result' };
        expect(agent.QueueSpillover(objMeta, { ActionName: 'Fetch Nested Report', OutputParams: [{ Name: 'Report', Type: 'Output', Value: nestedPayload }], Message: 'Fetched report', StepNumber: 2, ExpirationConfig: compactConfig })).toBe(true);
        expect(tailObjectReads).toBe(0);
        expect(agent.GetSpilloverManager().Materialize({ role: 'user', content: 'inline', metadata: objMeta })).toEqual(['B']);
        expect(tailObjectReads).toBe(1);

        // Shared DAG references & Dates are counted; cycles & undefined-only properties don't trigger false positives
        const spillover = new ActionResultSpilloverManager();
        const sharedLeaf = { Note: 'X'.repeat(120), CreatedAt: new Date('2026-11-23T00:00:00.000Z') };
        expect(spillover.WouldSpillOver([{ Name: 'Report', Type: 'Output', Value: { Items: Array.from({ length: 20 }, () => sharedLeaf) } }], 'ok', compactConfig)).toBe(true);

        const cyclic: Record<string, unknown> = { Label: 'tiny' };
        cyclic.Self = cyclic;
        expect(spillover.WouldSpillOver([{ Name: 'Cyclic', Type: 'Output', Value: cyclic }], 'ok', compactConfig)).toBe(false);

        // Undefined object properties are omitted by JSON.stringify and must not inflate char budget
        const undefinedHeavy: Record<string, unknown> = {};
        for (let i = 0; i < 200; i++) {
            undefinedHeavy[`ignoredKey_${i}`] = undefined;
        }
        expect(spillover.WouldSpillOver([{ Name: 'Sparse', Type: 'Output', Value: undefinedHeavy }], 'ok', compactConfig)).toBe(false);

        // Circular and BigInt payloads never crash Materialize
        const logErrorSpy = vi.spyOn(CoreLogging, 'LogError').mockImplementation(() => {});
        const artifactMgr = new ArtifactToolManager();
        artifactMgr.Initialize([], { workspaceEnabled: true });
        const removeCfg: ResolvedActionExpirationConfig = { ExpirationTurns: 1, ExpirationMode: 'Remove' };
        const circularPayload: Record<string, unknown> = { body: 'x'.repeat(1200) };
        circularPayload.self = circularPayload;
        const bigIntPayload = { id: BigInt(12345678901234567890n), body: 'y'.repeat(1200) };
        const circularRow: Record<string, unknown> = { col: 'z'.repeat(1200) };
        circularRow.self = circularRow;
        const circMeta: AgentChatMessageMetadata = { turnAdded: 1, messageType: 'action-result' };
        spillover.QueueDeferred(
            circMeta,
            {
                ActionName: 'Circular Action',
                OutputParams: [
                    { Name: 'CircularObj', Type: 'Output', Value: circularPayload },
                    { Name: 'BigIntObj', Type: 'Output', Value: bigIntPayload },
                    { Name: 'Rows', Type: 'Output', Value: [circularRow] },
                ],
                StepNumber: 1,
                ExpirationConfig: removeCfg,
            },
            artifactMgr
        );
        expect(() => spillover.Materialize({ role: 'user', content: 'payload', metadata: circMeta })).not.toThrow();
        expect(artifactMgr.HasArtifacts()).toBe(false);
        expect(logErrorSpy).toHaveBeenCalled();

        // Bracket-prefixed plain text logs classify as TextToolLibrary while valid JSON classifies as JSONToolLibrary
        const bracketLog = `[INFO] 2026-11-23 starting job\n${'log line\n'.repeat(120)}`;
        const jsonText = JSON.stringify({ ok: true, items: Array.from({ length: 40 }, (_, i) => ({ id: i, label: 'item' })) });
        const candidates = spillover.CollectCandidates({
            ActionName: 'Inspect Logs',
            OutputParams: [
                { Name: 'LogText', Type: 'Output', Value: bracketLog },
                { Name: 'JsonText', Type: 'Output', Value: jsonText },
            ],
            StepNumber: 1,
            ExpirationConfig: removeCfg,
        });
        const byName = new Map(candidates.map(c => [c.name, c]));
        expect(byName.get('Inspect Logs — LogText (Step 1)')?.toolLibraryClass).toBe('TextToolLibrary');
        expect(byName.get('Inspect Logs — JsonText (Step 1)')?.toolLibraryClass).toBe('JSONToolLibrary');

        // NativeOnly AI Summary omits expansion hint; post-run compaction on user turns suppresses dead Artifact hints
        const postAgent = new UnifiedActionPathwayProbeAgent(true);
        postAgent.EnableNoOpStepPersistence();
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([
            { ID: '00000000-0000-0000-0000-000000000999', Name: 'Compact' } as Partial<MJAIPromptEntityExtended> as MJAIPromptEntityExtended,
        ]);
        vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockResolvedValue({
            success: true,
            result: { summary: 'Condensed summary' },
        } as Partial<AIPromptRunResult<{ summary: string }>> as AIPromptRunResult<{ summary: string }>);
        postAgent.SetForceNativeOnly(true);
        const nativeAiSummary = await postAgent.Compact(
            { role: 'tool', content: 'A'.repeat(1000), metadata: { turnAdded: 1, messageType: 'action-result' } },
            { compactMode: 'AI Summary', compactLength: 200, compactPromptId: '00000000-0000-0000-0000-000000000999', originalLength: 1000 },
            makeExecuteParams()
        );
        expect(nativeAiSummary).toContain('[AI Summary of 1000 chars.]');
        expect(nativeAiSummary).not.toContain('Agent can request full expansion');

        const alphaId = postAgent.GetArtifactManager().RegisterArtifact({
            name: 'Spilled Query',
            typeName: 'Text',
            mimeType: 'text/plain',
            content: 'full query output',
            deliveryMode: 'ToolsOnly',
            forceToolsOnly: true,
        });
        const postRunParams = makeExecuteParams({
            compactAfterRun: { enabled: true, messageCountThreshold: 3 },
            conversationMessages: [
                { role: 'user', content: 'Initial question' },
                { role: 'user', content: 'D'.repeat(2500), metadata: { turnAdded: 1, messageType: 'action-result', wasCompacted: false, artifactIds: [alphaId] } },
                { role: 'assistant', content: 'Final answer' },
            ],
        });
        await postAgent.RunPostCompaction(postRunParams, makeAgentRun());
        const postRunCompacted = postRunParams.conversationMessages[1].content as string;
        expect(postRunCompacted).toContain('[Compacted: showing first 200');
        expect(postRunCompacted).not.toContain(`Artifact ${alphaId}`);
    });
});
