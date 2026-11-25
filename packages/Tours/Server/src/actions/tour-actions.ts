/**
 * @fileoverview Thin `BaseAction` wrappers for Guided Tours:
 * - `Start Tour For User`
 * - `Suggest Tours`
 * - `Get Tour Progress`
 * - `Assign Learning Path`
 * All business logic lives in `TourActionsService` (`packages/Actions/CLAUDE.md`).
 * @module @memberjunction/tours-server
 */

import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError, Metadata, type IMetadataProvider } from '@memberjunction/core';
import type { MJTourRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { TourActionsService } from '../services/tour-actions.service.js';

abstract class BaseTourAction extends BaseAction {
    protected getStringParam(
        params: RunActionParams,
        name: string,
        defaultValue?: string,
    ): string | undefined {
        const param = params.Params.find(
            (p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase(),
        );
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const value = String(param.Value).trim();
        return value.length > 0 ? value : defaultValue;
    }

    protected getNumericParam(
        params: RunActionParams,
        name: string,
        defaultValue?: number,
    ): number | undefined {
        const param = params.Params.find(
            (p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase(),
        );
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const parsed = Number(param.Value);
        return Number.isFinite(parsed) ? parsed : defaultValue;
    }

    protected getBooleanParam(
        params: RunActionParams,
        name: string,
        defaultValue: boolean,
    ): boolean {
        const param = params.Params.find(
            (p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase(),
        );
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const value = String(param.Value).trim().toLowerCase();
        if (value === 'true' || value === '1' || value === 'yes') return true;
        if (value === 'false' || value === '0' || value === 'no') return false;
        return defaultValue;
    }

    protected addOutputParam(
        params: RunActionParams,
        name: string,
        value: string | number | boolean | object | null | undefined,
    ): void {
        params.Params.push({
            Name: name,
            Type: 'Output',
            Value: value,
        });
    }

    protected getProvider(params: RunActionParams): IMetadataProvider {
        return params.Provider ?? Metadata.Provider;
    }
}

function parseGuideMode(raw: string | undefined): MJTourRunEntity['GuideMode'] | undefined {
    if (!raw) return undefined;
    if (raw === 'Visual' || raw === 'Chat' || raw === 'Voice') {
        return raw;
    }
    return undefined;
}

/**
 * Action: `Start Tour For User`
 * Creates a `Pending` `MJ: Tour Runs` row for the target user and writes an
 * `MJ: User Notifications` row with `ResourceConfiguration` JSON `{"type":"tour", ...}`.
 */
@RegisterClass(BaseAction, 'Start Tour For User')
export class StartTourForUserAction extends BaseTourAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const tourKey = this.getStringParam(params, 'TourKey');
            if (!tourKey) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: "Parameter 'TourKey' is required.",
                };
            }

            const service = new TourActionsService(this.getProvider(params));
            const result = await service.StartTourForUser(
                {
                    TourKey: tourKey,
                    TargetUserID: this.getStringParam(params, 'TargetUserID'),
                    GuideMode: parseGuideMode(this.getStringParam(params, 'GuideMode')),
                    NotificationTitle: this.getStringParam(params, 'NotificationTitle'),
                    NotificationMessage: this.getStringParam(params, 'NotificationMessage'),
                    LaunchedByAgentRunID: this.getStringParam(params, 'LaunchedByAgentRunID'),
                    CreateNotification: this.getBooleanParam(params, 'CreateNotification', true),
                },
                params.ContextUser,
            );

            if (!result.Success) {
                return {
                    Success: false,
                    ResultCode: 'START_TOUR_FAILED',
                    Message: result.ErrorMessage ?? 'Failed starting tour for user.',
                };
            }

            this.addOutputParam(params, 'RunID', result.RunID);
            this.addOutputParam(params, 'NotificationID', result.NotificationID ?? null);
            this.addOutputParam(params, 'TourID', result.TourID);
            this.addOutputParam(params, 'TourVersionID', result.TourVersionID);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(result),
            };
        } catch (error) {
            LogError(`Error in StartTourForUserAction: ${error instanceof Error ? error.message : String(error)}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: error instanceof Error ? error.message : String(error),
            };
        }
    }
}

/**
 * Action: `Suggest Tours`
 * Returns ranked, eligible tours for a user and optional app/entity/query context.
 */
@RegisterClass(BaseAction, 'Suggest Tours')
export class SuggestToursAction extends BaseTourAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const service = new TourActionsService(this.getProvider(params));
            const result = await service.SuggestTours(
                {
                    TargetUserID: this.getStringParam(params, 'TargetUserID'),
                    ApplicationName: this.getStringParam(params, 'ApplicationName'),
                    EntityName: this.getStringParam(params, 'EntityName'),
                    Query: this.getStringParam(params, 'Query'),
                    Limit: this.getNumericParam(params, 'Limit', 5),
                },
                params.ContextUser,
            );

            if (!result.Success) {
                return {
                    Success: false,
                    ResultCode: 'SUGGEST_TOURS_FAILED',
                    Message: result.ErrorMessage ?? 'Failed suggesting tours.',
                };
            }

            this.addOutputParam(params, 'Tours', result.Tours);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(result.Tours),
            };
        } catch (error) {
            LogError(`Error in SuggestToursAction: ${error instanceof Error ? error.message : String(error)}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: error instanceof Error ? error.message : String(error),
            };
        }
    }
}

/**
 * Action: `Get Tour Progress`
 * Summarizes a user's progress across tours and learning paths.
 */
@RegisterClass(BaseAction, 'Get Tour Progress')
export class GetTourProgressAction extends BaseTourAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const service = new TourActionsService(this.getProvider(params));
            const result = await service.GetTourProgress(
                {
                    TargetUserID: this.getStringParam(params, 'TargetUserID'),
                    TourKey: this.getStringParam(params, 'TourKey'),
                    LearningPathKey: this.getStringParam(params, 'LearningPathKey'),
                },
                params.ContextUser,
            );

            if (!result.Success) {
                return {
                    Success: false,
                    ResultCode: 'GET_PROGRESS_FAILED',
                    Message: result.ErrorMessage ?? 'Failed loading tour progress.',
                };
            }

            this.addOutputParam(params, 'Progress', result);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(result),
            };
        } catch (error) {
            LogError(`Error in GetTourProgressAction: ${error instanceof Error ? error.message : String(error)}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: error instanceof Error ? error.message : String(error),
            };
        }
    }
}

/**
 * Action: `Assign Learning Path`
 * Assigns a learning path's tours to a user or role and notifies assignees.
 */
@RegisterClass(BaseAction, 'Assign Learning Path')
export class AssignLearningPathAction extends BaseTourAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const learningPathKey = this.getStringParam(params, 'LearningPathKey');
            if (!learningPathKey) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: "Parameter 'LearningPathKey' is required.",
                };
            }

            const service = new TourActionsService(this.getProvider(params));
            const result = await service.AssignLearningPath(
                {
                    LearningPathKey: learningPathKey,
                    TargetUserID: this.getStringParam(params, 'TargetUserID'),
                    TargetRoleName: this.getStringParam(params, 'TargetRoleName'),
                    TargetRoleID: this.getStringParam(params, 'TargetRoleID'),
                    CreateNotifications: this.getBooleanParam(params, 'CreateNotifications', true),
                },
                params.ContextUser,
            );

            if (!result.Success) {
                return {
                    Success: false,
                    ResultCode: 'ASSIGN_LEARNING_PATH_FAILED',
                    Message: result.ErrorMessage ?? 'Failed assigning learning path.',
                };
            }

            this.addOutputParam(params, 'AssignedUserCount', result.AssignedUserCount);
            this.addOutputParam(params, 'CreatedRunCount', result.CreatedRunCount);
            this.addOutputParam(params, 'CreatedNotificationCount', result.CreatedNotificationCount);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(result),
            };
        } catch (error) {
            LogError(`Error in AssignLearningPathAction: ${error instanceof Error ? error.message : String(error)}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
