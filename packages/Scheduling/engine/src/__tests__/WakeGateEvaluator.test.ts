import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import {
    MJUserRoutineEntity,
    MJUserRoutineEntity_IRoutineWakeConfiguration,
} from '@memberjunction/core-entities';
import {
    WakeGateEvaluator,
    EntityWatermarkSnapshot,
} from '../WakeGateEvaluator';
import {
    ComputeRoutineNextRunAt,
    RoutineNeedsSeeding,
    ComputeResultHash,
} from '../UserRoutineProcessor';
import { UserRoutineDispatcherDriver } from '../drivers/UserRoutineDispatcherDriver';
import { AgentScheduledJobDriver } from '../drivers/AgentScheduledJobDriver';

interface MockRoutineShape {
    ID: string;
    Name: string;
    UserID: string;
    RoutineType: MJUserRoutineEntity['RoutineType'];
    ScheduleMode: MJUserRoutineEntity['ScheduleMode'];
    CronExpression: string | null;
    Timezone: string | null;
    StartAt: Date | null;
    EndAt: Date | null;
    NextRunAt: Date | null;
    LastRunAt: Date | null;
    LastCheckedAt: Date | null;
    LastResultHash: string | null;
    WakeConfiguration: string | null;
    WakeConfigurationObject: MJUserRoutineEntity_IRoutineWakeConfiguration | null;
}

function buildRoutine(overrides: Partial<MockRoutineShape> = {}): MJUserRoutineEntity {
    const base: MockRoutineShape = {
        ID: 'routine-1',
        Name: 'Chief of Staff Q4 OKR Watch',
        UserID: 'user-owner-1',
        RoutineType: 'AgentWake',
        ScheduleMode: 'Adaptive',
        CronExpression: '0 */2 * * *',
        Timezone: 'UTC',
        StartAt: null,
        EndAt: null,
        NextRunAt: new Date('2026-10-17T12:00:00Z'),
        LastRunAt: new Date('2026-10-17T10:00:00Z'),
        LastCheckedAt: new Date('2026-10-17T11:00:00Z'),
        LastResultHash: null,
        WakeConfiguration: null,
        WakeConfigurationObject: null,
        ...overrides,
    };
    return base as unknown as MJUserRoutineEntity;
}

function buildWatermark(overrides: Partial<EntityWatermarkSnapshot> = {}): EntityWatermarkSnapshot {
    return {
        entityName: 'MJ_BizApps_Tasks: Tasks',
        changedCount: 0,
        totalMatchingCount: 5,
        maxUpdatedAt: '2026-10-17T10:30:00Z',
        recordChangeCount: 0,
        sampleRecords: [],
        ...overrides,
    };
}

const contextUser = { ID: 'user-owner-1', Name: 'Alice', IsActive: true } as UserInfo;
const now = new Date('2026-10-17T12:00:00Z');

describe('WakeGateEvaluator — 3-Tier Wake Gate', () => {
    it('fails open when no WakeConfiguration is set', async () => {
        const evaluator = new WakeGateEvaluator();
        const routine = buildRoutine();
        const result = await evaluator.Evaluate(routine, contextUser, now);

        expect(result.shouldWake).toBe(true);
        expect(result.decidedByTier).toBe('None');
        expect(result.watermarkHash).toBeNull();
    });

    it('Tier 0 skips wake when skipIfUnchanged is true and 0 monitored changes occurred', async () => {
        const evaluator = new WakeGateEvaluator({
            collectWatermark: async () => buildWatermark({ changedCount: 0, recordChangeCount: 0 }),
        });
        const routine = buildRoutine({
            WakeConfigurationObject: {
                watchedEntities: [{ entityName: 'MJ_BizApps_Tasks: Tasks', alias: 'tasks' }],
                wakeGate: { skipIfUnchanged: true },
            },
        });

        const result = await evaluator.Evaluate(routine, contextUser, now);
        expect(result.shouldWake).toBe(false);
        expect(result.decidedByTier).toBe('Tier0');
        expect(result.reason).toContain('0 monitored entity changes');
    });

    it('Tier 0 skips wake when watermarkHash matches routine.LastResultHash', async () => {
        const snapshot = buildWatermark({ changedCount: 2, recordChangeCount: 1 });
        const expectedWatermarks = { tasks: snapshot };
        const hash = ComputeResultHash(JSON.stringify(expectedWatermarks));

        const evaluator = new WakeGateEvaluator({
            collectWatermark: async () => snapshot,
        });
        const routine = buildRoutine({
            LastResultHash: hash,
            WakeConfigurationObject: {
                watchedEntities: [{ entityName: 'MJ_BizApps_Tasks: Tasks', alias: 'tasks' }],
                wakeGate: { skipIfUnchanged: true },
            },
        });

        const result = await evaluator.Evaluate(routine, contextUser, now);
        expect(result.shouldWake).toBe(false);
        expect(result.decidedByTier).toBe('Tier0');
        expect(result.reason).toContain('hash is unchanged');
    });

    it('Tier 0 forces a heartbeat wake when forceWakeAfterMinutes has elapsed even if unchanged', async () => {
        const evaluator = new WakeGateEvaluator({
            collectWatermark: async () => buildWatermark({ changedCount: 0, recordChangeCount: 0 }),
        });
        const routine = buildRoutine({
            LastRunAt: new Date('2026-10-17T03:00:00Z'), // 9 hours ago (540 min)
            WakeConfigurationObject: {
                watchedEntities: [{ entityName: 'MJ_BizApps_Tasks: Tasks', alias: 'tasks' }],
                wakeGate: {
                    skipIfUnchanged: true,
                    forceWakeAfterMinutes: 480,
                },
            },
        });

        const result = await evaluator.Evaluate(routine, contextUser, now);
        expect(result.shouldWake).toBe(true);
        expect(result.decidedByTier).toBe('Tier0');
    });

    it('Tier 1 evaluates SafeExpressionEvaluator deterministically and skips when false', async () => {
        const evaluator = new WakeGateEvaluator({
            collectWatermark: async () => buildWatermark({ changedCount: 1, recordChangeCount: 0 }),
        });
        const routine = buildRoutine({
            WakeConfigurationObject: {
                watchedEntities: [{ entityName: 'MJ_BizApps_Tasks: Tasks', alias: 'tasks' }],
                resumeState: { minChangesRequired: 3 },
                wakeGate: {
                    skipIfUnchanged: true,
                    tier1Expression: 'deltas.tasks.changedCount >= resumeState.minChangesRequired',
                },
            },
        });

        const result = await evaluator.Evaluate(routine, contextUser, now);
        expect(result.shouldWake).toBe(false);
        expect(result.decidedByTier).toBe('Tier1');
        expect(result.reason).toContain('evaluated to false');
    });

    it('Tier 1 wakes immediately when expression evaluates to true and no Tier 2/3 is configured', async () => {
        const evaluator = new WakeGateEvaluator({
            collectWatermark: async () => buildWatermark({ changedCount: 4, recordChangeCount: 0 }),
        });
        const routine = buildRoutine({
            WakeConfigurationObject: {
                watchedEntities: [{ entityName: 'MJ_BizApps_Tasks: Tasks', alias: 'tasks' }],
                resumeState: { minChangesRequired: 3 },
                wakeGate: {
                    skipIfUnchanged: true,
                    tier1Expression: 'deltas.tasks.changedCount >= resumeState.minChangesRequired',
                },
            },
        });

        const result = await evaluator.Evaluate(routine, contextUser, now);
        expect(result.shouldWake).toBe(true);
        expect(result.decidedByTier).toBe('Tier1');
    });

    it('Tier 2 decision suppresses wake when probability is below wakeIfAtLeast and wakes when met', async () => {
        const runTier2 = vi.fn()
            .mockResolvedValueOnce({ shouldWake: false, probability: 0.42, promptRunId: 'pr-1' })
            .mockResolvedValueOnce({ shouldWake: true, probability: 0.88, promptRunId: 'pr-2' });

        const evaluator = new WakeGateEvaluator({
            collectWatermark: async () => buildWatermark({ changedCount: 2 }),
            runTier2Decision: runTier2,
        });
        const routine = buildRoutine({
            WakeConfigurationObject: {
                watchedEntities: [{ entityName: 'MJ_BizApps_Tasks: Tasks', alias: 'tasks' }],
                wakeGate: {
                    tier1Expression: 'totalChangedCount > 0',
                    tier2Decision: {
                        question: 'Did any high-priority OKR slip into AtRisk or OffTrack?',
                        type: 'Likelihood',
                        wakeIfAtLeast: 75,
                    },
                },
            },
        });

        const suppressed = await evaluator.Evaluate(routine, contextUser, now);
        expect(suppressed.shouldWake).toBe(false);
        expect(suppressed.decidedByTier).toBe('Tier2');
        expect(suppressed.promptRunId).toBe('pr-1');

        const approved = await evaluator.Evaluate(routine, contextUser, now);
        expect(approved.shouldWake).toBe(true);
        expect(approved.decidedByTier).toBe('Tier2');
        expect(approved.promptRunId).toBe('pr-2');
    });

    it('Tier 3 prompt runs when Tier 1 and Tier 2 pass and Tier 3 is configured', async () => {
        const evaluator = new WakeGateEvaluator({
            collectWatermark: async () => buildWatermark({ changedCount: 2 }),
            runTier2Decision: async () => ({ shouldWake: true, probability: 0.9, promptRunId: 'pr-tier2' }),
            runTier3Prompt: async () => ({
                shouldWake: true,
                reason: 'Executive escalation detected on Q4 revenue target.',
                promptRunId: 'pr-tier3',
            }),
        });
        const routine = buildRoutine({
            WakeConfigurationObject: {
                watchedEntities: [{ entityName: 'MJ_BizApps_Tasks: Tasks', alias: 'tasks' }],
                wakeGate: {
                    tier1Expression: 'totalChangedCount > 0',
                    tier2Decision: {
                        question: 'Is this change material?',
                        wakeIfAtLeast: 70,
                    },
                    tier3WakePromptId: 'prompt-tier-3-id',
                },
            },
        });

        const result = await evaluator.Evaluate(routine, contextUser, now);
        expect(result.shouldWake).toBe(true);
        expect(result.decidedByTier).toBe('Tier3');
        expect(result.reason).toBe('Executive escalation detected on Q4 revenue target.');
        expect(result.promptRunId).toBe('pr-tier3');
    });
});

describe('UserRoutineProcessor — ScheduleMode OneShot & Adaptive', () => {
    it('ComputeRoutineNextRunAt returns StartAt for OneShot without CronExpression when StartAt is in the future', () => {
        const fromTime = new Date('2026-10-17T12:00:00Z');
        const startAt = new Date('2026-10-17T15:30:00Z');
        const next = ComputeRoutineNextRunAt(null, 'UTC', fromTime, startAt, 'OneShot');
        expect(next.toISOString()).toBe('2026-10-17T15:30:00.000Z');
    });

    it('RoutineNeedsSeeding returns false for OneShot when NextRunAt is null and LastRunAt is set', () => {
        const completedOneShot = {
            NextRunAt: null,
            EndAt: null,
            CronExpression: null,
            Timezone: 'UTC',
            StartAt: new Date('2026-10-17T10:00:00Z'),
            ScheduleMode: 'OneShot' as const,
            LastRunAt: new Date('2026-10-17T10:01:00Z'),
        };
        expect(RoutineNeedsSeeding(completedOneShot, now)).toBe(false);
    });
});

describe('Owner User Resolution in UserRoutineDispatcherDriver & AgentScheduledJobDriver', () => {
    const globalRef = globalThis as {
        ___SINGLETON__UserCache?: {
            Users: UserInfo[];
            FindUser(criteria: { ID?: string; Email?: string }): Promise<UserInfo | undefined>;
        };
    };
    let previousCache: typeof globalRef.___SINGLETON__UserCache;

    beforeEach(() => {
        previousCache = globalRef.___SINGLETON__UserCache;
    });

    afterEach(() => {
        globalRef.___SINGLETON__UserCache = previousCache;
    });

    it('resolves routine owner UserInfo from UserCache instead of scheduler daemon user', async () => {
        const daemonUser = { ID: 'system-daemon', Name: 'System', IsActive: true } as UserInfo;
        const ownerUser = { ID: 'user-owner-1', Name: 'Alice', IsActive: true } as UserInfo;
        globalRef.___SINGLETON__UserCache = {
            Users: [daemonUser, ownerUser],
            FindUser: async ({ ID }) => (ID === 'user-owner-1' ? ownerUser : undefined),
        };

        const driver = new UserRoutineDispatcherDriver() as unknown as {
            resolveRoutineOwnerUser(routine: MJUserRoutineEntity, fallback: UserInfo): Promise<UserInfo>;
        };
        const resolved = await driver.resolveRoutineOwnerUser(buildRoutine({ UserID: 'user-owner-1' }), daemonUser);
        expect(resolved).toBe(ownerUser);
    });

    it('fails closed when routine owner or schedule owner is inactive in UserCache', async () => {
        const daemonUser = { ID: 'system-daemon', Name: 'System', IsActive: true } as UserInfo;
        const inactiveUser = { ID: 'user-inactive', Name: 'Inactive Bob', IsActive: false } as UserInfo;
        globalRef.___SINGLETON__UserCache = {
            Users: [daemonUser, inactiveUser],
            FindUser: async ({ ID }) => (ID === 'user-inactive' ? inactiveUser : undefined),
        };

        const routineDriver = new UserRoutineDispatcherDriver() as unknown as {
            resolveRoutineOwnerUser(routine: MJUserRoutineEntity, fallback: UserInfo): Promise<UserInfo>;
        };
        await expect(
            routineDriver.resolveRoutineOwnerUser(buildRoutine({ UserID: 'user-inactive' }), daemonUser)
        ).rejects.toThrow(/inactive/i);

        const jobDriver = new AgentScheduledJobDriver() as unknown as {
            resolveScheduleOwnerUser(
                schedule: { ID?: string; Name?: string; OwnerUserID?: string | null },
                fallback: UserInfo
            ): Promise<UserInfo>;
        };
        await expect(
            jobDriver.resolveScheduleOwnerUser(
                { ID: 'sched-1', Name: 'Daily Brief', OwnerUserID: 'user-inactive' },
                daemonUser
            )
        ).rejects.toThrow(/inactive/i);
    });
});
