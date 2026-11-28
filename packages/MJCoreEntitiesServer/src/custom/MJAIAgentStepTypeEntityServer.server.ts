import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntityPermissionType,
    IEntityDataProvider,
    IMetadataProvider,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentStepTypeEntity } from '@memberjunction/core-entities';
import { CheckAgentAdminEntityPermissions, IsAgentAdminOrOwnerUser } from './MJAIAgentEntityServer.server';

interface BuiltInStepTypeSecurityFloor {
    readonly DriverClass: string;
    readonly AllowedInUnapprovedPlanMode: boolean;
    readonly CountsAgainstTreeBudget: boolean;
}

const BUILT_IN_STEP_FLOORS = new Map<string, BuiltInStepTypeSecurityFloor>([
    ['actions', { DriverClass: 'ActionsStepHandler', AllowedInUnapprovedPlanMode: false, CountsAgainstTreeBudget: true }],
    ['sub-agent', { DriverClass: 'SubAgentStepHandler', AllowedInUnapprovedPlanMode: false, CountsAgainstTreeBudget: true }],
    ['retry', { DriverClass: 'RetryStepHandler', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true }],
    ['success', { DriverClass: 'SuccessStepHandler', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true }],
    ['failed', { DriverClass: 'FailedStepHandler', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true }],
    ['chat', { DriverClass: 'ChatStepHandler', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: false }],
    ['foreach', { DriverClass: 'ForEachStepHandler', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true }],
    ['while', { DriverClass: 'WhileStepHandler', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true }],
    ['skill', { DriverClass: 'SkillStepHandler', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true }],
    ['plan', { DriverClass: 'PlanStepHandler', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true }],
    ['tasks', { DriverClass: 'TasksStepHandler', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true }],
    ['handoff', { DriverClass: 'HandoffStepHandler', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true }],
    ['clienttools', { DriverClass: 'ClientToolsStepHandler', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true }],
    ['decision', { DriverClass: 'DecisionStepHandler', AllowedInUnapprovedPlanMode: true, CountsAgainstTreeBudget: true }],
]);

/** Shape required to validate an `MJ: AI Agent Step Types` create/update mutation. */
export interface AgentStepTypeValidationTarget {
    Name: string | null | undefined;
    DriverClass: string | null | undefined;
    AllowedInUnapprovedPlanMode: boolean | null | undefined;
    CountsAgainstTreeBudget: boolean | null | undefined;
    Status?: string | null | undefined;
}

/** Pure validation helper for `MJ: AI Agent Step Types` create/update rules. */
export function ValidateAgentStepTypeMutation(
    target: AgentStepTypeValidationTarget,
    contextUser: UserInfo | null | undefined,
    provider?: IEntityDataProvider | Pick<IMetadataProvider, 'Authorizations'> | null
): ValidationErrorInfo[] {
    if (!IsAgentAdminOrOwnerUser(contextUser, provider)) {
        return [
            new ValidationErrorInfo(
                'Name',
                'Only administrators may create or modify MJ: AI Agent Step Types.',
                target.Name,
                ValidationErrorType.Failure
            ),
        ];
    }

    const errors: ValidationErrorInfo[] = [];
    const key = (target.Name ?? '').trim().toLowerCase();
    const floor = BUILT_IN_STEP_FLOORS.get(key);
    if (floor) {
        if (target.Status !== undefined && target.Status !== null && target.Status !== 'Active') {
            errors.push(
                new ValidationErrorInfo(
                    'Status',
                    `Built-in step type '${target.Name}' must remain Status='Active'.`,
                    target.Status,
                    ValidationErrorType.Failure
                )
            );
        }
        if (!floor.AllowedInUnapprovedPlanMode && target.AllowedInUnapprovedPlanMode === true) {
            errors.push(
                new ValidationErrorInfo(
                    'AllowedInUnapprovedPlanMode',
                    `Built-in step type '${target.Name}' cannot set AllowedInUnapprovedPlanMode = true.`,
                    true,
                    ValidationErrorType.Failure
                )
            );
        }
        if (floor.CountsAgainstTreeBudget && target.CountsAgainstTreeBudget === false) {
            errors.push(
                new ValidationErrorInfo(
                    'CountsAgainstTreeBudget',
                    `Built-in step type '${target.Name}' must keep CountsAgainstTreeBudget = true.`,
                    false,
                    ValidationErrorType.Failure
                )
            );
        }
        if ((target.DriverClass ?? '').trim() !== floor.DriverClass) {
            errors.push(
                new ValidationErrorInfo(
                    'DriverClass',
                    `Built-in step type '${target.Name}' must keep DriverClass='${floor.DriverClass}'. Override via @RegisterClass(BaseAgentStepHandler, '${floor.DriverClass}', priority) in server code instead.`,
                    target.DriverClass,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    return errors;
}

/** Pure validation helper for `MJ: AI Agent Step Types` delete rules. */
export function ValidateAgentStepTypeDelete(
    stepTypeName: string | null | undefined,
    stepTypeId: string | null | undefined,
    contextUser: UserInfo | null | undefined,
    provider?: IEntityDataProvider | null
): ValidationErrorInfo[] {
    if (!IsAgentAdminOrOwnerUser(contextUser, provider)) {
        return [
            new ValidationErrorInfo(
                'Name',
                'Only administrators may delete MJ: AI Agent Step Types.',
                stepTypeId,
                ValidationErrorType.Failure
            ),
        ];
    }
    const key = (stepTypeName ?? '').trim().toLowerCase();
    if (BUILT_IN_STEP_FLOORS.has(key)) {
        return [
            new ValidationErrorInfo(
                'Name',
                `Built-in step type '${stepTypeName}' cannot be deleted.`,
                stepTypeName,
                ValidationErrorType.Failure
            ),
        ];
    }
    return [];
}

/**
 * Server-side guard for `MJ: AI Agent Step Types` (`AIAgentStepType`):
 * 1. Restricts create, update, and delete mutations to administrators/owners.
 * 2. Locks built-in step type security invariants so metadata edits cannot disable Plan Mode
 *    restrictions (`Actions`/`Sub-Agent`), bypass tree-budget accounting, or hijack built-in
 *    `DriverClass` routing (code overrides must use `@RegisterClass(BaseAgentStepHandler, ...)`).
 */
@RegisterClass(BaseEntity, 'MJ: AI Agent Step Types')
export class MJAIAgentStepTypeEntityServer extends MJAIAgentStepTypeEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
        return CheckAgentAdminEntityPermissions(
            {
                ActiveUser: this.ActiveUser,
                EntityInfo: this.EntityInfo,
                ProviderToUse: this.ProviderToUse,
            },
            type,
            throwError,
            (permType, shouldThrow) => super.CheckPermissions(permType, shouldThrow)
        );
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) {
            return result;
        }

        const errors = ValidateAgentStepTypeMutation(
            {
                Name: this.Name,
                DriverClass: this.DriverClass,
                AllowedInUnapprovedPlanMode: this.AllowedInUnapprovedPlanMode,
                CountsAgainstTreeBudget: this.CountsAgainstTreeBudget,
                Status: this.Status,
            },
            this.ContextCurrentUser,
            this.ProviderToUse
        );
        result.Errors.push(...errors);
        result.Success = result.Errors.every((e) => e.Type !== ValidationErrorType.Failure);
        return result;
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const errors = ValidateAgentStepTypeDelete(this.Name, this.ID, this.ContextCurrentUser, this.ProviderToUse);
        if (errors.length > 0) {
            const deleteResult = new BaseEntityResult(false, '', 'delete');
            deleteResult.Errors = errors;
            this.RegisterResultHistoryEntry(deleteResult);
            return false;
        }
        return super.Delete(options);
    }
}
