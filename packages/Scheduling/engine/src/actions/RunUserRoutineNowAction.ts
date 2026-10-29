import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJUserRoutineEntity } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { SchedulingEngine } from '../ScheduledJobEngine';
import { UserRoutineDispatcherDriver } from '../drivers/UserRoutineDispatcherDriver';

/**
 * Runs one `MJ: User Routines` row now, on the user's request, without touching its schedule.
 *
 * This is what a "Wake Now" button should call. Writing `NextRunAt = now` instead makes the
 * dispatcher CLAIM the routine on its next sweep, and a claimed one-shot is spent: the reminder the
 * user wanted tomorrow fires today and is then Disabled. This action hands the routine to
 * {@link UserRoutineDispatcherDriver.RunRoutineNow}, which skips the claim and the wake gate, so a
 * one-shot keeps its time and a recurring routine keeps its cadence.
 *
 * Security:
 * - Runs under `params.ContextUser`; a non-Owner-type user may run only routines they own.
 * - Bookkeeping (run row, routine roll-up) is saved as the scheduler's system user when the engine
 *   is polling in this process, exactly as a scheduled run would be; the target still executes as
 *   the routine's owner. Without a polling engine it falls back to the caller, whose role then
 *   needs write access to `MJ: User Routine Runs`.
 * - The run is started and left to complete in the background; the result lands on the routine's
 *   run row, its conversation and its notification, where the UI already looks for it.
 */
@RegisterClass(BaseAction, 'Run User Routine Now')
export class RunUserRoutineNowAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contextUser = params.ContextUser;
        if (!contextUser?.ID) {
            return this.fail(params, 'MISSING_USER_CONTEXT', 'Run User Routine Now requires a valid ContextUser.');
        }
        const routineID = this.readStringParam(params, 'RoutineID');
        if (!routineID) {
            return this.fail(params, 'MISSING_PARAMETER', "Parameter 'RoutineID' is required.");
        }

        const md = (params.Provider ?? new Metadata()) as unknown as IMetadataProvider; // global-provider-ok: fallback when no provider was passed to the action
        const routine = await md.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', contextUser);
        if (!(await routine.Load(routineID))) {
            return this.fail(params, 'ROUTINE_NOT_FOUND', `No routine with ID ${routineID} is visible to you.`);
        }
        if (!this.canRun(routine, contextUser)) {
            return this.fail(params, 'NOT_OWNER', 'You can only run routines you own.');
        }

        const bookkeepingUser = SchedulingEngine.Instance.PollingContextUser ?? contextUser;
        const driver = new UserRoutineDispatcherDriver();
        driver.RunRoutineNow(routine, bookkeepingUser).catch((error: unknown) => {
            LogError(`Run User Routine Now: routine "${routine.Name}" (${routine.ID}) failed: ${error instanceof Error ? error.message : String(error)}`);
        });

        const keeps = routine.NextRunAt ? ` Its scheduled wake at ${routine.NextRunAt.toISOString()} is unchanged.` : '';
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `Started "${routine.Name}". The result lands in its conversation and a notification.${keeps}`,
            Params: params.Params,
        };
    }

    private canRun(routine: MJUserRoutineEntity, user: UserInfo): boolean {
        if (user.Type?.trim().toLowerCase() === 'owner') {
            return true;
        }
        return !!routine.UserID && UUIDsEqual(routine.UserID, user.ID);
    }

    private readStringParam(params: RunActionParams, name: string): string | null {
        const param = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
        const value = param?.Value;
        if (value == null) {
            return null;
        }
        const text = String(value).trim();
        return text.length > 0 ? text : null;
    }

    private fail(params: RunActionParams, code: string, message: string): ActionResultSimple {
        return { Success: false, ResultCode: code, Message: message, Params: params.Params };
    }
}

/** Tree-shaking guard: referencing the class keeps its registration in the bundle. */
export function LoadRunUserRoutineNowAction(): void {
    void RunUserRoutineNowAction;
}
