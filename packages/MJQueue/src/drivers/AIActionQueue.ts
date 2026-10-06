import { QueueBase, TaskBase, TaskResult } from "../generic/QueueBase";
import { RegisterClass } from '@memberjunction/global';
import { AIEngine, AIActionParams, EntityAIActionParams } from '@memberjunction/aiengine';
import { BaseResult } from '@memberjunction/ai';
import {
    EntityAIActionReferenceError, IsEntityAIActionTaskReference, ResolveEntityAIActionTaskReference,
} from '../references/EntityAIActionTaskReference';

const RECORD_NOT_FOUND_MESSAGE = 'The record for this Entity AI Action could not be loaded (deleted, or not yet committed).';

@RegisterClass(QueueBase, 'AI Action')
export class AIActionQueue extends QueueBase {
    protected async ProcessTask(task: TaskBase): Promise<TaskResult> {
        return this.ProcessGeneric(task, false);
    }

    protected async ProcessGeneric(task: TaskBase, entityAIAction: boolean): Promise<TaskResult> {
        try {
            await AIEngine.Instance.Config(false, this._contextUser);
            if (!entityAIAction) {
                return this.toTaskResult(await AIEngine.Instance.ExecuteAIAction(task.Data as AIActionParams));
            }
            const params = await this.ResolveEntityAIActionParams(task.Data);
            if (!params) {
                return { success: false, output: null, userMessage: RECORD_NOT_FOUND_MESSAGE, exception: null, failureKind: 'RecordNotFound' };
            }
            return this.toTaskResult(await AIEngine.Instance.ExecuteEntityAIAction(params));
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            const result: TaskResult = { success: false, output: null, userMessage: 'Execution Error: ' + message, exception: e };
            if (e instanceof EntityAIActionReferenceError) {
                result.failureKind = 'Fatal'; // deterministic: a durable caller must not retry it
            }
            return result;
        }
    }

    /** A reference is rehydrated through this driver's provider; a live params object passes through. */
    protected async ResolveEntityAIActionParams(data: unknown): Promise<EntityAIActionParams | null> {
        if (IsEntityAIActionTaskReference(data)) {
            return ResolveEntityAIActionTaskReference(data, this.Provider, this._contextUser);
        }
        if (typeof data === 'object' && data !== null && 'entityRecord' in data) {
            return data as EntityAIActionParams;
        }
        throw new EntityAIActionReferenceError('Unrecognised Entity AI Action task data: expected an EntityAIActionTaskReference or EntityAIActionParams');
    }

    private toTaskResult(result: BaseResult | null): TaskResult {
        return {
            success: result ? result.success : false,
            output: result ? (result.success ? null : result.errorMessage) : null,
            userMessage: result ? result.errorMessage : null,
            exception: null,
        };
    }
}

@RegisterClass(QueueBase, 'Entity AI Action', 1)
export class EntityAIActionQueue extends AIActionQueue {
    protected async ProcessTask(task: TaskBase): Promise<TaskResult> {
        return this.ProcessGeneric(task, true);
    }
}
