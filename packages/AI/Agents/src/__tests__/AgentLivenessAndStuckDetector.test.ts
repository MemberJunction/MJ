import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LimitsConfigResolver } from '@memberjunction/core';
import type { AIPromptParams, ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseAgent } from '../base-agent';
import { AgentLivenessWatchdog } from '../helpers/limits/AgentLivenessWatchdog';
import {
    AgentStuckDetector,
    ComputeCanonicalToolFingerprint,
    IsReadOnlyToolOrActionName,
} from '../helpers/limits/AgentStuckDetector';
import { AgentPromptExecutionHelper } from '../helpers/prompt/AgentPromptExecutionHelper';
import { AgentPromptHelper } from '../helpers/prompt/AgentPromptHelper';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

describe('Slice s12 / A7b: AgentLivenessWatchdog, always-on streaming sink & AgentStuckDetector', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    afterEach(() => {
        vi.useRealTimers();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    describe('AgentLivenessWatchdog', () => {
        it('keeps an actively progressing agent alive well beyond the inactivity window (multi-hour run)', () => {
            const controller = new AbortController();
            const watchdog = new AgentLivenessWatchdog({
                AgentName: 'LongRunningAnalyst',
                InactivityTimeoutMs: 15 * 60 * 1000, // 15m sliding window
                OuterMaxWallClockMs: 72 * 60 * 60 * 1000, // 72h outer ceiling
                StreamChunkTouchThrottleMs: 5_000,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
            });
            watchdog.Start(controller);

            // Simulate 6 hours of work with a progress heartbeat every 10 minutes (< 15m inactivity window).
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

            // Now let the agent genuinely hang for 15 minutes with zero progress signals.
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

            // Keep sending progress every 30s until outer ceiling (120s) fires.
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

            // Wait 60s on external CI check (6x the inactivity window) — MUST NOT abort.
            watchdog.SuspendForExternalWait('ci-check-1', 'Waiting for GitHub Actions');
            vi.advanceTimersByTime(60_000);
            expect(controller.signal.aborted).toBe(false);
            expect(watchdog.GetSnapshot().SuspendedWaitCount).toBe(1);

            // Resume external wait — inactivity window resets fresh to 10s.
            watchdog.ResumeFromExternalWait('ci-check-1');
            expect(watchdog.GetSnapshot().SuspendedWaitCount).toBe(0);
            vi.advanceTimersByTime(9_000);
            expect(controller.signal.aborted).toBe(false);

            vi.advanceTimersByTime(1_000);
            expect(controller.signal.aborted).toBe(true);
            expect(watchdog.GetSnapshot().AbortedBy).toBe('inactivity');
            watchdog.Stop();
        });

        it('chains delays cleanly for multi-week outer ceilings beyond Node 32-bit timer limit (~24.85 days)', () => {
            const controller = new AbortController();
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            const watchdog = new AgentLivenessWatchdog({
                AgentName: 'MonthLongAgent',
                Enabled: false, // disable sliding inactivity so we isolate outer ceiling chaining
                OuterMaxWallClockMs: thirtyDaysMs,
                InactivityAbortReasonPrefix: BaseAgent.AgentInactivityAbortReason,
                TimeoutAbortReasonPrefix: BaseAgent.AgentTimeoutAbortReason,
            });
            watchdog.Start(controller);

            // Advance 25 days (past 2^31 - 1 ms) — must NOT prematurely abort!
            vi.advanceTimersByTime(25 * 24 * 60 * 60 * 1000);
            expect(controller.signal.aborted).toBe(false);

            // Advance final 5 days — outer ceiling now triggers accurately at 30 days.
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

            // Stream a chunk at t=4s (within 5s throttle) and again at t=8s — should stay alive at t=14s!
            vi.advanceTimersByTime(4_000);
            watchdog.RecordProgress({ Kind: 'llm-stream-chunk', Bytes: 20 });
            vi.advanceTimersByTime(4_000);
            watchdog.RecordProgress({ Kind: 'llm-stream-chunk', Bytes: 20 });
            vi.advanceTimersByTime(6_000); // t=14s, only 6s since last chunk at t=8s (< 10s inactivity)
            expect(controller.signal.aborted).toBe(false);

            vi.advanceTimersByTime(4_000); // t=18s, now 10s since last chunk at t=8s
            expect(controller.signal.aborted).toBe(true);
            expect(watchdog.GetSnapshot().AbortedBy).toBe('inactivity');
            watchdog.Stop();
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
                } as unknown as ReturnType<typeof CreateMockAgentRunContext>['AgentTypeInstance'],
                Hooks: {
                    CreateStepEntity: vi.fn(async () => ({ ID: 'step-1', PayloadAtStart: null, PayloadAtEnd: null })),
                    FinalizeStepEntity: vi.fn(async () => undefined),
                    PreparePromptParams: vi.fn(async () => ({ conversationMessages: [] })),
                    ExecutePrompt: vi.fn(async (p: AIPromptParams) => {
                        capturedPromptParams = p;
                        // Simulate provider streaming chunks back into the internal liveness sink.
                        p.onStreaming?.({ content: 'thinking...', isComplete: false, modelName: 'test-model' });
                        p.onStreaming?.({ content: 'done', isComplete: true, modelName: 'test-model' });
                        return { success: true, result: '{}' };
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
            const params: ExecuteAgentParams = {
                agent: { ID: 'agent-1', Name: 'HeadlessAgent' } as MJAIAgentEntityExtended,
                conversationMessages: [],
                // Explicitly omitted: headless execution with no UI onStreaming callback!
                onStreaming: undefined,
            };

            await helper.ExecutePromptStep(
                ctx,
                promptHelper,
                params,
                { agentType: { ID: 'type-1', Name: 'Loop' }, childPrompt: { ID: 'prompt-1', Name: 'TestPrompt' } } as unknown as Parameters<AgentPromptExecutionHelper['ExecutePromptStep']>[3],
                undefined,
                0
            );

            expect(capturedPromptParams).not.toBeNull();
            expect(typeof capturedPromptParams!.onStreaming).toBe('function');
            expect(watchdog.GetSnapshot().StreamChunkCount).toBe(2);
            watchdog.Stop();
        });
    });

    describe('AgentStuckDetector', () => {
        it('produces key-order-independent canonical fingerprints', () => {
            const fp1 = ComputeCanonicalToolFingerprint('SearchRecords', { b: 2, a: 1, nested: { y: true, x: 'ok' } });
            const fp2 = ComputeCanonicalToolFingerprint('  searchrecords ', { nested: { x: 'ok', y: true }, a: 1, b: 2 });
            expect(fp1).toBe(fp2);
        });

        it('injects a course-correction directive on the 3rd identical tool call and pauses if repeated again', () => {
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
        });

        it('injects a wrap-up directive at 30 consecutive read-only steps and escalates to ReadOnlySpiral after grace steps', () => {
            const detector = new AgentStuckDetector();
            const cfg = LimitsConfigResolver.Resolve().Limits.StuckDetector;

            expect(IsReadOnlyToolOrActionName('SearchRecords')).toBe(true);
            expect(IsReadOnlyToolOrActionName('CreateRecord')).toBe(false);
            expect(IsReadOnlyToolOrActionName('UpdateCustomer')).toBe(false);

            for (let step = 1; step <= 29; step++) {
                const res = detector.RecordStepOutcome(
                    {
                        StepType: 'Actions',
                        ActionNames: ['SearchRecords', 'GetRecordDetails'],
                        HasPayloadMutation: false,
                        HasSubAgentDelegation: false,
                        IsTerminal: false,
                    },
                    cfg
                );
                expect(res.Action).toBe('none');
            }

            // 30th consecutive read-only step injects the non-lethal wrap-up directive.
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
            expect(at30.Directive).toContain('30 consecutive read-only investigation steps');

            // Grace steps 31..34 stay non-lethal; step 35 escalates to ReadOnlySpiral pause.
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

            // A mutating action resets the consecutive read-only streak to 0.
            const afterMutation = detector.RecordStepOutcome(
                {
                    StepType: 'Actions',
                    ActionNames: ['CreateReport'],
                    HasPayloadMutation: false,
                    HasSubAgentDelegation: false,
                    IsTerminal: false,
                },
                cfg
            );
            expect(afterMutation.Action).toBe('none');
            expect(afterMutation.ConsecutiveReadOnlySteps).toBe(0);
        });
    });
});
