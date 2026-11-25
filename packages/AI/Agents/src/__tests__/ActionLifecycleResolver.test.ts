import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as CoreLogging from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import type { MJActionEntity_IActionConfiguration } from '@memberjunction/core-entities';
import {
    ActionLifecycleResolver,
    type ResolvedActionExpirationConfig,
} from '../ActionLifecycleResolver';
import { ActionResultSpilloverManager } from '../ActionResultSpilloverManager';
import {
    RUN_ADHOC_QUERY_ID,
    SAGE_AGENT_ID,
    makeActionEntity,
    makeAgentAction,
    makeExecuteParams,
} from './helpers/action-lifecycle-test-helpers';

describe('ActionLifecycleResolver (#6395)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        ActionLifecycleResolver.ClearIncompleteConfigWarnings();
    });

    describe('ResolveExpirationConfig', () => {
        it('resolves expiration and compaction settings from Action.Config_Object when an action comes from a Skill (no AIAgentAction row)', () => {
            vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([]);

            const adhocQueryAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
                resultExpirationTurns: 1,
                resultExpirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
            });

            const resolved = ActionLifecycleResolver.ResolveExpirationConfig(adhocQueryAction, SAGE_AGENT_ID);
            expect(resolved).toEqual({
                ExpirationTurns: 1,
                ExpirationMode: 'Compact',
                CompactMode: 'First N Chars',
                CompactLength: 2000,
                CompactPromptID: undefined,
            });
        });

        it('parses raw Config_ JSON strings when Config_Object is not pre-hydrated', () => {
            vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([]);

            const rawOnlyAction = {
                ID: RUN_ADHOC_QUERY_ID,
                Name: 'Run Ad-hoc Query',
                Config_: JSON.stringify({
                    resultExpirationTurns: 2,
                    resultExpirationMode: 'Remove',
                }),
                Config_Object: null,
            } as Partial<MJActionEntityExtended> as MJActionEntityExtended;

            const resolved = ActionLifecycleResolver.ResolveExpirationConfig(rawOnlyAction, SAGE_AGENT_ID);
            expect(resolved).toEqual({
                ExpirationTurns: 2,
                ExpirationMode: 'Remove',
                CompactMode: undefined,
                CompactLength: undefined,
                CompactPromptID: undefined,
            });
        });

        it('allows an active per-agent AIAgentAction row with ResultExpirationTurns to override Action.Config_Object while inheriting unset CompactPromptID', () => {
            const adhocWithActionPrompt = makeActionEntity(
                RUN_ADHOC_QUERY_ID,
                'Run Ad-hoc Query',
                {
                    resultExpirationTurns: 1,
                    resultExpirationMode: 'Compact',
                    compactMode: 'First N Chars',
                    compactLength: 2000,
                    compactPromptId: 'ACTION-CONFIG-PROMPT-ID',
                },
                'DEFAULT-PROMPT-ID'
            );

            vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([
                makeAgentAction({
                    ResultExpirationTurns: 3,
                    ResultExpirationMode: 'Compact',
                    CompactMode: 'AI Summary',
                    CompactLength: null,
                    CompactPromptID: null,
                }),
            ]);

            const resolvedFromConfig = ActionLifecycleResolver.ResolveExpirationConfig(adhocWithActionPrompt, SAGE_AGENT_ID);
            expect(resolvedFromConfig).toEqual({
                ExpirationTurns: 3,
                ExpirationMode: 'Compact',
                CompactMode: 'AI Summary',
                CompactLength: 2000,
                CompactPromptID: 'ACTION-CONFIG-PROMPT-ID',
            });

            const adhocWithEntityDefaultPrompt = makeActionEntity(
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
            const resolvedFromEntityDefault = ActionLifecycleResolver.ResolveExpirationConfig(adhocWithEntityDefaultPrompt, SAGE_AGENT_ID);
            expect(resolvedFromEntityDefault).toEqual({
                ExpirationTurns: 3,
                ExpirationMode: 'Compact',
                CompactMode: 'AI Summary',
                CompactLength: 2000,
                CompactPromptID: 'DEFAULT-PROMPT-ID',
            });
        });

        it('defensively falls back to Action.Config compactMode and compactLength for programmatic in-memory AIAgentAction rows', () => {
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

            vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([
                makeAgentAction({
                    ResultExpirationTurns: 3,
                    ResultExpirationMode: 'Compact',
                    CompactMode: null,
                    CompactLength: null,
                    CompactPromptID: null,
                }),
            ]);

            const resolved = ActionLifecycleResolver.ResolveExpirationConfig(adhocQueryAction, SAGE_AGENT_ID);
            expect(resolved).toEqual({
                ExpirationTurns: 3,
                ExpirationMode: 'Compact',
                CompactMode: 'First N Chars',
                CompactLength: 2000,
                CompactPromptID: 'DEFAULT-PROMPT-ID',
            });
        });

        it('falls back to Action.Config_Object when an AIAgentAction row exists but leaves ResultExpirationTurns null', () => {
            const adhocQueryAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
                resultExpirationTurns: 1,
                resultExpirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
            });

            vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([
                makeAgentAction({
                    ResultExpirationTurns: null,
                    ResultExpirationMode: 'None',
                }),
            ]);

            const resolved = ActionLifecycleResolver.ResolveExpirationConfig(adhocQueryAction, SAGE_AGENT_ID);
            expect(resolved).toEqual({
                ExpirationTurns: 1,
                ExpirationMode: 'Compact',
                CompactMode: 'First N Chars',
                CompactLength: 2000,
                CompactPromptID: undefined,
            });
        });

        it('gives ExecuteAgentParams.messageExpirationOverride highest precedence over both AIAgentAction and Action.Config', () => {
            const adhocQueryAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
                resultExpirationTurns: 1,
                resultExpirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
            });

            const params = makeExecuteParams({
                messageExpirationOverride: {
                    expirationTurns: 0,
                    expirationMode: 'Remove',
                },
            });

            const resolved = ActionLifecycleResolver.ResolveExpirationConfig(adhocQueryAction, SAGE_AGENT_ID, params);
            expect(resolved).toEqual({
                ExpirationTurns: 0,
                ExpirationMode: 'Remove',
                CompactMode: undefined,
                CompactLength: undefined,
                CompactPromptID: undefined,
            });
        });

        it('allows messageExpirationOverride with expirationMode None (with or without expirationTurns) to opt a run out of AIAgentAction and Action.Config expiration', () => {
            const adhocQueryAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
                resultExpirationTurns: 1,
                resultExpirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
            });

            vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([
                makeAgentAction({
                    ResultExpirationTurns: 2,
                    ResultExpirationMode: 'Compact',
                    CompactMode: 'First N Chars',
                    CompactLength: 1000,
                }),
            ]);

            const withoutTurns = ActionLifecycleResolver.ResolveExpirationConfig(
                adhocQueryAction,
                SAGE_AGENT_ID,
                makeExecuteParams({ messageExpirationOverride: { expirationMode: 'None' } })
            );
            expect(withoutTurns).toEqual({ ExpirationTurns: 0, ExpirationMode: 'None' });

            const withTurns = ActionLifecycleResolver.ResolveExpirationConfig(
                adhocQueryAction,
                SAGE_AGENT_ID,
                makeExecuteParams({ messageExpirationOverride: { expirationTurns: 5, expirationMode: 'None' } })
            );
            expect(withTurns).toEqual({ ExpirationTurns: 5, ExpirationMode: 'None' });
        });

        it('logs via LogError and falls back to Config_ or undefined without throwing when Config_Object throws on malformed JSON', () => {
            const logErrorSpy = vi.spyOn(CoreLogging, 'LogError').mockImplementation(() => {});

            const validFallbackAction = {
                ID: RUN_ADHOC_QUERY_ID,
                Name: 'Run Ad-hoc Query',
                Config_: JSON.stringify({ resultExpirationTurns: 2, resultExpirationMode: 'Remove' }),
                get Config_Object(): MJActionEntity_IActionConfiguration | null {
                    throw new SyntaxError('Unexpected token in Config JSON');
                },
            } as Partial<MJActionEntityExtended> as MJActionEntityExtended;

            expect(ActionLifecycleResolver.GetActionConfigObject(validFallbackAction)).toEqual({
                resultExpirationTurns: 2,
                resultExpirationMode: 'Remove',
            });
            expect(logErrorSpy).toHaveBeenCalledTimes(1);
            expect(logErrorSpy.mock.calls[0][0]).toContain('Run Ad-hoc Query');
            expect(logErrorSpy.mock.calls[0][0]).toContain('Unexpected token in Config JSON');

            const bothBadAction = {
                ID: RUN_ADHOC_QUERY_ID,
                Name: 'Broken Config Action',
                Config_: '{not valid json',
                get Config_Object(): MJActionEntity_IActionConfiguration | null {
                    throw new SyntaxError('Malformed JSON');
                },
            } as Partial<MJActionEntityExtended> as MJActionEntityExtended;

            expect(ActionLifecycleResolver.GetActionConfigObject(bothBadAction)).toBeUndefined();
            expect(logErrorSpy).toHaveBeenCalledTimes(2);
            expect(logErrorSpy.mock.calls[1][0]).toContain('Broken Config Action');
        });

        it('logs a one-time LogError warning when Action.Config specifies incomplete expiration settings (case-insensitive UUID dedupe)', () => {
            ActionLifecycleResolver.ClearIncompleteConfigWarnings();
            vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([]);
            const logErrorSpy = vi.spyOn(CoreLogging, 'LogError').mockImplementation(() => {});

            const upperId = 'AAAAAAAA-0000-0000-0000-000000000901';
            const missingTurnsAction = makeActionEntity(upperId, 'Half Config Missing Turns', {
                resultExpirationMode: 'Compact',
            });
            const missingTurnsLowerAction = makeActionEntity(upperId.toLowerCase(), 'Half Config Missing Turns', {
                resultExpirationMode: 'Compact',
            });
            expect(ActionLifecycleResolver.ResolveExpirationConfig(missingTurnsAction, SAGE_AGENT_ID)).toBeUndefined();
            expect(logErrorSpy).toHaveBeenCalledTimes(1);
            expect(logErrorSpy.mock.calls[0][0]).toContain('Half Config Missing Turns');
            expect(logErrorSpy.mock.calls[0][0]).toContain('without resultExpirationTurns');

            expect(ActionLifecycleResolver.ResolveExpirationConfig(missingTurnsLowerAction, SAGE_AGENT_ID)).toBeUndefined();
            expect(logErrorSpy).toHaveBeenCalledTimes(1);

            const missingModeAction = makeActionEntity('00000000-0000-0000-0000-000000000902', 'Half Config Missing Mode', {
                resultExpirationTurns: 2,
            });
            expect(ActionLifecycleResolver.ResolveExpirationConfig(missingModeAction, SAGE_AGENT_ID)).toBeUndefined();
            expect(logErrorSpy).toHaveBeenCalledTimes(2);
            expect(logErrorSpy.mock.calls[1][0]).toContain('Half Config Missing Mode');
            expect(logErrorSpy.mock.calls[1][0]).toContain('without resultExpirationMode');

            expect(ActionLifecycleResolver.ResolveExpirationConfig(missingModeAction, SAGE_AGENT_ID)).toBeUndefined();
            expect(logErrorSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('Indexing, prototype inheritance, loop metadata, limits & tool-turn merges', () => {
        it('matches mixed-case SQL Server and PostgreSQL UUIDs via IndexActiveAgentActions for expiration and execution limits', () => {
            const pgAgentId = SAGE_AGENT_ID.toLowerCase();
            const pgActionId = RUN_ADHOC_QUERY_ID.toLowerCase();

            const indexed = ActionLifecycleResolver.IndexActiveAgentActions(pgAgentId, [
                makeAgentAction({
                    AgentID: SAGE_AGENT_ID.toUpperCase(),
                    ActionID: RUN_ADHOC_QUERY_ID.toUpperCase(),
                    Status: 'Active',
                    ResultExpirationTurns: 4,
                    ResultExpirationMode: 'Remove',
                    MaxExecutionsPerRun: 7,
                }),
                makeAgentAction({
                    AgentID: SAGE_AGENT_ID.toUpperCase(),
                    ActionID: 'BBBBBBBB-0000-0000-0000-000000000002',
                    Status: 'Revoked',
                    ResultExpirationTurns: 1,
                    ResultExpirationMode: 'Remove',
                    MaxExecutionsPerRun: 1,
                }),
            ]);

            const pgAction = makeActionEntity(pgActionId, 'Run Ad-hoc Query', {
                resultExpirationTurns: 1,
                resultExpirationMode: 'Compact',
                maxExecutionsPerRun: 3,
            });

            expect(ActionLifecycleResolver.ResolveExpirationConfig(pgAction, pgAgentId, undefined, indexed)).toEqual({
                ExpirationTurns: 4,
                ExpirationMode: 'Remove',
                CompactMode: undefined,
                CompactLength: undefined,
                CompactPromptID: undefined,
            });
            expect(ActionLifecycleResolver.ResolveMaxExecutionsPerRun(pgAction, pgAgentId, undefined, indexed)).toBe(7);

            const revokedAction = makeActionEntity('bbbbbbbb-0000-0000-0000-000000000002', 'Revoked Action');
            expect(indexed.Get(revokedAction.ID)).toBeUndefined();
            expect(
                ActionLifecycleResolver.ResolveMaxExecutionsPerRun(
                    revokedAction,
                    pgAgentId,
                    { 'BBBBBBBB-0000-0000-0000-000000000002': 9 },
                    indexed
                )
            ).toBe(9);
        });

        it('honors BaseAgentID prototype inheritance and avoids scanning global AgentActions on skill-only agents', () => {
            const parentAgentId = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
            const derivedInstanceId = 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB';
            vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([
                makeAgentAction({
                    AgentID: parentAgentId,
                    ActionID: RUN_ADHOC_QUERY_ID,
                    Status: 'Active',
                    ResultExpirationTurns: 4,
                    ResultExpirationMode: 'Remove',
                    MaxExecutionsPerRun: 6,
                }),
            ]);
            const derivedIndexed = ActionLifecycleResolver.IndexActiveAgentActions(derivedInstanceId);
            const adhoc = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
                resultExpirationTurns: 1,
                resultExpirationMode: 'Compact',
                maxExecutionsPerRun: 2,
            });
            expect(ActionLifecycleResolver.ResolveExpirationConfig(adhoc, derivedInstanceId, undefined, derivedIndexed)).toMatchObject({
                ExpirationTurns: 4,
                ExpirationMode: 'Remove',
            });
            expect(ActionLifecycleResolver.ResolveMaxExecutionsPerRun(adhoc, derivedInstanceId, undefined, derivedIndexed)).toBe(6);

            vi.restoreAllMocks();
            const effectiveSpy = vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([]);
            const globalActionsSpy = vi.spyOn(AIEngine.Instance, 'AgentActions', 'get').mockImplementation(() => {
                throw new Error('Must not scan global AgentActions when GetEffectiveAgentActions exists');
            });
            expect(ActionLifecycleResolver.IndexActiveAgentActions(SAGE_AGENT_ID).Size).toBe(0);
            expect(effectiveSpy).toHaveBeenCalledTimes(1);
            expect(globalActionsSpy).not.toHaveBeenCalled();
            expect(ActionLifecycleResolver.IndexEffectiveAgentActions([makeAgentAction({ Status: 'Revoked' })]).Size).toBe(0);
        });

        it('resolves ForEach/While loop expiration metadata from Action.Config, override opt-outs, and AIAgentAction opt-outs', () => {
            const adhocQueryAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', {
                resultExpirationTurns: 1,
                resultExpirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
            });
            vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([]);

            const params = makeExecuteParams();
            expect(ActionLifecycleResolver.ResolveLoopExpirationMetadata(params, 2, adhocQueryAction)).toMatchObject({
                turnAdded: 2,
                messageType: 'loop-result',
                expirationTurns: 1,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 2000,
            });

            const withoutTurns = ActionLifecycleResolver.ResolveLoopExpirationMetadata(
                makeExecuteParams({ messageExpirationOverride: { expirationMode: 'None' } }),
                1,
                adhocQueryAction
            );
            expect(withoutTurns.expirationTurns).toBeUndefined();
            expect(withoutTurns.expirationMode).toBeUndefined();

            const withTurns = ActionLifecycleResolver.ResolveLoopExpirationMetadata(
                makeExecuteParams({ messageExpirationOverride: { expirationTurns: 5, expirationMode: 'None' } }),
                1,
                adhocQueryAction
            );
            expect(withTurns.expirationTurns).toBeUndefined();
            expect(withTurns.expirationMode).toBeUndefined();

            // Per-agent AIAgentAction opt-out (Mode='None' + non-null ResultExpirationTurns=0)
            vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([
                makeAgentAction({ ResultExpirationTurns: 0, ResultExpirationMode: 'None' }),
            ]);
            const optedOut = ActionLifecycleResolver.ResolveLoopExpirationMetadata(params, 3, adhocQueryAction);
            expect(optedOut.expirationTurns).toBeUndefined();
            expect(optedOut.expirationMode).toBeUndefined();

            // Unconfigured action keeps the 3-turn Remove fallback
            const unconfiguredAction = makeActionEntity('00000000-0000-0000-0000-000000000777', 'Unconfigured Action');
            const fallbackMetadata = ActionLifecycleResolver.ResolveLoopExpirationMetadata(params, 3, unconfiguredAction);
            expect(fallbackMetadata.expirationTurns).toBe(3);
            expect(fallbackMetadata.expirationMode).toBe('Remove');
        });

        it('resolves maxExecutionsPerRun from Action.Config when no AIAgentAction row limit is set', () => {
            vi.spyOn(AIEngine.Instance, 'GetEffectiveAgentActions').mockReturnValue([]);
            const limitedAction = makeActionEntity(RUN_ADHOC_QUERY_ID, 'Run Ad-hoc Query', { maxExecutionsPerRun: 5 });
            expect(ActionLifecycleResolver.ResolveMaxExecutionsPerRun(limitedAction, SAGE_AGENT_ID)).toBe(5);
        });

        it('breaks expiration ties deterministically, round-trips metadata fields, formats hints, and prevents loser compact* leakage on merge', () => {
            expect(
                ActionLifecycleResolver.PickMostRestrictiveExpiration([
                    { ExpirationTurns: 1, ExpirationMode: 'Compact', CompactMode: 'First N Chars', CompactLength: 2000 },
                    { ExpirationTurns: 1, ExpirationMode: 'Remove' },
                ])
            ).toEqual({ ExpirationTurns: 1, ExpirationMode: 'Remove' });

            expect(
                ActionLifecycleResolver.PickMostRestrictiveExpiration([
                    { ExpirationTurns: 1, ExpirationMode: 'Compact', CompactMode: 'First N Chars', CompactLength: 2000 },
                    { ExpirationTurns: 1, ExpirationMode: 'Compact', CompactMode: 'First N Chars', CompactLength: 500 },
                ])?.CompactLength
            ).toBe(500);

            const roundTripCfg: ResolvedActionExpirationConfig = {
                ExpirationTurns: 2,
                ExpirationMode: 'Compact',
                CompactMode: 'First N Chars',
                CompactLength: 800,
                CompactPromptID: 'p-1',
            };
            const projected = ActionLifecycleResolver.ExpirationToMetadataFields(roundTripCfg);
            expect(ActionLifecycleResolver.MetadataToExpirationConfig({ turnAdded: 1, ...projected })).toEqual(roundTripCfg);
            expect(ActionLifecycleResolver.ExpirationToMetadataFields({ ExpirationTurns: 0, ExpirationMode: 'None' })).toEqual({});

            expect(ActionResultSpilloverManager.FormatSpilloverHint(['A', 'B'], true, 'sentence')).toBe(
                ' Full output remains queryable via artifact tools on Artifact A, B.'
            );
            expect(ActionResultSpilloverManager.FormatSpilloverHint(['A'], true, 'semicolon')).toBe(
                '; full output remains queryable via artifact tools on Artifact A'
            );
            expect(ActionResultSpilloverManager.FormatSpilloverHint(['A'], false)).toBe('');
            expect(ActionResultSpilloverManager.FormatSpilloverHint([], true)).toBe('');

            const mergedNoneAndCompact = ActionLifecycleResolver.MergeToolTurnMetadata(
                { turnAdded: 4, messageType: 'action-result', expirationTurns: 0, expirationMode: 'None', artifactIds: ['A'] },
                { turnAdded: 3, messageType: 'action-result', expirationTurns: 2, expirationMode: 'Compact', compactMode: 'First N Chars', compactLength: 500, artifactIds: ['A', 'B'] }
            );
            expect(mergedNoneAndCompact).toMatchObject({
                turnAdded: 3,
                expirationTurns: 2,
                expirationMode: 'Compact',
                compactLength: 500,
                artifactIds: ['A', 'B'],
            });

            const removeBeatsCompact = ActionLifecycleResolver.MergeToolTurnMetadata(
                { turnAdded: 2, messageType: 'action-result', expirationTurns: 1, expirationMode: 'Remove' },
                { turnAdded: 2, messageType: 'action-result', expirationTurns: 1, expirationMode: 'Compact', compactMode: 'AI Summary', compactLength: 500, compactPromptId: 'prompt-loser' }
            );
            expect(removeBeatsCompact?.expirationMode).toBe('Remove');
            expect(removeBeatsCompact?.compactMode).toBeUndefined();
            expect(removeBeatsCompact?.compactLength).toBeUndefined();
            expect(removeBeatsCompact?.compactPromptId).toBeUndefined();

            const firstNBeatsAiSummary = ActionLifecycleResolver.MergeToolTurnMetadata(
                { turnAdded: 2, messageType: 'action-result', expirationTurns: 1, expirationMode: 'Compact', compactMode: 'First N Chars', compactLength: 200 },
                { turnAdded: 2, messageType: 'action-result', expirationTurns: 1, expirationMode: 'Compact', compactMode: 'AI Summary', compactLength: 600, compactPromptId: 'prompt-loser' }
            );
            expect(firstNBeatsAiSummary?.compactMode).toBe('First N Chars');
            expect(firstNBeatsAiSummary?.compactLength).toBe(200);
            expect(firstNBeatsAiSummary?.compactPromptId).toBeUndefined();
        });
    });

    describe('Core metadata verification (#6395)', () => {
        const repoRoot = path.resolve(__dirname, '../../../../..');

        it('sets MaxIterationsPerRun = 20 and ContextWindowMaxTokens = 120000 on Sage in metadata/agents/.sage-agent.json', () => {
            const sageRaw = fs.readFileSync(path.join(repoRoot, 'metadata/agents/.sage-agent.json'), 'utf-8');
            const sageJson = JSON.parse(sageRaw) as Array<{ fields: Record<string, unknown> }>;
            expect(sageJson[0].fields.Name).toBe('Sage');
            expect(sageJson[0].fields.MaxIterationsPerRun).toBe(20);
            expect(sageJson[0].fields.ContextWindowMaxTokens).toBe(120000);
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
