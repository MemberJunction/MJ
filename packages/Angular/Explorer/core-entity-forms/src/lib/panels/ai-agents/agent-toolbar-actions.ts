import type { MJAIAgentEntity } from '@memberjunction/core-entities';
import {
    BaseFormToolbarAction,
    FormToolbarActionLifecycleContext,
    RegisterFormToolbarAction,
} from '@memberjunction/ng-base-forms';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { MJNotificationService } from '@memberjunction/ng-notifications';

const AI_AGENTS_ENTITY = 'MJ: AI Agents';

/** Host contract expected when toolbar actions trigger form-owned dialogs (e.g. Permissions). */
interface AgentPermissionsHostForm {
    OpenPermissionsDialog?: () => void;
    IsOpenToEveryone?: boolean;
}

/**
 * "Run" toolbar button on `MJ: AI Agents` forms.
 * Opens the AI Test Harness dialog for the saved agent. Disabled with an informative
 * tooltip when the agent is not Active.
 */
@RegisterFormToolbarAction({
    Key: 'ai-agent-run',
    EntityScope: AI_AGENTS_ENTITY,
    Text: 'Run',
    Description: 'Run this AI agent in the test harness',
    Icon: 'fa-solid fa-play',
    Variant: 'secondary',
    Mode: 'read',
    Placement: 'actions',
    Order: 15,
    Pinnable: false,
})
export class AIAgentRunToolbarAction extends BaseFormToolbarAction {
    public override IsApplicable(ctx: FormToolbarActionLifecycleContext): boolean {
        const agent = ctx.Record as MJAIAgentEntity | null;
        return Boolean(agent?.IsSaved && agent.ID);
    }

    public override OnInit(ctx: FormToolbarActionLifecycleContext): void {
        this.syncDisabledState(ctx);
    }

    public override OnRecordRefreshed(ctx: FormToolbarActionLifecycleContext): void {
        this.syncDisabledState(ctx);
    }

    private syncDisabledState(ctx: FormToolbarActionLifecycleContext): void {
        const agent = ctx.Record as MJAIAgentEntity | null;
        const inactive = agent?.Status !== 'Active';
        ctx.SetDisabled(inactive, inactive ? 'Only Active agents can be executed' : undefined);
    }

    public override async OnExecute(ctx: FormToolbarActionLifecycleContext): Promise<void> {
        const agent = ctx.Record as MJAIAgentEntity | null;
        if (!agent?.ID) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Please save the AI agent before running it.',
                'warning',
                3500,
            );
            return;
        }
        const harness = ctx.Injector?.get(AITestHarnessDialogService, null, { optional: true });
        if (!harness) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'AI Test Harness service is not available.',
                'error',
                4000,
            );
            return;
        }
        harness.openForAgent(agent.ID);
    }
}

/**
 * "Access" toolbar button on `MJ: AI Agents` forms.
 * Opens the agent permissions dialog on the host form so admins can configure
 * Open vs. Restricted user/role access without leaving the form.
 */
@RegisterFormToolbarAction({
    Key: 'ai-agent-permissions',
    EntityScope: AI_AGENTS_ENTITY,
    Text: 'Access',
    Description: 'Manage who can view, run, and edit this AI agent',
    Icon: 'fa-solid fa-shield-halved',
    Variant: 'default',
    Mode: 'read',
    Placement: 'actions',
    Order: 16,
    Pinnable: false,
})
export class AIAgentPermissionsToolbarAction extends BaseFormToolbarAction {
    public override IsApplicable(ctx: FormToolbarActionLifecycleContext): boolean {
        const agent = ctx.Record as MJAIAgentEntity | null;
        return Boolean(agent?.IsSaved && agent.ID);
    }

    public override async OnExecute(ctx: FormToolbarActionLifecycleContext): Promise<void> {
        const host = ctx.FormComponent as unknown as AgentPermissionsHostForm | null;
        if (host?.OpenPermissionsDialog) {
            host.OpenPermissionsDialog();
            return;
        }
        MJNotificationService.Instance.CreateSimpleNotification(
            'Permissions dialog is not available on this form surface.',
            'warning',
            3500,
        );
    }
}

/** Tree-shake guard — invoked at module load so toolbar action decorators register. */
export function LoadAIAgentToolbarActions(): void {
    /* no-op marker */
}
