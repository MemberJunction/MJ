import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntitySaveOptions,
    ServerOperationScopeManager,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJTaskDependencyEntity } from '@memberjunction/core-entities';
import { TASK_GRAPH_RUNTIME_SECURITY_OPERATION } from '@memberjunction/ai-core-plus';
import { IsWorkflowStepTask, ResolveWorkflowTaskTypeID } from './MJTaskEntityServer.server';

/**
 * Server-side `MJ: Task Dependencies` entity: a workflow's edges are the task-graph service's.
 *
 * An edge decides when a step may run and what it reads: deleting the one into a send step would release it without
 * the approval step before it, and adding one would hand a step another's output. So an edge that gates a workflow
 * step, before or after the write, is created, changed or deleted only inside the dispatcher's runtime-security scope
 * ({@link TASK_GRAPH_RUNTIME_SECURITY_OPERATION}), where the task-graph service writes a graph's edges. An edge that gates no
 * workflow step, an ordinary task waiting on one included, is left alone.
 */
@RegisterClass(BaseEntity, 'MJ: Task Dependencies')
export class MJTaskDependencyEntityServer extends MJTaskDependencyEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.inDispatcherScope() && (await this.touchesWorkflowStep())) {
            return this.refuse(this.IsSaved ? 'update' : 'create');
        }
        return super.Save(options);
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (!this.inDispatcherScope() && (await this.touchesWorkflowStep())) {
            return this.refuse('delete');
        }
        return super.Delete(options);
    }

    /**
     * Whether the edge gates a step of a workflow: its `TaskID`, as stored or as this write leaves it, is one. That is the
     * end the dispatcher reads (a step's prerequisites); an ordinary task waiting on a step changes nothing it runs.
     */
    private async touchesWorkflowStep(): Promise<boolean> {
        const ends = new Set<string>();
        const entityField = this.GetFieldByName('TaskID');
        for (const value of [entityField?.Value, this.IsSaved ? entityField?.OldValue : undefined]) {
            if (typeof value === 'string' && value) ends.add(value.toUpperCase());
        }
        if (ends.size === 0) return false;
        const provider = this.RunViewProviderToUse;
        const user = this.ContextCurrentUser;
        const workflowTypeID = await ResolveWorkflowTaskTypeID(provider, user);
        for (const taskID of ends) {
            if (await IsWorkflowStepTask(provider, user, taskID, workflowTypeID)) return true;
        }
        return false;
    }

    private refuse(type: 'create' | 'update' | 'delete'): boolean {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type;
        result.Message = "A workflow's dependencies are written only by the task-graph service: they decide when its steps run and what they read.";
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.ResultHistory.push(result);
        return false;
    }

    /** Whether this write runs inside the dispatcher's runtime-security scope, bound to its user. */
    private inDispatcherScope(): boolean {
        return this.ContextCurrentUser != null && ServerOperationScopeManager.Instance.IsOperationActive(
            [TASK_GRAPH_RUNTIME_SECURITY_OPERATION], 'MJ: Task Dependencies', this.ContextCurrentUser,
        );
    }
}
