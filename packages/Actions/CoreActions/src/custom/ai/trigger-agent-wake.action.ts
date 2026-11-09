import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, SafeJSONParse } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { AgentWakeResumeState, AgentWakeTriggerService } from '@memberjunction/ai-agents';

/**
 * Action that triggers an immediate event-driven wake (`MJ: User Routines` with
 * `RoutineType = 'AgentWake'`) for a target agent, user, and workstream via
 * {@link AgentWakeTriggerService.TriggerWakeForWorkstream}.
 *
 * Designed for declarative lifecycle hooks (such as `TaskType.OnCreateActionID` and
 * `TaskType.OnStatusChangeActionID`) and webhook handlers that need to wake an always-on
 * agent (such as Software Factory or Chief of Staff) for a specific workstream.
 */
@RegisterClass(BaseAction, 'Trigger Agent Wake')
export class TriggerAgentWakeAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Trigger Agent Wake requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            const targetUserID = this.getStringParam(params, 'TargetUserID') ?? contextUser.ID;
            const contextAgentID = (params.Context as { AgentID?: string } | undefined)?.AgentID?.trim() || undefined;
            const targetAgentID = this.getStringParam(params, 'TargetAgentID') ?? this.getStringParam(params, 'AgentID') ?? contextAgentID;
            const targetAgentName = this.getStringParam(params, 'TargetAgentName') ?? this.getStringParam(params, 'AgentName') ?? undefined;
            const workstreamKey = this.getStringParam(params, 'WorkstreamKey');
            const wakeReason = this.getStringParam(params, 'WakeReason');
            const resumeState = this.parseObjectParam<AgentWakeResumeState>(params, 'ResumeState') ?? undefined;

            if (!workstreamKey || !wakeReason) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'WorkstreamKey and WakeReason are required parameters.',
                    Params: params.Params,
                };
            }

            const result = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID,
                targetAgentID: targetAgentID ?? undefined,
                targetAgentName,
                workstreamKey,
                wakeReason,
                resumeState,
                contextUser,
                metadataProvider: params.Provider,
            });

            this.setOutputParam(params, 'RoutineID', result.routineID);
            this.setOutputParam(params, 'NextRunAt', result.nextRunAtISO);
            this.setOutputParam(params, 'TargetUserID', result.targetUserID);
            this.setOutputParam(params, 'TargetAgentID', result.targetAgentID);
            this.setOutputParam(params, 'WorkstreamKey', result.workstreamKey);

            return {
                Success: result.triggered,
                ResultCode: result.triggered ? 'SUCCESS' : result.resultCode,
                Message: result.reason,
                Params: params.Params,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`TriggerAgentWakeAction error: ${ message }`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Error triggering agent wake: ${ message }`,
                Params: params.Params,
            };
        }
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
