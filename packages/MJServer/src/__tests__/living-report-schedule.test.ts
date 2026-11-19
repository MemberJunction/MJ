import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('type-graphql', async (importOriginal) => {
    const actual = await importOriginal<typeof import('type-graphql')>();
    const noopDecorator = () => () => undefined;
    return {
        ...actual,
        Resolver: noopDecorator,
        Query: noopDecorator,
        Mutation: noopDecorator,
        Subscription: noopDecorator,
        Arg: noopDecorator,
        Ctx: noopDecorator,
        ObjectType: noopDecorator,
        InputType: noopDecorator,
        Field: noopDecorator,
    };
});

vi.mock('../config.js', () => ({
    configInfo: {
        publicUrl: '',
    },
}));

import { ActionEngineServer } from '@memberjunction/actions';
import { GovernedArtifactService } from '@memberjunction/ai-agents';
import { type IMetadataProvider, RunView, type UserInfo } from '@memberjunction/core';
import { ArtifactPermissionEngine, type MJScheduledJobEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { SchedulingEngineBase } from '@memberjunction/scheduling-engine-base';
import {
    ACTION_SCHEDULED_JOB_TYPE_ID,
    BuildLivingReportJobConfiguration,
    LIVING_REPORT_ACTION_DRIVER_CLASS,
    LIVING_REPORT_DEFAULT_ACTION_ID,
    LIVING_REPORT_FALLBACK_PARAM_IDS,
    ParseLivingReportJobConfiguration,
    ValidateLivingReportScheduleInput,
    ValidateLivingReportTimezone,
} from '../collaboration/LivingReportScheduleHelpers.js';
import { DocumentCollaborationResolver } from '../resolvers/DocumentCollaborationResolver.js';
import type { AppContext } from '../types.js';

const ARTIFACT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ARTIFACT_ID = '22222222-2222-4222-8222-222222222222';
const SCHEDULE_ID = '33333333-3333-4333-8333-333333333333';
const USER_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SYSTEM_USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function makeUser(id: string, name: string, overrides: Partial<UserInfo> = {}): UserInfo {
    return Object.assign(
        {
            ID: id,
            Name: name,
            Email: `${name.toLowerCase()}@example.com`,
            IsActive: true,
            IsMagicLinkAnonymous: false,
            MagicLinkScope: undefined,
            UserRoles: [{ Role: 'UI' }],
        },
        overrides,
    ) as UserInfo;
}

function makeAppContext(user: UserInfo | undefined, provider: IMetadataProvider): AppContext {
    return {
        userPayload: user
            ? {
                  userRecord: user,
                  email: user.Email,
              }
            : {},
        providers: [{ type: 'Read-Write', provider }],
    } as AppContext;
}

describe('LivingReportScheduleHelpers', () => {
    it('uses canonical seeded Action job type and RefreshAndSnapshotArtifact UUIDs', () => {
        expect(ACTION_SCHEDULED_JOB_TYPE_ID).toBe('3B94DD43-E961-4D85-B7F4-B6783D748766');
        expect(LIVING_REPORT_DEFAULT_ACTION_ID).toBe('A4D18C20-5B3E-4C1A-9E8F-100000000001');
    });

    it('validates IANA timezones cleanly and rejects bogus or raw offset zones', () => {
        expect(ValidateLivingReportTimezone('UTC')).toBe(true);
        expect(ValidateLivingReportTimezone('Etc/UTC')).toBe(true);
        expect(ValidateLivingReportTimezone('America/Chicago')).toBe(true);
        expect(ValidateLivingReportTimezone('Asia/Kolkata')).toBe(true);
        expect(ValidateLivingReportTimezone('Europe/Kyiv')).toBe(true);
        expect(ValidateLivingReportTimezone('US/Eastern')).toBe(true);
        expect(ValidateLivingReportTimezone('Mars/Olympus_Mons')).toBe(false);
        expect(ValidateLivingReportTimezone('+05:30')).toBe(false);
        expect(ValidateLivingReportTimezone('UTC+5')).toBe(false);
        expect(ValidateLivingReportTimezone('')).toBe(false);
    });

    it('accepts valid 5-field and 6-field crons >= 5m and rejects sub-5m, sparse-burst, impossible, and over-length crons', () => {
        const daily = ValidateLivingReportScheduleInput('0 0 8 * * *', 'America/Chicago');
        expect(daily.Valid).toBe(true);
        expect(daily.NextRunAt).toBeInstanceOf(Date);

        const fiveField = ValidateLivingReportScheduleInput('0 8 * * *', 'UTC');
        expect(fiveField.Valid).toBe(true);

        const everySecond = ValidateLivingReportScheduleInput('* * * * * *', 'UTC');
        expect(everySecond.Valid).toBe(false);
        expect(everySecond.ErrorMessage).toContain('at least 5 minutes');

        const everyMinute = ValidateLivingReportScheduleInput('0 */1 * * * *', 'UTC');
        expect(everyMinute.Valid).toBe(false);
        expect(everyMinute.ErrorMessage).toContain('at least 5 minutes');

        // Sparse burst passes 6 samples at :00..:25 and fires 1x/minute starting at :25->:26 (caught by 128-sample scan)
        const sparseBurst = ValidateLivingReportScheduleInput('0 0,5,10,15,20,25,26,27,28,29 * * * *', 'UTC');
        expect(sparseBurst.Valid).toBe(false);
        expect(sparseBurst.ErrorMessage).toContain('at least 5 minutes');

        const impossibleDate = ValidateLivingReportScheduleInput('0 0 8 31 2 *', 'UTC');
        expect(impossibleDate.Valid).toBe(false);

        const overLength = ValidateLivingReportScheduleInput('0 ' + '1,'.repeat(65) + '59 * * * *', 'UTC');
        expect(overLength.Valid).toBe(false);
    });

    it('builds strictly Static configs with FreezeRefreshedBlocks=false and ForceRefreshFrozen=false', () => {
        const configJson = BuildLivingReportJobConfiguration({
            actionId: LIVING_REPORT_DEFAULT_ACTION_ID,
            artifactId: ARTIFACT_ID,
            paramIds: {
                ArtifactID: LIVING_REPORT_FALLBACK_PARAM_IDS.ArtifactID,
                FreezeRefreshedBlocks: LIVING_REPORT_FALLBACK_PARAM_IDS.FreezeRefreshedBlocks,
                ForceRefreshFrozen: LIVING_REPORT_FALLBACK_PARAM_IDS.ForceRefreshFrozen,
                ForceSaveIfUnchanged: LIVING_REPORT_FALLBACK_PARAM_IDS.ForceSaveIfUnchanged,
            },
            forceSaveIfUnchanged: true,
        });

        const parsed = ParseLivingReportJobConfiguration(
            configJson,
            new Set([LIVING_REPORT_FALLBACK_PARAM_IDS.ArtifactID.toLowerCase()]),
        );
        expect(parsed).toEqual({
            ActionID: LIVING_REPORT_DEFAULT_ACTION_ID,
            ArtifactID: ARTIFACT_ID,
            ForceSaveIfUnchanged: true,
            HasNonStaticParams: false,
        });

        // Verify FreezeRefreshedBlocks and ForceRefreshFrozen are both hardcoded 'false'
        const raw = JSON.parse(configJson) as { Params: Array<{ ActionParamID: string; ValueType: string; Value: string }> };
        expect(raw.Params.every((p) => p.ValueType === 'Static')).toBe(true);
        expect(raw.Params.find((p) => p.ActionParamID === LIVING_REPORT_FALLBACK_PARAM_IDS.FreezeRefreshedBlocks)?.Value).toBe('false');
        expect(raw.Params.find((p) => p.ActionParamID === LIVING_REPORT_FALLBACK_PARAM_IDS.ForceRefreshFrozen)?.Value).toBe('false');
    });

    it('flags SQL Statement parameters and rejects duplicate ArtifactID params inside parsed configurations', () => {
        const suspiciousConfig = JSON.stringify({
            ActionID: LIVING_REPORT_DEFAULT_ACTION_ID,
            Params: [
                {
                    ActionParamID: LIVING_REPORT_FALLBACK_PARAM_IDS.ArtifactID,
                    ValueType: 'SQL Statement',
                    Value: ARTIFACT_ID,
                },
            ],
        });
        const parsed = ParseLivingReportJobConfiguration(
            suspiciousConfig,
            new Set([LIVING_REPORT_FALLBACK_PARAM_IDS.ArtifactID.toLowerCase()]),
        );
        expect(parsed?.HasNonStaticParams).toBe(true);

        const duplicateConfig = JSON.stringify({
            ActionID: LIVING_REPORT_DEFAULT_ACTION_ID,
            Params: [
                { ActionParamID: LIVING_REPORT_FALLBACK_PARAM_IDS.ArtifactID, ValueType: 'Static', Value: ARTIFACT_ID },
                { ActionParamID: LIVING_REPORT_FALLBACK_PARAM_IDS.ArtifactID, ValueType: 'Static', Value: OTHER_ARTIFACT_ID },
            ],
        });
        expect(
            ParseLivingReportJobConfiguration(
                duplicateConfig,
                new Set([LIVING_REPORT_FALLBACK_PARAM_IDS.ArtifactID.toLowerCase()]),
            ),
        ).toBeNull();
    });
});

describe('DocumentCollaborationResolver Living Report Endpoints', () => {
    const userA = makeUser(USER_A_ID, 'Alice');
    const userB = makeUser(USER_B_ID, 'Bob');
    const systemUser = makeUser(SYSTEM_USER_ID, 'System');

    let resolver: DocumentCollaborationResolver;

    beforeEach(() => {
        resolver = new DocumentCollaborationResolver();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(ActionEngineServer.Instance, 'Config').mockResolvedValue(true);
        vi.spyOn(SchedulingEngineBase.Instance, 'Config').mockResolvedValue(true);
        vi.spyOn(SchedulingEngineBase.Instance, 'GetJobTypeByDriverClass').mockReturnValue({
            ID: ACTION_SCHEDULED_JOB_TYPE_ID,
            DriverClass: 'ActionScheduledJobDriver',
        } as ReturnType<SchedulingEngineBase['GetJobTypeByDriverClass']>);
        vi.spyOn(ActionEngineServer.Instance, 'Actions', 'get').mockReturnValue([
            { ID: LIVING_REPORT_DEFAULT_ACTION_ID, DriverClass: LIVING_REPORT_ACTION_DRIVER_CLASS },
        ] as typeof ActionEngineServer.Instance.Actions);
        vi.spyOn(ActionEngineServer.Instance, 'ActionParams', 'get').mockReturnValue([
            { ActionID: LIVING_REPORT_DEFAULT_ACTION_ID, Name: 'ArtifactID', ID: LIVING_REPORT_FALLBACK_PARAM_IDS.ArtifactID },
            { ActionID: LIVING_REPORT_DEFAULT_ACTION_ID, Name: 'FreezeRefreshedBlocks', ID: LIVING_REPORT_FALLBACK_PARAM_IDS.FreezeRefreshedBlocks },
            { ActionID: LIVING_REPORT_DEFAULT_ACTION_ID, Name: 'ForceRefreshFrozen', ID: LIVING_REPORT_FALLBACK_PARAM_IDS.ForceRefreshFrozen },
            { ActionID: LIVING_REPORT_DEFAULT_ACTION_ID, Name: 'ForceSaveIfUnchanged', ID: LIVING_REPORT_FALLBACK_PARAM_IDS.ForceSaveIfUnchanged },
        ] as typeof ActionEngineServer.Instance.ActionParams);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('RefreshLivingArtifact fails closed for unauthenticated, Magic Link, and read-only callers', async () => {
        const mockProvider = {} as IMetadataProvider;
        const anonRes = await resolver.RefreshLivingArtifact(ARTIFACT_ID, undefined, false, makeAppContext(undefined, mockProvider));
        expect(anonRes.Success).toBe(false);
        expect(anonRes.ErrorMessage).toContain('Authentication required');

        const guestUser = makeUser(USER_B_ID, 'Guest', { IsMagicLinkAnonymous: true });
        const guestRes = await resolver.RefreshLivingArtifact(ARTIFACT_ID, undefined, false, makeAppContext(guestUser, mockProvider));
        expect(guestRes.Success).toBe(false);
        expect(guestRes.ErrorMessage).toContain('Magic Link');

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: ARTIFACT_ID,
            CanRead: true,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            Source: 'Explicit',
            Reason: 'Read only',
        });
        const readOnlyRes = await resolver.RefreshLivingArtifact(ARTIFACT_ID, undefined, false, makeAppContext(userB, mockProvider));
        expect(readOnlyRes.Success).toBe(false);
        expect(readOnlyRes.ErrorMessage).toContain('Permission denied');
    });

    it('RefreshLivingArtifact forces freezeRefreshedBlocks=false & forceRefreshFrozen=false for authorized editors', async () => {
        const mockProvider = {} as IMetadataProvider;
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: ARTIFACT_ID,
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: false,
            Source: 'Explicit',
            Reason: 'Editor',
        });
        const refreshSpy = vi.spyOn(GovernedArtifactService.Instance, 'RefreshAndSnapshotArtifact').mockResolvedValue({
            success: true,
            resultCode: 'SUCCESS',
            message: 'Updated 1 live block',
            changed: true,
            artifactId: ARTIFACT_ID,
            newVersionId: '44444444-4444-4444-8444-444444444444',
            newVersionNumber: 3,
            diffSummary: 'Updated Q3 Revenue table',
            highlightLines: ['Row count 4 -> 6'],
        });

        const res = await resolver.RefreshLivingArtifact(
            ARTIFACT_ID,
            'Triggered from viewer toolbar',
            true,
            makeAppContext(userA, mockProvider),
        );

        expect(res.Success).toBe(true);
        expect(res.Changed).toBe(true);
        expect(res.SavedNewVersion).toBe(true);
        expect(res.VersionNumber).toBe(3);
        expect(refreshSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                artifactId: ARTIFACT_ID,
                contextUser: userA,
                freezeRefreshedBlocks: false,
                forceRefreshFrozen: false,
                forceSaveIfUnchanged: true,
            }),
        );
    });

    it('Upsert & Delete enforce schedule ownership + target artifact binding (blocking cross-user/IDOR schedule hijack)', async () => {
        const existingConfigForA = BuildLivingReportJobConfiguration({
            actionId: LIVING_REPORT_DEFAULT_ACTION_ID,
            artifactId: ARTIFACT_ID,
            paramIds: {
                ArtifactID: LIVING_REPORT_FALLBACK_PARAM_IDS.ArtifactID,
                FreezeRefreshedBlocks: LIVING_REPORT_FALLBACK_PARAM_IDS.FreezeRefreshedBlocks,
                ForceRefreshFrozen: LIVING_REPORT_FALLBACK_PARAM_IDS.ForceRefreshFrozen,
                ForceSaveIfUnchanged: LIVING_REPORT_FALLBACK_PARAM_IDS.ForceSaveIfUnchanged,
            },
            forceSaveIfUnchanged: false,
        });

        const existingConfigOtherArtifact = BuildLivingReportJobConfiguration({
            actionId: LIVING_REPORT_DEFAULT_ACTION_ID,
            artifactId: OTHER_ARTIFACT_ID,
            paramIds: {
                ArtifactID: LIVING_REPORT_FALLBACK_PARAM_IDS.ArtifactID,
            },
            forceSaveIfUnchanged: false,
        });

        const jobSaveSpy = vi.fn(async () => true);
        const jobDeleteSpy = vi.fn(async () => true);

        const fakeJob = {
            ID: SCHEDULE_ID,
            JobTypeID: '',
            Name: '',
            Description: '',
            CronExpression: '',
            Timezone: '',
            Status: 'Active',
            OwnerUserID: '',
            Configuration: '',
            NextRunAt: null,
            NewRecord: vi.fn(),
            Load: vi.fn(async () => true),
            Save: jobSaveSpy,
            Delete: jobDeleteSpy,
            RunCount: 0,
            SuccessCount: 0,
            FailureCount: 0,
        } as Partial<MJScheduledJobEntity> as MJScheduledJobEntity;

        const mockProvider = {
            GetEntityObject: vi.fn(async () => fakeJob),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async () => ({
                Success: true,
                Results: [
                    {
                        ID: SCHEDULE_ID,
                        Name: 'Alice Daily Report',
                        CronExpression: '0 0 8 * * *',
                        Timezone: 'UTC',
                        Status: 'Active',
                        Configuration: existingConfigForA,
                        OwnerUserID: USER_A_ID,
                        LastRunAt: null,
                        NextRunAt: new Date(),
                        RunCount: 1,
                        SuccessCount: 1,
                        FailureCount: 0,
                    },
                    {
                        ID: '99999999-9999-4999-8999-999999999999',
                        Name: 'Other Artifact Job',
                        CronExpression: '0 0 8 * * *',
                        Timezone: 'UTC',
                        Status: 'Active',
                        Configuration: existingConfigOtherArtifact,
                        OwnerUserID: USER_B_ID,
                        LastRunAt: null,
                        NextRunAt: new Date(),
                        RunCount: 0,
                        SuccessCount: 0,
                        FailureCount: 0,
                    },
                ],
            })),
        } as Partial<RunView> as RunView);

        // User B has CanEdit (Explicit, not Owner) — cannot overwrite Alice's scheduleId or other artifact's scheduleId
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: ARTIFACT_ID,
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: false,
            Source: 'Explicit',
            Reason: 'Co-editor',
        });

        const hijackAttempt = await resolver.UpsertArtifactLivingReportSchedule(
            ARTIFACT_ID,
            '0 0 9 * * *',
            'UTC',
            'Hijacked',
            true,
            false,
            SCHEDULE_ID,
            makeAppContext(userB, mockProvider),
        );
        expect(hijackAttempt.Success).toBe(false);
        expect(hijackAttempt.ErrorMessage).toContain('only the schedule owner');
        expect(jobSaveSpy).not.toHaveBeenCalled();

        const crossArtifactDelete = await resolver.DeleteArtifactLivingReportSchedule(
            ARTIFACT_ID,
            '99999999-9999-4999-8999-999999999999',
            makeAppContext(userB, mockProvider),
        );
        expect(crossArtifactDelete.Success).toBe(false);
        expect(crossArtifactDelete.ErrorMessage).toContain('not found for this artifact');
        expect(jobDeleteSpy).not.toHaveBeenCalled();

        // Co-editor User B also cannot delete Alice's schedule for ARTIFACT_ID
        const deleteOtherUserSchedule = await resolver.DeleteArtifactLivingReportSchedule(
            ARTIFACT_ID,
            SCHEDULE_ID,
            makeAppContext(userB, mockProvider),
        );
        expect(deleteOtherUserSchedule.Success).toBe(false);
        expect(deleteOtherUserSchedule.ErrorMessage).toContain('Permission denied');

        // User B creating a new schedule stamps OwnerUserID = USER_B_ID & ACTION_SCHEDULED_JOB_TYPE_ID
        const createOwn = await resolver.UpsertArtifactLivingReportSchedule(
            ARTIFACT_ID,
            '0 0 9 * * *',
            'America/Chicago',
            'Bob Hourly Sync',
            true,
            false,
            undefined,
            makeAppContext(userB, mockProvider),
        );
        expect(createOwn.Success).toBe(true);
        expect(jobSaveSpy).toHaveBeenCalledTimes(1);
        expect(fakeJob.JobTypeID).toBe(ACTION_SCHEDULED_JOB_TYPE_ID);
        expect(fakeJob.OwnerUserID).toBe(USER_B_ID);
        expect(createOwn.Schedule?.Timezone).toBe('America/Chicago');
        expect(createOwn.Schedule?.IsCallerScheduleOwner).toBe(true);
        expect(createOwn.Schedule?.CanDelete).toBe(true);

        // Non-owner CanShare co-editor does NOT inherit Alice's ScheduleID in GetArtifactLivingReportSchedule
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: ARTIFACT_ID,
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: true,
            Source: 'Explicit',
            Reason: 'Co-editor with share',
        });
        const getCoEditor = await resolver.GetArtifactLivingReportSchedule(ARTIFACT_ID, makeAppContext(userB, mockProvider));
        expect(getCoEditor.Success).toBe(true);
        expect(getCoEditor.Schedule).toBeUndefined();

        // Artifact Owner (userB as Source='Owner') sees Alice's schedule with IsCallerScheduleOwner=false, CanDelete=true
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: ARTIFACT_ID,
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            Source: 'Owner',
            Reason: 'Artifact Owner',
        });
        const getOwner = await resolver.GetArtifactLivingReportSchedule(ARTIFACT_ID, makeAppContext(userB, mockProvider));
        expect(getOwner.Success).toBe(true);
        expect(getOwner.Schedule?.ScheduleID).toBe(SCHEDULE_ID);
        expect(getOwner.Schedule?.IsCallerScheduleOwner).toBe(false);
        expect(getOwner.Schedule?.CanDelete).toBe(true);

        // Fail closed on null OwnerUserID schedule overwrite attempt
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(async () => ({
                Success: true,
                Results: [
                    {
                        ID: SCHEDULE_ID,
                        Name: 'Admin Job',
                        CronExpression: '0 0 8 * * *',
                        Timezone: 'UTC',
                        Status: 'Active',
                        Configuration: existingConfigForA,
                        OwnerUserID: null,
                        LastRunAt: null,
                        NextRunAt: new Date(),
                        RunCount: 0,
                        SuccessCount: 0,
                        FailureCount: 0,
                    },
                ],
            })),
        } as Partial<RunView> as RunView);
        const nullOwnerHijack = await resolver.UpsertArtifactLivingReportSchedule(
            ARTIFACT_ID,
            '0 0 10 * * *',
            'UTC',
            'Overwritten',
            true,
            false,
            SCHEDULE_ID,
            makeAppContext(userB, mockProvider),
        );
        expect(nullOwnerHijack.Success).toBe(false);
        expect(nullOwnerHijack.ErrorMessage).toContain('only the schedule owner');
    });
});
