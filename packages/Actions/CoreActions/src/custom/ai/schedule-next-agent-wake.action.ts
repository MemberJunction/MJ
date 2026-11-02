import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { LogError, Metadata, RunView } from '@memberjunction/core';
import {
    MJUserRoutineEntity,
    MJUserRoutineEntity_IRoutineWakeConfiguration,
} from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * Action that allows an autonomous agent (such as the Chief of Staff agent) to self-schedule
 * or update its next wake row in `MJ: User Routines` (`RoutineType = 'AgentWake'`).
 *
 * Security invariants:
 * - Always runs under `params.ContextUser` and scopes `UserRoutine.UserID = params.ContextUser.ID`.
 * - Verify the user has `CanUserRunAgent` permission for the target agent before scheduling.
 * - Upserts by `(UserID, TargetID, WorkstreamKey)` so each workstream maintains a single clean
 *   `AgentWake` routine row rather than accumulating orphaned rows.
 */
@RegisterClass(BaseAction, 'Schedule Next Agent Wake')
export class ScheduleNextAgentWakeAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Schedule Next Agent Wake requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const agentResolution = await this.resolveTargetAgent(params);
            if ('errorResult' in agentResolution) {
                return agentResolution.errorResult;
            }
            const { agentId, agentName } = agentResolution;

            const workstreamKey = (this.getStringParam(params, 'WorkstreamKey') ?? 'default').trim() || 'default';
            const cronExpression = this.getStringParam(params, 'CronExpression');
            const scheduleMode = this.resolveScheduleMode(this.getStringParam(params, 'ScheduleMode'), cronExpression);
            const status = this.resolveRoutineStatus(this.getStringParam(params, 'Status'));
            const timezone = this.getStringParam(params, 'Timezone') ?? 'UTC';
            const wakeReason = this.getStringParam(params, 'WakeReason') ?? `Scheduled wake for ${ workstreamKey }`;
            const initialMessage =
                this.getStringParam(params, 'InitialMessage') ??
                `[AgentWake:${ workstreamKey }] Resume workstream "${ workstreamKey }": ${ wakeReason }`;
            const conversationId = this.getStringParam(params, 'ConversationID');

            const nextRunAt = this.resolveNextRunAt(params, scheduleMode, cronExpression);
            if (scheduleMode === 'OneShot' && !nextRunAt && status === 'Active') {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'OneShot AgentWake routines require either WakeAtISO or WakeInMinutes.',
                    Params: params.Params,
                };
            }
            if (scheduleMode === 'Recurring' && (!cronExpression || cronExpression.trim().length === 0)) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Recurring AgentWake routines require a valid CronExpression.',
                    Params: params.Params,
                };
            }

            const resumeState = this.parseObjectParam<Record<string, unknown>>(params, 'ResumeState') ?? {};
            const watchedEntities =
                this.parseObjectParam<MJUserRoutineEntity_IRoutineWakeConfiguration['watchedEntities']>(
                    params,
                    'WatchedEntities'
                );
            const wakeGate =
                this.parseObjectParam<MJUserRoutineEntity_IRoutineWakeConfiguration['wakeGate']>(
                    params,
                    'WakeGate'
                );

            const wakeConfig: MJUserRoutineEntity_IRoutineWakeConfiguration = {
                workstreamKey,
                wakeReason,
                resumeState,
                ...(watchedEntities ? { watchedEntities } : {}),
                ...(wakeGate ? { wakeGate } : {}),
            };

            const existingRoutine = await this.findExistingWakeRoutine(
                contextUser.ID,
                agentId,
                workstreamKey,
                params
            );
            const md = params.Provider ?? new Metadata();
            const routine =
                existingRoutine ??
                (await md.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', contextUser));

            routine.UserID = contextUser.ID;
            routine.Name = `${ agentName } — Wake (${ workstreamKey })`;
            routine.Description = wakeReason;
            routine.Status = status;
            routine.RoutineType = 'AgentWake';
            routine.ScheduleMode = scheduleMode;
            routine.TargetType = 'Agent';
            routine.TargetID = agentId;
            routine.Timezone = timezone;
            routine.CronExpression = cronExpression && cronExpression.trim().length > 0 ? cronExpression.trim() : null;
            routine.InitialMessage = initialMessage;
            routine.StartingPayload = JSON.stringify({
                workstreamKey,
                wakeReason,
                resumeState,
            });
            routine.WakeConfigurationObject = wakeConfig;
            if (nextRunAt) {
                routine.NextRunAt = nextRunAt;
            }
            if (conversationId) {
                routine.ConversationID = conversationId;
            }

            const saved = await routine.Save();
            if (!saved) {
                const errMsg = routine.LatestResult?.CompleteMessage ?? 'Unknown error saving MJ: User Routines row';
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: `Failed to save AgentWake routine: ${ errMsg }`,
                    Params: params.Params,
                };
            }

            this.setOutputParam(params, 'RoutineID', routine.ID);
            this.setOutputParam(params, 'NextRunAt', routine.NextRunAt ? routine.NextRunAt.toISOString() : null);
            this.setOutputParam(params, 'ScheduledWakeTime', routine.NextRunAt ? routine.NextRunAt.toISOString() : null);
            this.setOutputParam(params, 'ScheduleMode', routine.ScheduleMode);
            this.setOutputParam(params, 'WorkstreamKey', workstreamKey);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Scheduled ${ routine.ScheduleMode } AgentWake routine "${ routine.Name }" (ID: ${ routine.ID })${
                    routine.NextRunAt ? ` for ${ routine.NextRunAt.toISOString() }` : ''
                }.`,
                Params: params.Params,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`ScheduleNextAgentWakeAction error: ${ message }`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Error scheduling agent wake: ${ message }`,
                Params: params.Params,
            };
        }
    }

    private async resolveTargetAgent(
        params: RunActionParams
    ): Promise<{ agentId: string; agentName: string } | { errorResult: ActionResultSimple }> {
        await AIEngine.Instance.Config(false, params.ContextUser);
        const rawId = this.getStringParam(params, 'AgentID');
        const rawName = this.getStringParam(params, 'AgentName');

        const byName = rawName
            ? AIEngine.Instance.Agents.find((a) => a.Name.trim().toLowerCase() === rawName.trim().toLowerCase())
            : undefined;
        const byId = rawId ? AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, rawId)) : undefined;
        const defaultCos = !rawName
            ? AIEngine.Instance.Agents.find((a) => a.Name.trim().toLowerCase() === 'chief of staff')
            : undefined;
        const agent = byName ?? byId ?? defaultCos;

        if (!agent) {
            return {
                errorResult: {
                    Success: false,
                    ResultCode: 'AGENT_NOT_FOUND',
                    Message: `Target agent ${ rawId ?? rawName ?? 'Chief of Staff' } not found.`,
                    Params: params.Params,
                },
            };
        }

        if (!AIEngine.Instance.CanUserRunAgent(agent.ID, params.ContextUser)) {
            return {
                errorResult: {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: `User ${ params.ContextUser.Email || params.ContextUser.ID } does not have permission to run agent "${ agent.Name }".`,
                    Params: params.Params,
                },
            };
        }

        return { agentId: agent.ID, agentName: agent.Name };
    }

    private async findExistingWakeRoutine(
        userId: string,
        agentId: string,
        workstreamKey: string,
        params: RunActionParams
    ): Promise<MJUserRoutineEntity | null> {
        const rv = new RunView();
        const safeUser = userId.replace(/'/g, "''");
        const safeAgent = agentId.replace(/'/g, "''");
        const res = await rv.RunView<MJUserRoutineEntity>(
            {
                EntityName: 'MJ: User Routines',
                ExtraFilter: `UserID='${ safeUser }' AND RoutineType='AgentWake' AND TargetType='Agent' AND TargetID='${ safeAgent }'`,
                ResultType: 'entity_object',
            },
            params.ContextUser
        );
        if (!res.Success || !res.Results?.length) {
            return null;
        }
        for (const candidate of res.Results) {
            const cfg =
                candidate.WakeConfigurationObject ??
                (candidate.WakeConfiguration
                    ? SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(candidate.WakeConfiguration)
                    : null);
            if ((cfg?.workstreamKey ?? 'default').toLowerCase() === workstreamKey.toLowerCase()) {
                return candidate;
            }
        }
        return null;
    }

    private resolveScheduleMode(
        raw: string | null,
        cronExpression: string | null
    ): MJUserRoutineEntity['ScheduleMode'] {
        const normalized = raw?.trim().toLowerCase();
        if (normalized === 'oneshot' || normalized === 'one-shot') {
            return 'OneShot';
        }
        if (normalized === 'recurring' || normalized === 'scheduled' || normalized === 'cron') {
            return 'Recurring';
        }
        if (normalized === 'adaptive') {
            return 'Adaptive';
        }
        if (cronExpression && cronExpression.trim().length > 0) {
            return 'Recurring';
        }
        return 'Adaptive';
    }

    private resolveRoutineStatus(raw: string | null): MJUserRoutineEntity['Status'] {
        if (raw === 'Active' || raw === 'Paused' || raw === 'Disabled') {
            return raw;
        }
        return 'Active';
    }

    private resolveNextRunAt(
        params: RunActionParams,
        scheduleMode: MJUserRoutineEntity['ScheduleMode'],
        cronExpression: string | null
    ): Date | null {
        // NextWakeAt and DelayMinutes are the names the action's metadata declares; WakeAtISO and
        // WakeInMinutes are the names the Chief of Staff prompt uses. Both pairs are accepted.
        const wakeAtISO = this.getStringParam(params, 'WakeAtISO') ?? this.getStringParam(params, 'NextWakeAt');
        if (wakeAtISO) {
            const parsed = new Date(wakeAtISO);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed;
            }
        }
        const wakeInMinutes = this.getNumericParam(params, 'WakeInMinutes') ?? this.getNumericParam(params, 'DelayMinutes');
        if (wakeInMinutes != null && wakeInMinutes > 0) {
            return new Date(Date.now() + Math.round(wakeInMinutes * 60_000));
        }
        if (scheduleMode === 'Adaptive' && (!cronExpression || cronExpression.trim().length === 0)) {
            // Default adaptive check-in interval: 60 minutes if neither WakeAtISO, WakeInMinutes, nor CronExpression was supplied
            return new Date(Date.now() + 60 * 60_000);
        }
        return null;
    }

    private getParamValue(params: RunActionParams, name: string): unknown {
        const found = params.Params.find((p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase());
        return found?.Value;
    }

    private getStringParam(params: RunActionParams, name: string): string | null {
        const val = this.getParamValue(params, name);
        if (val == null) return null;
        const str = String(val).trim();
        return str.length > 0 ? str : null;
    }

    private getNumericParam(params: RunActionParams, name: string): number | null {
        const val = this.getParamValue(params, name);
        if (val == null || val === '') return null;
        const num = typeof val === 'number' ? val : Number(val);
        return Number.isFinite(num) ? num : null;
    }

    private parseObjectParam<T>(params: RunActionParams, name: string): T | null {
        const val = this.getParamValue(params, name);
        if (val == null) return null;
        if (typeof val === 'object') return val as T;
        if (typeof val === 'string') {
            return SafeJSONParse<T>(val) ?? null;
        }
        return null;
    }

    private setOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params.find((p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase());
        if (existing) {
            existing.Value = value;
        } else {
            const outParam: ActionParam = {
                Name: name,
                Value: value,
                Type: 'Output',
            };
            params.Params.push(outParam);
        }
    }
}
