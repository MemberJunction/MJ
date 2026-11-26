/**
 * @fileoverview Service class backing the Guided Tour Actions (`Start Tour For User`,
 * `Suggest Tours`, `Get Tour Progress`, `Assign Learning Path`). Actions remain thin
 * wrappers that extract parameters and delegate here (`packages/Actions/CLAUDE.md`).
 * @module @memberjunction/tours-server
 */

import {
    RunView,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import {
    MJTourEntity,
    MJTourLearningPathEntity,
    MJTourLearningPathTourLinkEntity,
    MJTourOverrideEntity,
    MJTourPrerequisiteEntity,
    MJTourRunEntity,
    MJUserNotificationEntity,
    MJUserRoleEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import { TourPublisherService } from './tour-publisher.service.js';

export interface StartTourForUserRequest {
    TourKey: string;
    TargetUserID?: string;
    GuideMode?: MJTourRunEntity['GuideMode'];
    NotificationTitle?: string;
    NotificationMessage?: string;
    LaunchedByAgentRunID?: string;
    CreateNotification?: boolean;
}

export interface StartTourForUserResult {
    Success: boolean;
    RunID?: string;
    NotificationID?: string;
    TourID?: string;
    TourVersionID?: string;
    ErrorMessage?: string;
}

export interface SuggestToursRequest {
    TargetUserID?: string;
    ApplicationName?: string;
    EntityName?: string;
    Query?: string;
    Limit?: number;
}

export interface SuggestedTourItem {
    TourID: string;
    TourKey: string;
    Name: string;
    Description: string | null;
    EstimatedMinutes: number | null;
    Priority: number;
    Score: number;
}

export interface SuggestToursResult {
    Success: boolean;
    Tours: SuggestedTourItem[];
    ErrorMessage?: string;
}

export interface GetTourProgressRequest {
    TargetUserID?: string;
    TourKey?: string;
    LearningPathKey?: string;
}

export interface TourProgressSummary {
    TourID: string;
    TourKey: string;
    Name: string;
    LatestStatus: MJTourRunEntity['Status'] | 'Not Started';
    RunCount: number;
    GoalMet: boolean;
    CompletedAt: string | null;
}

export interface LearningPathProgressSummary {
    LearningPathID: string;
    PathKey: string;
    Name: string;
    TotalTours: number;
    RequiredTours: number;
    CompletedRequiredTours: number;
    CompletedTotalTours: number;
    PercentComplete: number;
}

export interface GetTourProgressResult {
    Success: boolean;
    UserID?: string;
    CompletedCount: number;
    InProgressCount: number;
    PendingCount: number;
    GoalMetCount: number;
    Tours: TourProgressSummary[];
    LearningPaths: LearningPathProgressSummary[];
    ErrorMessage?: string;
}

export interface AssignLearningPathRequest {
    LearningPathKey: string;
    TargetUserID?: string;
    TargetRoleName?: string;
    TargetRoleID?: string;
    CreateNotifications?: boolean;
}

export interface AssignLearningPathResult {
    Success: boolean;
    LearningPathID?: string;
    AssignedUserCount: number;
    CreatedRunCount: number;
    CreatedNotificationCount: number;
    ErrorMessage?: string;
}

async function resolveTourVersionId(
    tour: MJTourEntity,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<string | null> {
    if (tour.CurrentVersionID) {
        return tour.CurrentVersionID;
    }
    const snap = await TourPublisherService.Instance.SnapshotIfChanged(tour, contextUser, provider, {
        ChangeSummary: 'Auto-snapshot on tour launch',
    });
    return snap.Success && snap.TourVersionId ? snap.TourVersionId : null;
}

export class TourActionsService {
    constructor(private readonly provider: IMetadataProvider) {}

    public async StartTourForUser(
        req: StartTourForUserRequest,
        contextUser: UserInfo,
    ): Promise<StartTourForUserResult> {
        const tourKey = req.TourKey.trim();
        if (!tourKey) {
            return { Success: false, ErrorMessage: 'TourKey is required.' };
        }
        const targetUserId = req.TargetUserID?.trim() || contextUser.ID;

        const rv = RunView.FromMetadataProvider(this.provider);
        const tourRes = await rv.RunView<MJTourEntity>(
            {
                EntityName: 'MJ: Tours',
                ExtraFilter: `TourKey='${EscapeSQLString(tourKey)}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser,
        );
        if (!tourRes.Success || tourRes.Results.length === 0) {
            return {
                Success: false,
                ErrorMessage: tourRes.ErrorMessage || `Tour '${tourKey}' was not found.`,
            };
        }

        const tour = tourRes.Results[0];
        if (tour.Status === 'Retired') {
            return { Success: false, ErrorMessage: `Tour '${tourKey}' is retired.` };
        }

        const versionId = await resolveTourVersionId(tour, contextUser, this.provider);
        if (!versionId) {
            return {
                Success: false,
                ErrorMessage: `Tour '${tourKey}' has no published TourVersion.`,
            };
        }

        const run = await this.provider.GetEntityObject<MJTourRunEntity>('MJ: Tour Runs', contextUser);
        run.UserID = targetUserId;
        run.TourID = tour.ID;
        run.TourVersionID = versionId;
        run.Status = 'Pending';
        run.GuideMode =
            req.GuideMode ??
            (tour.DefaultGuideMode === 'Chat' || tour.DefaultGuideMode === 'Voice'
                ? tour.DefaultGuideMode
                : 'Visual');
        run.DirectorType = run.GuideMode;
        run.LaunchSource = 'Notification';
        run.LaunchedByAgentRunID = req.LaunchedByAgentRunID ?? null;
        if (!(await run.Save())) {
            return {
                Success: false,
                ErrorMessage:
                    run.LatestResult?.CompleteMessage ?? `Failed creating Pending tour run for '${tourKey}'.`,
            };
        }

        let notificationId: string | undefined;
        if (req.CreateNotification !== false) {
            const notification = await this.provider.GetEntityObject<MJUserNotificationEntity>(
                'MJ: User Notifications',
                contextUser,
            );
            notification.UserID = targetUserId;
            notification.Title = req.NotificationTitle?.trim() || `Guided Tour: ${tour.Name}`;
            notification.Message =
                req.NotificationMessage?.trim() ||
                tour.Description ||
                `Click to start the "${tour.Name}" guided tour.`;
            notification.Unread = true;
            notification.ResourceRecordID = run.ID;
            notification.ResourceConfiguration = JSON.stringify({
                type: 'tour',
                tourKey: tour.TourKey,
                runId: run.ID,
                tourId: tour.ID,
            });
            if (await notification.Save()) {
                notificationId = notification.ID;
            }
        }

        return {
            Success: true,
            RunID: run.ID,
            NotificationID: notificationId,
            TourID: tour.ID,
            TourVersionID: versionId,
        };
    }

    public async SuggestTours(
        req: SuggestToursRequest,
        contextUser: UserInfo,
    ): Promise<SuggestToursResult> {
        const targetUserId = req.TargetUserID?.trim() || contextUser.ID;
        const limit = typeof req.Limit === 'number' && req.Limit > 0 ? Math.min(req.Limit, 25) : 5;
        const rv = RunView.FromMetadataProvider(this.provider);

        const [toursRes, overridesRes, prereqsRes, runsRes, rolesRes] = await rv.RunViews(
            [
                {
                    EntityName: 'MJ: Tours',
                    ExtraFilter: `Status='Active' AND RunInAuthenticatedHosts=1`,
                    ResultType: 'entity_object',
                },
                {
                    EntityName: 'MJ: Tour Overrides',
                    ExtraFilter: `Status='Active'`,
                    ResultType: 'entity_object',
                },
                {
                    EntityName: 'MJ: Tour Prerequisites',
                    ResultType: 'entity_object',
                },
                {
                    EntityName: 'MJ: Tour Runs',
                    ExtraFilter: `UserID='${EscapeSQLString(targetUserId)}'`,
                    ResultType: 'entity_object',
                },
                {
                    EntityName: 'MJ: User Roles',
                    ExtraFilter: `UserID='${EscapeSQLString(targetUserId)}'`,
                    ResultType: 'entity_object',
                },
            ],
            contextUser,
        );

        const failed = [toursRes, overridesRes, prereqsRes, runsRes, rolesRes].find((r) => !r.Success);
        if (failed) {
            return {
                Success: false,
                Tours: [],
                ErrorMessage: failed.ErrorMessage || 'Failed loading tours for suggestion.',
            };
        }

        const tours = (toursRes.Results ?? []) as MJTourEntity[];
        const overrides = (overridesRes.Results ?? []) as MJTourOverrideEntity[];
        const prereqs = (prereqsRes.Results ?? []) as MJTourPrerequisiteEntity[];
        const runs = (runsRes.Results ?? []) as MJTourRunEntity[];
        const userRoleIds = new Set(
            ((rolesRes.Results ?? []) as MJUserRoleEntity[]).map((ur) => ur.RoleID.toLowerCase()),
        );

        const completedTourIds = new Set(
            runs.filter((r) => r.Status === 'Completed').map((r) => r.TourID.toLowerCase()),
        );
        const nowMs = Date.now();
        const snoozedOrDismissedTourIds = new Set(
            runs
                .filter(
                    (r) =>
                        r.Status === 'Dismissed' ||
                        (r.Status === 'Snoozed' && r.SnoozedUntil != null && new Date(r.SnoozedUntil).getTime() > nowMs),
                )
                .map((r) => r.TourID.toLowerCase()),
        );

        const disabledTourIds = new Set<string>();
        for (const ov of overrides) {
            if (!ov.IsDisabled) continue;
            if (ov.Scope === 'Global') {
                disabledTourIds.add(ov.TourID.toLowerCase());
            } else if (ov.Scope === 'Role' && ov.RoleID && userRoleIds.has(ov.RoleID.toLowerCase())) {
                disabledTourIds.add(ov.TourID.toLowerCase());
            } else if (ov.Scope === 'User' && ov.UserID && UUIDsEqual(ov.UserID, targetUserId)) {
                disabledTourIds.add(ov.TourID.toLowerCase());
            }
        }

        const appQuery = req.ApplicationName?.trim().toLowerCase();
        const entityQuery = req.EntityName?.trim().toLowerCase();
        const textTokens = (req.Query ?? '')
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter((t) => t.length > 1);

        const prereqsByTourId = new UUIDMap<MJTourPrerequisiteEntity[]>();
        for (const p of prereqs) {
            const list = prereqsByTourId.Get(p.TourID) ?? [];
            list.push(p);
            prereqsByTourId.Set(p.TourID, list);
        }

        const scored: SuggestedTourItem[] = [];
        for (const tour of tours) {
            const tid = tour.ID.toLowerCase();
            if (disabledTourIds.has(tid) || completedTourIds.has(tid) || snoozedOrDismissedTourIds.has(tid)) {
                continue;
            }

            const tourPrereqs = prereqsByTourId.Get(tour.ID) ?? [];
            const missingRequiredPrereq = tourPrereqs.some(
                (p) =>
                    p.Strength === 'Required' &&
                    p.PrerequisiteType === 'Tour' &&
                    p.RequiredTourID != null &&
                    !completedTourIds.has(p.RequiredTourID.toLowerCase()),
            );
            if (missingRequiredPrereq) {
                continue;
            }

            let score = tour.Priority;
            const startLoc = tour.StartLocationObject;
            if (appQuery) {
                const tourApp = (tour.Application ?? startLoc?.Application ?? '').toLowerCase();
                if (tourApp && tourApp === appQuery) {
                    score += 50;
                }
            }
            if (entityQuery) {
                const startEnt = (startLoc?.Entity ?? startLoc?.RequiresEntity ?? '').toLowerCase();
                if (startEnt && startEnt === entityQuery) {
                    score += 60;
                }
            }
            if (textTokens.length > 0) {
                const haystack = `${tour.TourKey} ${tour.Name} ${tour.Description ?? ''}`.toLowerCase();
                for (const tok of textTokens) {
                    if (haystack.includes(tok)) {
                        score += 25;
                    }
                }
            }

            scored.push({
                TourID: tour.ID,
                TourKey: tour.TourKey,
                Name: tour.Name,
                Description: tour.Description,
                EstimatedMinutes: tour.EstimatedMinutes,
                Priority: tour.Priority,
                Score: score,
            });
        }

        scored.sort((a, b) => b.Score - a.Score || a.Name.localeCompare(b.Name));
        return {
            Success: true,
            Tours: scored.slice(0, limit),
        };
    }

    public async GetTourProgress(
        req: GetTourProgressRequest,
        contextUser: UserInfo,
    ): Promise<GetTourProgressResult> {
        const targetUserId = req.TargetUserID?.trim() || contextUser.ID;
        const rv = RunView.FromMetadataProvider(this.provider);

        const [toursRes, runsRes, pathsRes, pathToursRes] = await rv.RunViews(
            [
                {
                    EntityName: 'MJ: Tours',
                    ExtraFilter: req.TourKey?.trim()
                        ? `TourKey='${EscapeSQLString(req.TourKey.trim())}'`
                        : `Status='Active'`,
                    ResultType: 'entity_object',
                },
                {
                    EntityName: 'MJ: Tour Runs',
                    ExtraFilter: `UserID='${EscapeSQLString(targetUserId)}'`,
                    OrderBy: '__mj_UpdatedAt DESC',
                    ResultType: 'entity_object',
                },
                {
                    EntityName: 'MJ: Tour Learning Paths',
                    ExtraFilter: req.LearningPathKey?.trim()
                        ? `PathKey='${EscapeSQLString(req.LearningPathKey.trim())}'`
                        : `Status='Active'`,
                    ResultType: 'entity_object',
                },
                {
                    EntityName: 'MJ: Tour Learning Path Tour Links',
                    OrderBy: 'Sequence ASC',
                    ResultType: 'entity_object',
                },
            ],
            contextUser,
        );

        const failed = [toursRes, runsRes, pathsRes, pathToursRes].find((r) => !r.Success);
        if (failed) {
            return {
                Success: false,
                CompletedCount: 0,
                InProgressCount: 0,
                PendingCount: 0,
                GoalMetCount: 0,
                Tours: [],
                LearningPaths: [],
                ErrorMessage: failed.ErrorMessage || 'Failed loading tour progress.',
            };
        }

        const tours = (toursRes.Results ?? []) as MJTourEntity[];
        const runs = (runsRes.Results ?? []) as MJTourRunEntity[];
        const paths = (pathsRes.Results ?? []) as MJTourLearningPathEntity[];
        const pathTours = (pathToursRes.Results ?? []) as MJTourLearningPathTourLinkEntity[];

        const runsByTourId = new Map<string, MJTourRunEntity[]>();
        for (const run of runs) {
            const key = run.TourID.toLowerCase();
            const list = runsByTourId.get(key) ?? [];
            list.push(run);
            runsByTourId.set(key, list);
        }

        let completedCount = 0;
        let inProgressCount = 0;
        let pendingCount = 0;
        let goalMetCount = 0;

        const tourSummaries: TourProgressSummary[] = tours.map((t) => {
            const tRuns = runsByTourId.get(t.ID.toLowerCase()) ?? [];
            const completedRun = tRuns.find((r) => r.Status === 'Completed');
            const latest = completedRun ?? tRuns[0];
            const latestStatus = latest ? latest.Status : 'Not Started';
            const goalMet = tRuns.some((r) => r.GoalMetAt != null);

            if (latestStatus === 'Completed') completedCount++;
            else if (latestStatus === 'In Progress') inProgressCount++;
            else if (latestStatus === 'Pending') pendingCount++;
            if (goalMet) goalMetCount++;

            return {
                TourID: t.ID,
                TourKey: t.TourKey,
                Name: t.Name,
                LatestStatus: latestStatus,
                RunCount: tRuns.length,
                GoalMet: goalMet,
                CompletedAt: completedRun?.CompletedAt
                    ? new Date(completedRun.CompletedAt).toISOString()
                    : null,
            };
        });

        const completedTourIds = new Set(
            runs.filter((r) => r.Status === 'Completed').map((r) => r.TourID.toLowerCase()),
        );

        const membersByLearningPathId = new UUIDMap<MJTourLearningPathTourLinkEntity[]>();
        for (const pt of pathTours) {
            const list = membersByLearningPathId.Get(pt.TourLearningPathID) ?? [];
            list.push(pt);
            membersByLearningPathId.Set(pt.TourLearningPathID, list);
        }

        const learningPathSummaries: LearningPathProgressSummary[] = paths.map((lp) => {
            const members = membersByLearningPathId.Get(lp.ID) ?? [];
            const required = members.filter((m) => m.IsRequired);
            const completedRequired = required.filter((m) =>
                completedTourIds.has(m.TourID.toLowerCase()),
            ).length;
            const completedTotal = members.filter((m) =>
                completedTourIds.has(m.TourID.toLowerCase()),
            ).length;
            const pct =
                members.length > 0 ? Math.round((completedTotal / members.length) * 100) : 100;

            return {
                LearningPathID: lp.ID,
                PathKey: lp.PathKey,
                Name: lp.Name,
                TotalTours: members.length,
                RequiredTours: required.length,
                CompletedRequiredTours: completedRequired,
                CompletedTotalTours: completedTotal,
                PercentComplete: pct,
            };
        });

        return {
            Success: true,
            UserID: targetUserId,
            CompletedCount: completedCount,
            InProgressCount: inProgressCount,
            PendingCount: pendingCount,
            GoalMetCount: goalMetCount,
            Tours: tourSummaries,
            LearningPaths: learningPathSummaries,
        };
    }

    public async AssignLearningPath(
        req: AssignLearningPathRequest,
        contextUser: UserInfo,
    ): Promise<AssignLearningPathResult> {
        const pathKey = req.LearningPathKey.trim();
        if (!pathKey) {
            return {
                Success: false,
                AssignedUserCount: 0,
                CreatedRunCount: 0,
                CreatedNotificationCount: 0,
                ErrorMessage: 'LearningPathKey is required.',
            };
        }

        const rv = RunView.FromMetadataProvider(this.provider);
        const pathRes = await rv.RunView<MJTourLearningPathEntity>(
            {
                EntityName: 'MJ: Tour Learning Paths',
                ExtraFilter: `PathKey='${EscapeSQLString(pathKey)}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser,
        );
        if (!pathRes.Success || pathRes.Results.length === 0) {
            return {
                Success: false,
                AssignedUserCount: 0,
                CreatedRunCount: 0,
                CreatedNotificationCount: 0,
                ErrorMessage: pathRes.ErrorMessage || `Learning path '${pathKey}' was not found.`,
            };
        }
        const learningPath = pathRes.Results[0];

        const membersRes = await rv.RunView<MJTourLearningPathTourLinkEntity>(
            {
                EntityName: 'MJ: Tour Learning Path Tour Links',
                ExtraFilter: `TourLearningPathID='${EscapeSQLString(learningPath.ID)}'`,
                OrderBy: 'Sequence ASC',
                ResultType: 'entity_object',
            },
            contextUser,
        );
        if (!membersRes.Success) {
            return {
                Success: false,
                AssignedUserCount: 0,
                CreatedRunCount: 0,
                CreatedNotificationCount: 0,
                ErrorMessage: membersRes.ErrorMessage || 'Failed loading learning path tours.',
            };
        }
        const members = membersRes.Results ?? [];
        if (members.length === 0) {
            return {
                Success: true,
                LearningPathID: learningPath.ID,
                AssignedUserCount: 0,
                CreatedRunCount: 0,
                CreatedNotificationCount: 0,
            };
        }

        const targetUserIds = await this.resolveTargetUserIds(req, contextUser);
        if (targetUserIds.length === 0) {
            return {
                Success: false,
                LearningPathID: learningPath.ID,
                AssignedUserCount: 0,
                CreatedRunCount: 0,
                CreatedNotificationCount: 0,
                ErrorMessage: 'No target users found for learning path assignment.',
            };
        }

        const tourIdFilter = members.map((m) => `'${EscapeSQLString(m.TourID)}'`).join(', ');
        const toursRes = await rv.RunView<MJTourEntity>(
            {
                EntityName: 'MJ: Tours',
                ExtraFilter: `ID IN (${tourIdFilter})`,
                ResultType: 'entity_object',
            },
            contextUser,
        );
        if (!toursRes.Success) {
            return {
                Success: false,
                LearningPathID: learningPath.ID,
                AssignedUserCount: 0,
                CreatedRunCount: 0,
                CreatedNotificationCount: 0,
                ErrorMessage: toursRes.ErrorMessage || 'Failed loading tours for learning path.',
            };
        }
        const toursById = new Map<string, MJTourEntity>(
            (toursRes.Results ?? []).map((t) => [t.ID.toLowerCase(), t]),
        );

        let createdRunCount = 0;
        let createdNotificationCount = 0;

        for (const userId of targetUserIds) {
            const existingRes = await rv.RunView<MJTourRunEntity>(
                {
                    EntityName: 'MJ: Tour Runs',
                    ExtraFilter: `UserID='${EscapeSQLString(userId)}' AND Status IN ('Pending', 'In Progress', 'Completed')`,
                    ResultType: 'entity_object',
                },
                contextUser,
            );
            const existingTourIds = new Set(
                ((existingRes.Results ?? []) as MJTourRunEntity[]).map((r) => r.TourID.toLowerCase()),
            );

            let firstAssignedRun: { Tour: MJTourEntity; RunID: string } | null = null;

            for (const member of members) {
                const tour = toursById.get(member.TourID.toLowerCase());
                if (!tour || tour.Status === 'Retired') continue;
                if (existingTourIds.has(tour.ID.toLowerCase())) continue;

                const versionId = await resolveTourVersionId(tour, contextUser, this.provider);
                if (!versionId) continue;

                const run = await this.provider.GetEntityObject<MJTourRunEntity>('MJ: Tour Runs', contextUser);
                run.UserID = userId;
                run.TourID = tour.ID;
                run.TourVersionID = versionId;
                run.Status = 'Pending';
                run.GuideMode =
                    tour.DefaultGuideMode === 'Chat' || tour.DefaultGuideMode === 'Voice'
                        ? tour.DefaultGuideMode
                        : 'Visual';
                run.DirectorType = run.GuideMode;
                run.LaunchSource = 'Learning Path';
                if (await run.Save()) {
                    createdRunCount++;
                    if (!firstAssignedRun) {
                        firstAssignedRun = { Tour: tour, RunID: run.ID };
                    }
                }
            }

            if (firstAssignedRun && req.CreateNotifications !== false) {
                const notif = await this.provider.GetEntityObject<MJUserNotificationEntity>(
                    'MJ: User Notifications',
                    contextUser,
                );
                notif.UserID = userId;
                notif.Title = `Learning Path Assigned: ${learningPath.Name}`;
                notif.Message =
                    learningPath.Description ||
                    `You have been assigned the "${learningPath.Name}" learning path. Click to begin "${firstAssignedRun.Tour.Name}".`;
                notif.Unread = true;
                notif.ResourceRecordID = firstAssignedRun.RunID;
                notif.ResourceConfiguration = JSON.stringify({
                    type: 'tour',
                    tourKey: firstAssignedRun.Tour.TourKey,
                    runId: firstAssignedRun.RunID,
                    learningPathKey: learningPath.PathKey,
                });
                if (await notif.Save()) {
                    createdNotificationCount++;
                }
            }
        }

        return {
            Success: true,
            LearningPathID: learningPath.ID,
            AssignedUserCount: targetUserIds.length,
            CreatedRunCount: createdRunCount,
            CreatedNotificationCount: createdNotificationCount,
        };
    }

    private async resolveTargetUserIds(
        req: AssignLearningPathRequest,
        contextUser: UserInfo,
    ): Promise<string[]> {
        if (req.TargetUserID?.trim()) {
            return [req.TargetUserID.trim()];
        }

        let roleId = req.TargetRoleID?.trim();
        if (!roleId && req.TargetRoleName?.trim()) {
            const roleNameLower = req.TargetRoleName.trim().toLowerCase();
            const role = (this.provider.Roles ?? []).find(
                (r) => r.Name?.trim().toLowerCase() === roleNameLower,
            );
            roleId = role?.ID;
        }

        if (!roleId) {
            return [contextUser.ID];
        }

        const rv = RunView.FromMetadataProvider(this.provider);
        const urRes = await rv.RunView<MJUserRoleEntity>(
            {
                EntityName: 'MJ: User Roles',
                ExtraFilter: `RoleID='${EscapeSQLString(roleId)}'`,
                ResultType: 'entity_object',
            },
            contextUser,
        );
        if (!urRes.Success) {
            return [];
        }
        const uniqueIds = new Set<string>();
        for (const ur of urRes.Results ?? []) {
            if (ur.UserID) {
                uniqueIds.add(ur.UserID);
            }
        }
        return [...uniqueIds];
    }
}
