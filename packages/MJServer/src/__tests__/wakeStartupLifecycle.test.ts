import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    AgentWakeTriggerService,
    EventWakeCoalescer,
    WakeStartupGuard,
} from '@memberjunction/ai-agents';
import type { UserInfo } from '@memberjunction/core';
import {
    BeginServerWakeStartupGuard,
    CompleteServerWakeStartupGuard,
    GetServerWakeStartupGuardStatus,
    ResetServerWakeStartupGuard,
} from '../wakeStartupLifecycle.js';

describe('MJServer Wake Startup Lifecycle Guard', () => {
    const fakeSystemUser = {
        ID: '00000000-0000-0000-0000-0000000005E5',
        Name: 'System',
        Email: 'system@mj.local',
        Type: 'Owner',
        IsActive: true,
        UserRoles: [],
    } as unknown as UserInfo;

    beforeEach(() => {
        ResetServerWakeStartupGuard();
        EventWakeCoalescer.Instance.Reset();
    });

    afterEach(() => {
        ResetServerWakeStartupGuard();
        EventWakeCoalescer.Instance.Reset();
    });

    it('transitions idle -> initializing -> ready and blocks spurious startup & retroactive wakes', async () => {
        expect(GetServerWakeStartupGuardStatus().phase).toBe('idle');
        expect(GetServerWakeStartupGuardStatus().isStartupInProgress).toBe(false);

        const bootStart = new Date('2026-11-22T12:00:00.000Z');
        BeginServerWakeStartupGuard('MJServer.Serve test boot', bootStart);

        const duringBoot = GetServerWakeStartupGuardStatus();
        expect(duringBoot.phase).toBe('initializing');
        expect(duringBoot.isStartupInProgress).toBe(true);
        expect(duringBoot.baselineWatermarkISO).toBe(bootStart.toISOString());

        const bootWake = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
            targetUserID: '00000000-0000-0000-0000-00000000A11C',
            targetAgentID: '00000000-0000-0000-0000-00000000C051',
            workstreamKey: 'task:boot-1',
            wakeReason: 'Spurious boot event',
            contextUser: fakeSystemUser,
            now: new Date('2026-11-22T12:00:10.000Z'),
        });
        expect(bootWake.triggered).toBe(false);
        expect(bootWake.resultCode).toBe('SKIPPED_STARTUP_GUARD');

        const readyTime = new Date('2026-11-22T12:01:00.000Z');
        CompleteServerWakeStartupGuard(readyTime);

        const readyStatus = GetServerWakeStartupGuardStatus();
        expect(readyStatus.phase).toBe('ready');
        expect(readyStatus.isStartupInProgress).toBe(false);
        expect(readyStatus.baselineWatermarkISO).toBe(readyTime.toISOString());

        // Retroactive event dated prior to server ready watermark remains suppressed
        const retroactiveWake = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
            targetUserID: '00000000-0000-0000-0000-00000000A11C',
            targetAgentID: '00000000-0000-0000-0000-00000000C051',
            workstreamKey: 'task:old-1',
            wakeReason: 'Retroactive event before server ready',
            eventTimestamp: new Date('2026-11-22T11:55:00.000Z'),
            contextUser: fakeSystemUser,
            now: new Date('2026-11-22T12:02:00.000Z'),
        });
        expect(retroactiveWake.triggered).toBe(false);
        expect(retroactiveWake.resultCode).toBe('SKIPPED_STARTUP_GUARD');

        // Post-ready check passes startup guard cleanly
        const postReadyEval = WakeStartupGuard.Instance.EvaluateEventWakeTrigger({
            EventTimestamp: new Date('2026-11-22T12:02:00.000Z'),
            Source: 'PostDeployWebhook',
        });
        expect(postReadyEval.Allowed).toBe(true);
    });
});
