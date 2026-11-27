import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CreateLongRunningFetch,
    CreateLongRunningFetchDispatcher,
    DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_CONNECT_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_KEEP_ALIVE_MAX_TIMEOUT_MS,
    DEFAULT_LONG_RUNNING_KEEP_ALIVE_TIMEOUT_MS,
    InstallGlobalLongRunningFetchDispatcher,
    ResolveLongRunningFetchDispatcherOptions,
    type DispatcherAwareRequestInit,
    type FetchDispatcherLike,
    type ResolvedUndiciAgentOptions,
    type UndiciModuleLike,
} from '@memberjunction/ai';
import { LimitsConfigResolver } from '@memberjunction/core';
import type {
    AgentConfiguration,
    AIPromptParams,
    AIPromptRunResult,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunStepEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { BaseAgent } from '../base-agent';
import { AgentLivenessWatchdog } from '../helpers/limits/AgentLivenessWatchdog';
import {
    AgentStuckDetector,
    ComputeCanonicalToolFingerprint,
    IsReadOnlyToolOrActionName,
    StableSortedJSON,
} from '../helpers/limits/AgentStuckDetector';
import { AgentPromptExecutionHelper } from '../helpers/prompt/AgentPromptExecutionHelper';
import { AgentPromptHelper } from '../helpers/prompt/AgentPromptHelper';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

describe('Slice s12 / A7b: AgentLivenessWatchdog, always-on streaming sink, AgentStuckDetector & httpDispatcher', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    afterEach(() => {
        vi.useRealTimers();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        vi.restoreAllMocks();
    });

    describe('AgentLivenessWatchdog', () => {
        it('keeps an actively progressing agent alive well beyond the inactivity window (multi-hour run)', () => {
            const controller = new AbortController();
            const watchdog = new AgentLivenessWatchdog({
                AgentName: 'LongRunningAnalyst',
                InactivityTimeoutMs: 15 * 60 * 1000,
                OuterMaxWallClockMs: 72 * 60 * 60 * 1000,
                StreamChunkTouchThrottleMs: 5_000,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
            });
            watchdog.Start(controller);

            for (let slice = 0; slice < 36; slice++) {
                vi.advanceTimersByTime(10 * 60 * 1000);
                watchdog.RecordProgress({ Kind: slice % 2 === 0 ? 'llm-stream-chunk' : 'step-complete', Bytes: 128 });
                expect(controller.signal.aborted).toBe(false);
            }

            const snap = watchdog.GetSnapshot();
            expect(snap.Active).toBe(true);
            expect(snap.ProgressCount).toBe(36);
            expect(snap.StreamChunkCount).toBe(18);
            expect(snap.AbortedBy).toBe('none');

            vi.advanceTimersByTime(15 * 60 * 1000);
            expect(controller.signal.aborted).toBe(true);
            expect(String(controller.signal.reason)).toContain(BaseAgent.AgentInactivityAbortReason);
            expect(BaseAgent.CancellationReasonForAbort(String(controller.signal.reason))).toBe('Timeout');
            expect(watchdog.GetSnapshot().AbortedBy).toBe('inactivity');
            watchdog.Stop();
        });

        it('enforces outer wall-clock safety ceiling even when progress signals continue', () => {
            const controller = new AbortController();
            const onAbort = vi.fn();
            const watchdog = new AgentLivenessWatchdog({
                AgentName: 'CappedAgent',
                InactivityTimeoutMs: 60_000,
                OuterMaxWallClockMs: 120_000,
                StreamChunkTouchThrottleMs: 1_000,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
                OnAbort: onAbort,
            });
            watchdog.Start(controller);

            for (let i = 0; i < 3; i++) {
                vi.advanceTimersByTime(30_000);
                watchdog.RecordProgress({ Kind: 'step-complete' });
                expect(controller.signal.aborted).toBe(false);
            }

            vi.advanceTimersByTime(30_000);
            expect(controller.signal.aborted).toBe(true);
            expect(String(controller.signal.reason)).toContain(BaseAgent.AgentTimeoutAbortReason);
            expect(BaseAgent.CancellationReasonForAbort(String(controller.signal.reason))).toBe('Timeout');
            expect(onAbort).toHaveBeenCalledWith(expect.stringContaining(BaseAgent.AgentTimeoutAbortReason), 'outer-ceiling');
            watchdog.Stop();
        });

        it('suspends sliding inactivity timer during external waits while preserving outer safety ceiling', () => {
            const controller = new AbortController();
            const watchdog = new AgentLivenessWatchdog({
                AgentName: 'CIWatcher',
                InactivityTimeoutMs: 10_000,
                OuterMaxWallClockMs: 100_000,
                StreamChunkTouchThrottleMs: 1_000,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
            });
            watchdog.Start(controller);

            watchdog.SuspendForExternalWait('ci-check-1', 'Waiting for GitHub Actions');
            vi.advanceTimersByTime(60_000);
            expect(controller.signal.aborted).toBe(false);
            expect(watchdog.GetSnapshot().SuspendedWaitCount).toBe(1);
            expect(watchdog.GetSnapshot().ActiveWaitIds).toEqual(['ci-check-1']);

            watchdog.ResumeFromExternalWait('ci-check-1');
            expect(watchdog.GetSnapshot().SuspendedWaitCount).toBe(0);
            expect(watchdog.GetSnapshot().LastProgressKind).toBe('external-wait-resumed');
            vi.advanceTimersByTime(9_000);
            expect(controller.signal.aborted).toBe(false);

            vi.advanceTimersByTime(1_000);
            expect(controller.signal.aborted).toBe(true);
            expect(watchdog.GetSnapshot().AbortedBy).toBe('inactivity');
            watchdog.Stop();
        });

        it('reference-counts overlapping external waits and only resumes inactivity timer when all waits clear', () => {
            const controller = new AbortController();
            const watchdog = new AgentLivenessWatchdog({
                AgentName: 'MultiWaitAgent',
                InactivityTimeoutMs: 10_000,
                OuterMaxWallClockMs: 100_000,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
            });
            watchdog.Start(controller);

            watchdog.SuspendForExternalWait('wait-a', 'CI');
            watchdog.SuspendForExternalWait('wait-b', 'Human');
            expect(watchdog.GetSnapshot().SuspendedWaitCount).toBe(2);

            // Resuming only wait-a keeps inactivity suspended while wait-b remains active
            watchdog.ResumeFromExternalWait('wait-a');
            expect(watchdog.GetSnapshot().SuspendedWaitCount).toBe(1);
            vi.advanceTimersByTime(25_000);
            expect(controller.signal.aborted).toBe(false);

            // Unknown wait ID is a no-op
            watchdog.ResumeFromExternalWait('wait-unknown');
            expect(watchdog.GetSnapshot().SuspendedWaitCount).toBe(1);

            // Resuming final wait re-arms the 10s inactivity timer
            watchdog.ResumeFromExternalWait('wait-b');
            expect(watchdog.GetSnapshot().SuspendedWaitCount).toBe(0);
            vi.advanceTimersByTime(10_000);
            expect(controller.signal.aborted).toBe(true);
            expect(watchdog.GetSnapshot().AbortedBy).toBe('inactivity');
            watchdog.Stop();
        });

        it('chains delays cleanly for multi-week outer ceilings beyond Node 32-bit timer limit (~24.85 days)', () => {
            const controller = new AbortController();
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            const watchdog = new AgentLivenessWatchdog({
                AgentName: 'MonthLongAgent',
                Enabled: false,
                OuterMaxWallClockMs: thirtyDaysMs,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
            });
            watchdog.Start(controller);

            vi.advanceTimersByTime(25 * 24 * 60 * 60 * 1000);
            expect(controller.signal.aborted).toBe(false);

            vi.advanceTimersByTime(5 * 24 * 60 * 60 * 1000);
            expect(controller.signal.aborted).toBe(true);
            expect(watchdog.GetSnapshot().AbortedBy).toBe('outer-ceiling');
            watchdog.Stop();
        });

        it('throttles rapid streaming chunk timer re-arms while still tracking latest stream timestamp', () => {
            const controller = new AbortController();
            const watchdog = new AgentLivenessWatchdog({
                AgentName: 'StreamingAgent',
                InactivityTimeoutMs: 10_000,
                OuterMaxWallClockMs: 120_000,
                StreamChunkTouchThrottleMs: 5_000,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
            });
            watchdog.Start(controller);

            vi.advanceTimersByTime(4_000);
            watchdog.RecordProgress({ Kind: 'llm-stream-chunk', Bytes: 20 });
            vi.advanceTimersByTime(4_000);
            watchdog.RecordProgress({ Kind: 'llm-stream-chunk', Bytes: 20 });
            vi.advanceTimersByTime(6_000);
            expect(controller.signal.aborted).toBe(false);

            vi.advanceTimersByTime(4_000);
            expect(controller.signal.aborted).toBe(true);
            expect(watchdog.GetSnapshot().AbortedBy).toBe('inactivity');
            watchdog.Stop();
        });

        it('Stop() clears all timers idempotently and ignores progress/suspend/resume calls once stopped or aborted', () => {
            const controller = new AbortController();
            const onAbort = vi.fn();
            const watchdog = new AgentLivenessWatchdog({
                AgentName: 'CleanStopAgent',
                InactivityTimeoutMs: 5_000,
                OuterMaxWallClockMs: 10_000,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
                OnAbort: onAbort,
            });
            watchdog.Start(controller);
            expect(watchdog.IsRunning).toBe(true);

            watchdog.Stop();
            watchdog.Stop(); // idempotent
            expect(watchdog.IsRunning).toBe(false);

            // Calls while stopped are safe no-ops
            watchdog.RecordProgress({ Kind: 'step-complete' });
            watchdog.SuspendForExternalWait('w1');
            watchdog.ResumeFromExternalWait('w1');
            expect(watchdog.GetSnapshot().ProgressCount).toBe(0);

            // Advancing well past both timeouts must not abort after Stop()
            vi.advanceTimersByTime(60_000);
            expect(controller.signal.aborted).toBe(false);
            expect(onAbort).not.toHaveBeenCalled();
        });

        it('restarts cleanly on second Start() and handles non-positive/non-finite timeouts safely', () => {
            const controller1 = new AbortController();
            const controller2 = new AbortController();
            const watchdog = new AgentLivenessWatchdog({
                AgentName: 'RestartAgent',
                InactivityTimeoutMs: 5_000,
                OuterMaxWallClockMs: 20_000,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
            });
            watchdog.Start(controller1);
            watchdog.RecordProgress({ Kind: 'action-progress' });
            expect(watchdog.GetSnapshot().ProgressCount).toBe(1);

            // Restarting resets counters and detaches controller1
            watchdog.Start(controller2);
            expect(watchdog.GetSnapshot().ProgressCount).toBe(0);
            expect(watchdog.IsLivenessEnabled).toBe(true);
            expect(watchdog.InactivityTimeoutMs).toBe(5_000);
            expect(watchdog.OuterMaxWallClockMs).toBe(20_000);

            vi.advanceTimersByTime(5_000);
            expect(controller1.signal.aborted).toBe(false);
            expect(controller2.signal.aborted).toBe(true);
            watchdog.Stop();

            // Non-positive/NaN timeouts do not throw or immediately abort
            const zeroController = new AbortController();
            const zeroWatchdog = new AgentLivenessWatchdog({
                AgentName: '',
                InactivityTimeoutMs: 0,
                OuterMaxWallClockMs: Number.NaN,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
            });
            zeroWatchdog.Start(zeroController);
            vi.advanceTimersByTime(10_000);
            expect(zeroController.signal.aborted).toBe(false);
            zeroWatchdog.Stop();
        });
    });

    describe('Always-on liveness streaming sink in AgentPromptExecutionHelper', () => {
        it('attaches an internal onStreaming callback for headless runs when LivenessWatchdog is active', async () => {
            const controller = new AbortController();
            const watchdog = new AgentLivenessWatchdog({
                AgentName: 'HeadlessAgent',
                InactivityTimeoutMs: 15_000,
                OuterMaxWallClockMs: 120_000,
                StreamChunkTouchThrottleMs: 0,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
            });
            watchdog.Start(controller);

            let capturedPromptParams: AIPromptParams | null = null;
            const ctx = CreateMockAgentRunContext({
                LivenessWatchdog: watchdog,
                AgentTypeInstance: {
                    GetPromptForStep: vi.fn(async () => ({ ID: 'prompt-1', Name: 'TestPrompt' })),
                    DetermineNextStep: vi.fn(async () => ({
                        step: 'Success',
                        terminate: true,
                        previousPayload: {},
                        newPayload: {},
                    })),
                } as NonNullable<ReturnType<typeof CreateMockAgentRunContext>['AgentTypeInstance']>,
                Hooks: {
                    CreateStepEntity: vi.fn(
                        async () => ({ ID: 'step-1', PayloadAtStart: null, PayloadAtEnd: null }) as MJAIAgentRunStepEntityExtended
                    ),
                    FinalizeStepEntity: vi.fn(async () => undefined),
                    PreparePromptParams: vi.fn(async () => ({ conversationMessages: [] }) as AIPromptParams),
                    ExecutePrompt: vi.fn(async (p: AIPromptParams) => {
                        capturedPromptParams = p;
                        p.onStreaming?.({ content: 'thinking...', isComplete: false, modelName: 'test-model' });
                        p.onStreaming?.({ content: 'done', isComplete: true, modelName: 'test-model' });
                        return { success: true, result: '{}' } as AIPromptRunResult;
                    }),
                    DetermineNextStep: vi.fn(async () => ({
                        step: 'Success',
                        terminate: true,
                        previousPayload: {},
                        newPayload: {},
                    })),
                    ProcessNextStep: vi.fn(async (step) => step),
                },
            });

            const helper = new AgentPromptExecutionHelper();
            const promptHelper = new AgentPromptHelper();
            const params = {
                agent: { ID: 'agent-1', Name: 'HeadlessAgent' } as MJAIAgentEntityExtended,
                conversationMessages: [],
                onStreaming: undefined,
            } as ExecuteAgentParams;
            const config: AgentConfiguration = {
                success: true,
                agentType: { ID: 'type-1', Name: 'Loop' } as MJAIAgentTypeEntity,
                childPrompt: { ID: 'prompt-1', Name: 'TestPrompt' } as MJAIPromptEntityExtended,
            };

            await helper.ExecutePromptStep(ctx, promptHelper, params, config, undefined, 0);

            expect(capturedPromptParams).not.toBeNull();
            expect(typeof capturedPromptParams!.onStreaming).toBe('function');
            expect(watchdog.GetSnapshot().StreamChunkCount).toBe(2);
            watchdog.Stop();
        });

        it('chains caller-supplied onStreaming callback alongside watchdog chunk progress recording', async () => {
            const controller = new AbortController();
            const watchdog = new AgentLivenessWatchdog({
                AgentName: 'InteractiveAgent',
                InactivityTimeoutMs: 15_000,
                OuterMaxWallClockMs: 120_000,
                StreamChunkTouchThrottleMs: 0,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
            });
            watchdog.Start(controller);

            const callerStreaming = vi.fn();
            const ctx = CreateMockAgentRunContext({
                LivenessWatchdog: watchdog,
                AgentTypeInstance: {
                    GetPromptForStep: vi.fn(async () => ({ ID: 'prompt-1', Name: 'TestPrompt' })),
                    DetermineNextStep: vi.fn(async () => ({
                        step: 'Success',
                        terminate: true,
                        previousPayload: {},
                        newPayload: {},
                    })),
                } as NonNullable<ReturnType<typeof CreateMockAgentRunContext>['AgentTypeInstance']>,
                Hooks: {
                    CreateStepEntity: vi.fn(
                        async () => ({ ID: 'step-2', PayloadAtStart: null, PayloadAtEnd: null }) as MJAIAgentRunStepEntityExtended
                    ),
                    FinalizeStepEntity: vi.fn(async () => undefined),
                    PreparePromptParams: vi.fn(async () => ({ conversationMessages: [] }) as AIPromptParams),
                    ExecutePrompt: vi.fn(async (p: AIPromptParams) => {
                        p.onStreaming?.({ content: 'chunk-1', isComplete: false, modelName: 'test-model' });
                        return { success: true, result: '{}' } as AIPromptRunResult;
                    }),
                    DetermineNextStep: vi.fn(async () => ({
                        step: 'Success',
                        terminate: true,
                        previousPayload: {},
                        newPayload: {},
                    })),
                    ProcessNextStep: vi.fn(async (step) => step),
                },
            });

            const helper = new AgentPromptExecutionHelper();
            const promptHelper = new AgentPromptHelper();
            const params = {
                agent: { ID: 'agent-1', Name: 'InteractiveAgent' } as MJAIAgentEntityExtended,
                conversationMessages: [],
                onStreaming: callerStreaming,
            } as ExecuteAgentParams;
            const config: AgentConfiguration = {
                success: true,
                agentType: { ID: 'type-1', Name: 'Loop' } as MJAIAgentTypeEntity,
                childPrompt: { ID: 'prompt-1', Name: 'TestPrompt' } as MJAIPromptEntityExtended,
            };

            await helper.ExecutePromptStep(ctx, promptHelper, params, config, undefined, 0);

            expect(callerStreaming).toHaveBeenCalledTimes(1);
            expect(watchdog.GetSnapshot().StreamChunkCount).toBe(1);
            watchdog.Stop();
        });
    });

    describe('AgentStuckDetector', () => {
        it('produces key-order-independent canonical fingerprints and handles Dates, undefined, null, and circular references', () => {
            const fp1 = ComputeCanonicalToolFingerprint('SearchRecords', { b: 2, a: 1, nested: { y: true, x: 'ok' } });
            const fp2 = ComputeCanonicalToolFingerprint('  searchrecords ', { nested: { x: 'ok', y: true }, a: 1, b: 2 });
            expect(fp1).toBe(fp2);

            const date = new Date('2026-01-15T12:00:00.000Z');
            expect(StableSortedJSON({ d: date, omitted: undefined, n: null })).toBe(
                '{"d":"2026-01-15T12:00:00.000Z","n":null}'
            );

            const circularObj: Record<string, unknown> = { a: 1 };
            circularObj.self = circularObj;
            expect(StableSortedJSON(circularObj)).toBe('{"a":1,"self":"[Circular]"}');

            const circularArr: unknown[] = [1];
            circularArr.push(circularArr);
            expect(StableSortedJSON(circularArr)).toBe('[1,"[Circular]"]');
        });

        it('IsReadOnlyToolOrActionName classifies camelCase/snake_case read-only vs mutating and empty names', () => {
            expect(IsReadOnlyToolOrActionName('SearchRecords')).toBe(true);
            expect(IsReadOnlyToolOrActionName('get_user_details')).toBe(true);
            expect(IsReadOnlyToolOrActionName('inspectSchema')).toBe(true);
            expect(IsReadOnlyToolOrActionName('CreateRecord')).toBe(false);
            expect(IsReadOnlyToolOrActionName('update_and_get')).toBe(false); // mutating token wins fail-safe
            expect(IsReadOnlyToolOrActionName('deleteItem')).toBe(false);
            expect(IsReadOnlyToolOrActionName('')).toBe(false);
            expect(IsReadOnlyToolOrActionName('___')).toBe(false);
        });

        it('injects a course-correction directive on the 3rd identical tool call, pauses on 4th, and respects WindowSize eviction', () => {
            const detector = new AgentStuckDetector();
            const cfg = LimitsConfigResolver.Resolve().Limits.StuckDetector;

            expect(detector.RecordToolCall('GetRecord', { id: '42', fields: ['Name'] }, cfg).Action).toBe('none');
            expect(detector.RecordToolCall('GetRecord', { fields: ['Name'], id: '42' }, cfg).Action).toBe('none');

            const third = detector.RecordToolCall('GetRecord', { id: '42', fields: ['Name'] }, cfg);
            expect(third.Action).toBe('inject-directive');
            expect(third.CountInWindow).toBe(3);
            expect(third.Directive).toContain('GetRecord');

            const fourth = detector.RecordToolCall('GetRecord', { id: '42', fields: ['Name'] }, cfg);
            expect(fourth.Action).toBe('pause');
            expect(fourth.PauseReason).toBe('StuckToolCallLoop');

            // Eviction beyond small WindowSize does not false-trigger
            const smallWindowDetector = new AgentStuckDetector();
            const smallCfg = { ...cfg, IdenticalToolCallThreshold: 3, WindowSize: 4 };
            expect(smallWindowDetector.RecordToolCall('ReadA', { id: 1 }, smallCfg).Action).toBe('none');
            expect(smallWindowDetector.RecordToolCall('ReadB', { id: 2 }, smallCfg).Action).toBe('none');
            expect(smallWindowDetector.RecordToolCall('ReadC', { id: 3 }, smallCfg).Action).toBe('none');
            expect(smallWindowDetector.RecordToolCall('ReadD', { id: 4 }, smallCfg).Action).toBe('none');
            // ReadA{1} was evicted from window of 4
            expect(smallWindowDetector.RecordToolCall('ReadA', { id: 1 }, smallCfg).CountInWindow).toBe(1);
        });

        it('detects A-B-A-B oscillation loops when alternating calls cross threshold within the window', () => {
            const detector = new AgentStuckDetector();
            const cfg = {
                ...LimitsConfigResolver.Resolve().Limits.StuckDetector,
                IdenticalToolCallThreshold: 3,
                WindowSize: 8,
            };

            expect(detector.RecordToolCall('ReadA', { page: 1 }, cfg).Action).toBe('none');
            expect(detector.RecordToolCall('ReadB', { page: 2 }, cfg).Action).toBe('none');
            expect(detector.RecordToolCall('ReadA', { page: 1 }, cfg).Action).toBe('none');
            expect(detector.RecordToolCall('ReadB', { page: 2 }, cfg).Action).toBe('none');

            const oscA = detector.RecordToolCall('ReadA', { page: 1 }, cfg);
            expect(oscA.Action).toBe('inject-directive');
            const oscB = detector.RecordToolCall('ReadB', { page: 2 }, cfg);
            expect(oscB.Action).toBe('inject-directive');

            const pauseA = detector.RecordToolCall('ReadA', { page: 1 }, cfg);
            expect(pauseA.Action).toBe('pause');
            expect(pauseA.PauseReason).toBe('StuckToolCallLoop');
        });

        it('injects wrap-up directive at 30 consecutive read-only steps, escalates at 35, and resets on mutation/delegation/terminal', () => {
            const detector = new AgentStuckDetector();
            const cfg = LimitsConfigResolver.Resolve().Limits.StuckDetector;

            for (let step = 1; step <= 29; step++) {
                expect(
                    detector.RecordStepOutcome(
                        {
                            StepType: 'Actions',
                            ActionNames: ['SearchRecords', 'GetRecordDetails'],
                            HasPayloadMutation: false,
                            HasSubAgentDelegation: false,
                            IsTerminal: false,
                        },
                        cfg
                    ).Action
                ).toBe('none');
            }

            const at30 = detector.RecordStepOutcome(
                {
                    StepType: 'Actions',
                    ActionNames: ['ListEntities'],
                    HasPayloadMutation: false,
                    HasSubAgentDelegation: false,
                    IsTerminal: false,
                },
                cfg
            );
            expect(at30.Action).toBe('inject-wrap-up-directive');
            expect(at30.ConsecutiveReadOnlySteps).toBe(30);

            for (let step = 31; step <= 34; step++) {
                expect(
                    detector.RecordStepOutcome(
                        {
                            StepType: 'Actions',
                            ActionNames: ['InspectSchema'],
                            HasPayloadMutation: false,
                            HasSubAgentDelegation: false,
                            IsTerminal: false,
                        },
                        cfg
                    ).Action
                ).toBe('none');
            }

            const at35 = detector.RecordStepOutcome(
                {
                    StepType: 'Actions',
                    ActionNames: ['InspectSchema'],
                    HasPayloadMutation: false,
                    HasSubAgentDelegation: false,
                    IsTerminal: false,
                },
                cfg
            );
            expect(at35.Action).toBe('pause');
            expect(at35.PauseReason).toBe('ReadOnlySpiral');

            // Mutating action resets streak to 0
            expect(
                detector.RecordStepOutcome(
                    {
                        StepType: 'Actions',
                        ActionNames: ['CreateReport'],
                        HasPayloadMutation: false,
                        HasSubAgentDelegation: false,
                        IsTerminal: false,
                    },
                    cfg
                ).ConsecutiveReadOnlySteps
            ).toBe(0);

            // Payload mutation resets streak to 0
            detector.RecordStepOutcome(
                { StepType: 'Retry', HasPayloadMutation: false, HasSubAgentDelegation: false, IsTerminal: false },
                cfg
            );
            expect(detector.GetSnapshot().ConsecutiveReadOnlySteps).toBe(1);
            detector.RecordStepOutcome(
                { StepType: 'Retry', HasPayloadMutation: true, HasSubAgentDelegation: false, IsTerminal: false },
                cfg
            );
            expect(detector.GetSnapshot().ConsecutiveReadOnlySteps).toBe(0);
        });

        it('EvaluateStepDecision checks actions & clientTools, skips circuit-broken actions, detects stagnant payload, and honors Enabled=false', () => {
            const detector = new AgentStuckDetector();
            const cfg = {
                ...LimitsConfigResolver.Resolve().Limits.StuckDetector,
                IdenticalToolCallThreshold: 2,
                ReadOnlyStepThreshold: 3,
                ReadOnlyPostDirectiveGraceSteps: 1,
            };
            const params = {
                agent: { ID: 'a1', Name: 'StuckAgent' } as MJAIAgentEntityExtended,
                conversationMessages: [],
            } as ExecuteAgentParams;

            // Circuit-broken action is skipped by StuckDetector tool-call tracking
            const brokenSet = new Set(['BrokenAction']);
            detector.EvaluateStepDecision(
                params,
                { step: 'Actions', terminate: false, actions: [{ name: 'BrokenAction', params: { x: 1 } }] },
                cfg,
                brokenSet
            );
            const brokenSecond = detector.EvaluateStepDecision(
                params,
                { step: 'Actions', terminate: false, actions: [{ name: 'BrokenAction', params: { x: 1 } }] },
                cfg,
                brokenSet
            );
            expect(brokenSecond.InjectedDirectives).toEqual([]);
            expect(brokenSecond.PauseRequest).toBeNull();

            // Repeated clientTools trigger directive injection into conversationMessages
            detector.Reset();
            detector.EvaluateStepDecision(
                params,
                {
                    step: 'ClientTools',
                    terminate: false,
                    clientTools: [{ Name: 'GetDOM', Params: { sel: '#app' }, ToolCallID: 'c1' }],
                    payloadChangeRequest: { updateElements: {} }, // empty mutation = stagnant payload
                },
                cfg
            );
            const secondClient = detector.EvaluateStepDecision(
                params,
                {
                    step: 'ClientTools',
                    terminate: false,
                    clientTools: [{ Name: 'GetDOM', Params: { sel: '#app' }, ToolCallID: 'c2' }],
                    payloadChangeRequest: { updateElements: {} },
                },
                cfg
            );
            expect(secondClient.InjectedDirectives).toHaveLength(1);
            expect(params.conversationMessages).toHaveLength(1);
            expect(detector.GetSnapshot().ConsecutiveReadOnlySteps).toBe(2);

            // Disabled config returns empty outcome without mutating state
            const disabledOutcome = detector.EvaluateStepDecision(
                params,
                { step: 'Actions', terminate: false, actions: [{ name: 'GetDOM', params: {} }] },
                { ...cfg, Enabled: false }
            );
            expect(disabledOutcome).toEqual({ InjectedDirectives: [], PauseRequest: null });
        });
    });

    describe('Long-running HTTP transport dispatcher (httpDispatcher)', () => {
        it('ResolveLongRunningFetchDispatcherOptions applies defaults and sanitizes negative/NaN/Infinity/fractional values', () => {
            expect(ResolveLongRunningFetchDispatcherOptions()).toEqual({
                headersTimeout: DEFAULT_LONG_RUNNING_HEADERS_TIMEOUT_MS,
                bodyTimeout: DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS,
                connectTimeout: DEFAULT_LONG_RUNNING_CONNECT_TIMEOUT_MS,
                keepAliveTimeout: DEFAULT_LONG_RUNNING_KEEP_ALIVE_TIMEOUT_MS,
                keepAliveMaxTimeout: DEFAULT_LONG_RUNNING_KEEP_ALIVE_MAX_TIMEOUT_MS,
            });

            expect(
                ResolveLongRunningFetchDispatcherOptions({
                    headersTimeoutMs: 0,
                    bodyTimeoutMs: -50,
                    connectTimeoutMs: Number.NaN,
                    keepAliveTimeoutMs: Number.POSITIVE_INFINITY,
                    keepAliveMaxTimeoutMs: 12345.9,
                })
            ).toEqual({
                headersTimeout: 0,
                bodyTimeout: DEFAULT_LONG_RUNNING_BODY_TIMEOUT_MS,
                connectTimeout: DEFAULT_LONG_RUNNING_CONNECT_TIMEOUT_MS,
                keepAliveTimeout: DEFAULT_LONG_RUNNING_KEEP_ALIVE_TIMEOUT_MS,
                keepAliveMaxTimeout: 12345,
            });
        });

        it('CreateLongRunningFetchDispatcher and CreateLongRunningFetch stay browser-safe without undici and preserve AbortSignal & headers', async () => {
            expect(CreateLongRunningFetchDispatcher({}, null)).toBeNull();
            expect(CreateLongRunningFetchDispatcher({}, undefined)).toBeNull();

            const observedInits: Array<DispatcherAwareRequestInit | undefined> = [];
            const mockBaseFetch = vi.fn(async (_input: RequestInfo | URL, init?: DispatcherAwareRequestInit) => {
                observedInits.push(init);
                return new Response('ok', { status: 200 });
            });

            // Browser fallback without undici passes through untouched
            const passthrough = CreateLongRunningFetch({}, mockBaseFetch, null);
            const controller = new AbortController();
            await passthrough('https://example.test/api', { method: 'POST', signal: controller.signal });
            expect(observedInits[0]?.dispatcher).toBeUndefined();
            expect(observedInits[0]?.signal).toBe(controller.signal);

            // With undici module, constructs dispatcher and attaches while preserving caller overrides
            let capturedOpts: ResolvedUndiciAgentOptions | null = null;
            const createdDispatcher: FetchDispatcherLike = { close: vi.fn(async () => undefined) };
            const fakeUndici: UndiciModuleLike = {
                Agent: class {
                    public constructor(opts: ResolvedUndiciAgentOptions) {
                        capturedOpts = opts;
                        return createdDispatcher;
                    }
                },
            };

            const wrapped = CreateLongRunningFetch({ headersTimeoutMs: 900_000 }, mockBaseFetch, fakeUndici);
            expect(capturedOpts?.headersTimeout).toBe(900_000);

            await wrapped('https://example.test/v1', {
                method: 'POST',
                headers: { 'x-test': '1' },
                signal: controller.signal,
            });
            expect(observedInits[1]?.dispatcher).toBe(createdDispatcher);
            expect(observedInits[1]?.signal).toBe(controller.signal);

            // Explicit caller dispatcher wins over default dispatcher
            const explicitDispatcher: FetchDispatcherLike = {};
            await wrapped('https://example.test/v2', { dispatcher: explicitDispatcher });
            expect(observedInits[2]?.dispatcher).toBe(explicitDispatcher);
        });

        it('InstallGlobalLongRunningFetchDispatcher installs, restores prior dispatcher idempotently, and handles missing setter gracefully', async () => {
            const noSetter = InstallGlobalLongRunningFetchDispatcher({}, null);
            expect(noSetter.Installed).toBe(false);
            expect(noSetter.Dispatcher).toBeNull();
            await expect(noSetter.Restore()).resolves.toBeUndefined();

            const priorDispatcher: FetchDispatcherLike = { close: vi.fn(async () => undefined) };
            let activeDispatcher: FetchDispatcherLike = priorDispatcher;
            const closeNewSpy = vi.fn(async () => undefined);
            const newDispatcher: FetchDispatcherLike = { close: closeNewSpy };
            const setGlobalSpy = vi.fn((d: FetchDispatcherLike) => {
                activeDispatcher = d;
            });

            const fakeUndici: UndiciModuleLike = {
                Agent: class {
                    public constructor() {
                        return newDispatcher;
                    }
                },
                getGlobalDispatcher: () => activeDispatcher,
                setGlobalDispatcher: setGlobalSpy,
            };

            const installation = InstallGlobalLongRunningFetchDispatcher({ headersTimeoutMs: 0 }, fakeUndici);
            expect(installation.Installed).toBe(true);
            expect(installation.Options.headersTimeout).toBe(0);
            expect(activeDispatcher).toBe(newDispatcher);
            expect(setGlobalSpy).toHaveBeenCalledTimes(1);

            await installation.Restore();
            await installation.Restore(); // idempotent second call
            expect(activeDispatcher).toBe(priorDispatcher);
            expect(setGlobalSpy).toHaveBeenCalledTimes(2);
            expect(closeNewSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('AgentStuckDetector 2.7 regressions (synthetic post-action Retry & inline turn tools)', () => {
        it('does not double-count synthetic post-action Retry continuations or trigger false ReadOnlySpiral on mutating actions', () => {
            const detector = new AgentStuckDetector();
            const cfg = {
                ...LimitsConfigResolver.Resolve().Limits.StuckDetector,
                Enabled: true,
                IdenticalToolCallThreshold: 3,
                WindowSize: 10,
                ReadOnlyStepThreshold: 4,
                ReadOnlyPostDirectiveGraceSteps: 2,
            };
            const params: ExecuteAgentParams = {
                agent: { Name: 'TestAgent' } as MJAIAgentEntityExtended,
                conversationMessages: [],
            };

            // 3 read-only action turns, each followed by a synthetic post-action Retry continuation
            // carrying priorStepResult — must count as 3 steps (NOT 6!), staying below threshold 4.
            for (let i = 0; i < 3; i++) {
                const actOutcome = detector.EvaluateStepDecision(
                    params,
                    {
                        step: 'Actions',
                        terminate: false,
                        actions: [{ name: `Get Record ${i}`, params: { id: i } }],
                    },
                    cfg
                );
                expect(actOutcome.InjectedDirectives).toEqual([]);
                expect(actOutcome.PauseRequest).toBeNull();

                const retryOutcome = detector.EvaluateStepDecision(
                    params,
                    {
                        step: 'Retry',
                        terminate: false,
                        priorStepResult: [{ actionName: `Get Record ${i}`, success: true }],
                    },
                    cfg
                );
                expect(retryOutcome.InjectedDirectives).toEqual([]);
                expect(retryOutcome.PauseRequest).toBeNull();
            }

            // A mutating action in priorStepResult resets the read-only streak to 0
            detector.EvaluateStepDecision(
                params,
                {
                    step: 'Retry',
                    terminate: false,
                    priorStepResult: [{ actionName: 'Create Record', success: true }],
                },
                cfg
            );
            expect(detector.GetSnapshot().ConsecutiveReadOnlySteps).toBe(0);
        });

        it('tracks inline artifactToolCalls for StuckToolCallLoop and resets streak on memoryWrites', () => {
            const detector = new AgentStuckDetector();
            const cfg = {
                ...LimitsConfigResolver.Resolve().Limits.StuckDetector,
                Enabled: true,
                IdenticalToolCallThreshold: 2,
                WindowSize: 10,
                ReadOnlyStepThreshold: 10,
                ReadOnlyPostDirectiveGraceSteps: 2,
            };
            const params: ExecuteAgentParams = {
                agent: { Name: 'InlineToolAgent' } as MJAIAgentEntityExtended,
                conversationMessages: [],
            };

            const first = detector.EvaluateStepDecision(
                params,
                {
                    step: 'Retry',
                    terminate: false,
                    artifactToolCalls: [{ artifactId: 'a1', tool: 'read_section', input: { section: 1 } }],
                },
                cfg
            );
            expect(first.InjectedDirectives).toEqual([]);

            const second = detector.EvaluateStepDecision(
                params,
                {
                    step: 'Retry',
                    terminate: false,
                    artifactToolCalls: [{ artifactId: 'a1', tool: 'read_section', input: { section: 1 } }],
                },
                cfg
            );
            expect(second.InjectedDirectives.length).toBe(1);

            // Inline memoryWrites reset read-only streak
            detector.EvaluateStepDecision(
                params,
                {
                    step: 'Retry',
                    terminate: false,
                    memoryWrites: [{ note: 'Saved insight', type: 'Context' }],
                },
                cfg
            );
            expect(detector.GetSnapshot().ConsecutiveReadOnlySteps).toBe(0);
        });

        it('defers directives during native tool turns, allows changing poll results and list->create->list, and classifies Log Activity / Get Agent Run accurately (B5, C6)', () => {
            const detector = new AgentStuckDetector();
            const cfg = {
                ...LimitsConfigResolver.Resolve().Limits.StuckDetector,
                Enabled: true,
                IdenticalToolCallThreshold: 3,
                WindowSize: 10,
                ReadOnlyStepThreshold: 30,
                ReadOnlyPostDirectiveGraceSteps: 5,
            };

            // C6: refined read-only token & metadata classification
            expect(IsReadOnlyToolOrActionName('HubSpot - Log Activity')).toBe(false);
            expect(IsReadOnlyToolOrActionName('Get Agent Run')).toBe(true);
            expect(IsReadOnlyToolOrActionName('Run Report')).toBe(false);
            expect(IsReadOnlyToolOrActionName('CustomAction', { DisallowWhenTainted: true })).toBe(false);
            expect(IsReadOnlyToolOrActionName('CustomAction', { Verb: 'read' })).toBe(true);

            // B5: native tool turn defers user directive until FlushPendingDirectives
            const nativeParams: ExecuteAgentParams = {
                agent: { Name: 'NativeToolAgent' } as MJAIAgentEntityExtended,
                conversationMessages: [
                    {
                        role: 'assistant',
                        content: '',
                        toolCalls: [{ id: 'tc-1', name: 'GetRecord', arguments: { id: 1 } }],
                    } as unknown as ExecuteAgentParams['conversationMessages'][number],
                ],
            };
            const nativeStep = {
                step: 'Actions' as const,
                terminate: false,
                nativeTurn: { sendResultsNatively: true, assistantText: '', toolCalls: [] },
                actions: [{ name: 'GetRecord', params: { id: 1 } }],
            };
            detector.EvaluateStepDecision(nativeParams, nativeStep, cfg);
            detector.EvaluateStepDecision(nativeParams, nativeStep, cfg);
            const thirdNative = detector.EvaluateStepDecision(nativeParams, nativeStep, cfg);
            expect(thirdNative.InjectedDirectives).toHaveLength(1);
            // Must NOT inject user message immediately while assistant toolCalls are unanswered!
            expect(nativeParams.conversationMessages).toHaveLength(1);
            // After tool result turn arrives, FlushPendingDirectives appends the deferred directive safely
            nativeParams.conversationMessages.push({ role: 'tool', content: '{"ok":true}', toolCallId: 'tc-1' } as unknown as ExecuteAgentParams['conversationMessages'][number]);
            const flushed = detector.FlushPendingDirectives(nativeParams);
            expect(flushed).toHaveLength(1);
            expect(nativeParams.conversationMessages).toHaveLength(3);
            expect(nativeParams.conversationMessages[2].role).toBe('user');

            // B5: polling with changing priorStepResult resets window and never pauses
            const pollDetector = new AgentStuckDetector();
            const pollParams: ExecuteAgentParams = {
                agent: { Name: 'PollAgent' } as MJAIAgentEntityExtended,
                conversationMessages: [],
            };
            for (let poll = 1; poll <= 6; poll++) {
                const res = pollDetector.EvaluateStepDecision(
                    pollParams,
                    {
                        step: 'Actions',
                        terminate: false,
                        actions: [{ name: 'Get Job Status', params: { jobId: 'j-1' } }],
                        priorStepResult: { status: 'running', progressPct: poll * 15 },
                    },
                    cfg
                );
                expect(res.PauseRequest).toBeNull();
            }

            // B5: list -> create -> list resets window on mutating call
            const crudDetector = new AgentStuckDetector();
            const crudParams: ExecuteAgentParams = {
                agent: { Name: 'CrudAgent' } as MJAIAgentEntityExtended,
                conversationMessages: [],
            };
            for (let i = 0; i < 4; i++) {
                const listRes = crudDetector.EvaluateStepDecision(
                    crudParams,
                    { step: 'Actions', terminate: false, actions: [{ name: 'List Items', params: {} }] },
                    cfg
                );
                expect(listRes.PauseRequest).toBeNull();
                crudDetector.EvaluateStepDecision(
                    crudParams,
                    { step: 'Actions', terminate: false, actions: [{ name: 'Create Item', params: { idx: i } }] },
                    cfg
                );
            }
        });
    });
});
