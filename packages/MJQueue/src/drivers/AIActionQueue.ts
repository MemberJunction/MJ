import { QueueBase, TaskBase, TaskResult } from "../generic/QueueBase";
import { RegisterClass } from '@memberjunction/global'
import { AIEngine } from '@memberjunction/aiengine';

@RegisterClass(QueueBase, 'AI Action')
export class AIActionQueue extends QueueBase {
    protected async ProcessTask(task: TaskBase): Promise<TaskResult> {
        return this.ProcessGeneric(task, false)
    }

    protected async ProcessGeneric(task: TaskBase, entityAIAction: boolean): Promise<TaskResult> {
        try {
            await AIEngine.Instance.Config(false, this._contextUser);
            let result: any = null;

            if (entityAIAction)
                result = await AIEngine.Instance.ExecuteEntityAIAction(task.Data);
            else
                result = await AIEngine.Instance.ExecuteAIAction(task.Data);

            return {
                success: result ? result.success : false,
                output: result ? (result.success ? null : result.errorMessage) : null,
                userMessage: result ? result.errorMessage : null,
                exception: null
            }
        }
        catch (e) {
            return {
                success: false,
                output: null,
                userMessage: 'Execution Error: ' + e.message,
                exception: e
            }
        }
    }
}

@RegisterClass(QueueBase, 'Entity AI Action', 1)
export class EntityAIActionQueue extends AIActionQueue {
    protected async ProcessTask(task: TaskBase): Promise<TaskResult> {
        return this.ProcessGeneric(task, true)
    }
}