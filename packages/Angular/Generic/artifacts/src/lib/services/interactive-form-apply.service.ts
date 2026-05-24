/**
 * Apply-to-my-form service.
 *
 * When the form-aware artifact viewer's "Apply to my form" button fires
 * `applyFormRequested`, the host calls this service. It:
 *   1. Looks up the entity to confirm it's registered.
 *   2. Reads the current Active override for the (entity, user) pair via
 *      the `Get Active Form For Entity` action.
 *   3. Shows a confirmation dialog explaining what's about to happen
 *      (Create new vs. Modify existing → Pending).
 *   4. On confirmation, runs `Create Interactive Form` or
 *      `Modify Interactive Form` accordingly.
 *   5. Surfaces success / failure via the notification service.
 *
 * The service centralizes the Create-vs-Modify decision so every host
 * (standalone artifact viewer in Explorer, chat conversation surfaces,
 * eventually the cockpit's chat-pane Apply flow) follows the same rules.
 */
import { Injectable, inject } from '@angular/core';
import { Metadata, LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJDialogService } from '@memberjunction/ng-ui-components';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';

/** Result of an apply attempt — surfaced to the caller for any post-apply UI. */
export interface InteractiveFormApplyResult {
    Success: boolean;
    /** Mode the server ran: 'create' / 'modify-new-version' / 'modify-in-place'. */
    Mode?: 'create' | 'modify-new-version' | 'modify-in-place';
    /** OverrideID the user can now reference. */
    OverrideID?: string;
    /** ComponentID that now holds the spec. */
    ComponentID?: string;
    /** Version string (e.g. '1.0.0' for create, '1.1.0' for modify-new). */
    Version?: string;
    Message?: string;
}

@Injectable({ providedIn: 'root' })
export class InteractiveFormApplyService {
    private readonly dialog = inject(MJDialogService);
    private readonly notifications = inject(MJNotificationService);

    /**
     * Confirm with the user and apply the spec. Routes to Create / Modify
     * automatically based on whether an Active override already exists.
     */
    public async ConfirmAndApply(
        spec: ComponentSpec,
        entityName: string,
        provider?: IMetadataProvider,
    ): Promise<InteractiveFormApplyResult> {
        const p = provider ?? Metadata.Provider;
        if (!p) {
            return this.fail('No metadata provider configured.');
        }
        const entity = p.EntityByName(entityName);
        if (!entity) {
            return this.fail(`Entity '${entityName}' is not registered.`);
        }
        const user = p.CurrentUser;
        if (!user) {
            return this.fail('No current user.');
        }
        const gqlProvider = p as unknown as GraphQLDataProvider;
        if (!gqlProvider || typeof (gqlProvider as { ExecuteGQL?: unknown }).ExecuteGQL !== 'function') {
            return this.fail('Action invocation requires a GraphQL provider.');
        }

        const client = new GraphQLActionClient(gqlProvider);

        // Step 1: detect existing state via Get Active Form For Entity.
        const activeResult = await this.runActionByName(client, 'Get Active Form For Entity', [
            { Name: 'EntityName', Value: entityName, Type: 'Input' },
        ]);
        if (!activeResult.Success) {
            return this.fail(`Could not check for existing override: ${activeResult.Message ?? 'unknown error'}`);
        }
        const payload = this.parseActiveResult(activeResult.Message);
        const hasExistingActive = !!payload?.Active?.OverrideID;

        // Step 2: confirm with the user.
        const proceed = await this.confirm(hasExistingActive, entityName, payload?.Active?.ComponentVersion);
        if (!proceed) {
            return { Success: false, Message: 'Cancelled by user.' };
        }

        // Step 3: run Create or Modify.
        const formName = (spec as unknown as { name?: string }).name ?? 'Custom Form';
        if (hasExistingActive) {
            const modifyResult = await this.runActionByName(client, 'Modify Interactive Form', [
                { Name: 'OverrideID', Value: payload!.Active!.OverrideID!, Type: 'Input' },
                { Name: 'Spec', Value: JSON.stringify(spec), Type: 'Input' },
                { Name: 'Notes', Value: `Applied from chat artifact at ${new Date().toISOString()}`, Type: 'Input' },
            ]);
            return this.summarize(modifyResult, 'modify', user);
        }
        const createResult = await this.runActionByName(client, 'Create Interactive Form', [
            { Name: 'EntityName', Value: entityName, Type: 'Input' },
            { Name: 'Name',       Value: formName,   Type: 'Input' },
            { Name: 'Spec',       Value: JSON.stringify(spec), Type: 'Input' },
        ]);
        return this.summarize(createResult, 'create', user);
    }

    // ── internals ────────────────────────────────────────────────────────

    /**
     * Look up an action by name and run it. The actions module ships with
     * `__CreateInteractiveForm` / `__ModifyInteractiveForm` / etc. as their
     * DriverClass names but registers under the human-readable form name.
     * GraphQLActionClient.RunAction() takes the action ID; we fetch it by
     * name from the action metadata loaded on the provider.
     */
    private async runActionByName(
        client: GraphQLActionClient,
        actionName: string,
        params: Array<{ Name: string; Value: string; Type: 'Input' }>,
    ): Promise<{ Success: boolean; Message?: string; ResultCode?: string }> {
        try {
            // The action ID is required by RunAction. We look it up from the
            // action engine's cached metadata if available; otherwise we ask
            // the GraphQL provider directly.
            const actionId = await this.resolveActionIdByName(actionName);
            if (!actionId) {
                return { Success: false, Message: `Action '${actionName}' not found.` };
            }
            const result = await client.RunAction(actionId, params);
            return {
                Success: !!result.Success,
                Message: result.Message ?? undefined,
                ResultCode: result.ResultCode ?? undefined,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`InteractiveFormApplyService.runActionByName(${actionName}): ${message}`);
            return { Success: false, Message: message };
        }
    }

    /**
     * Resolve an action ID by Name. Falls back to a direct RunView against
     * the Action entity when ActionEngine isn't loaded.
     */
    private async resolveActionIdByName(name: string): Promise<string | null> {
        try {
            // ActionEngine may not be initialised in the chat surface — query directly.
            const { RunView } = await import('@memberjunction/core');
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string }>({
                EntityName: 'Actions',
                ExtraFilter: `Name='${name.replace(/'/g, "''")}'`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            });
            return result.Success ? (result.Results?.[0]?.ID ?? null) : null;
        } catch (err) {
            LogError(`InteractiveFormApplyService.resolveActionIdByName(${name}): ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /** Show a confirmation dialog explaining what's about to happen. */
    private async confirm(
        hasExistingActive: boolean,
        entityName: string,
        currentVersion: string | null | undefined,
    ): Promise<boolean> {
        const content = hasExistingActive
            ? `You already have an active custom form for <strong>${escape(entityName)}</strong> (v${escape(currentVersion ?? '?')}). Applying this artifact will create a <strong>new Pending version</strong> — your live form stays active until you explicitly activate the new version in Form Builder.`
            : `This will create a custom form for <strong>${escape(entityName)}</strong> scoped to your user. Other users will continue to see the default form.`;
        const ref = this.dialog.Open({
            title: hasExistingActive ? 'Apply as new Pending version?' : 'Apply this form?',
            content,
            width: 540,
            actions: [
                { text: hasExistingActive ? 'Create Pending' : 'Apply', primary: true, themeColor: 'primary', result: 'apply' },
                { text: 'Cancel', result: 'cancel' },
            ],
        });
        return new Promise<boolean>(resolve => {
            ref.Result.subscribe((res: unknown) => {
                resolve((res as { result?: string })?.result === 'apply');
            });
        });
    }

    private parseActiveResult(message: string | undefined): {
        Active?: { OverrideID?: string; ComponentVersion?: string };
    } | null {
        if (!message) return null;
        try {
            return JSON.parse(message) as { Active?: { OverrideID?: string; ComponentVersion?: string } };
        } catch {
            return null;
        }
    }

    private summarize(
        result: { Success: boolean; Message?: string; ResultCode?: string },
        kind: 'create' | 'modify',
        _user: UserInfo,
    ): InteractiveFormApplyResult {
        if (!result.Success) {
            this.notifications.CreateSimpleNotification(
                `Apply failed: ${result.Message ?? result.ResultCode ?? 'unknown error'}`,
                'error', 5000,
            );
            return { Success: false, Message: result.Message };
        }
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(result.Message ?? '{}'); } catch { /* best effort */ }
        const mode: InteractiveFormApplyResult['Mode'] = kind === 'create'
            ? 'create'
            : (payload.Mode === 'in-place' ? 'modify-in-place' : 'modify-new-version');
        const note = kind === 'create'
            ? 'Custom form is now active for your user.'
            : (mode === 'modify-in-place'
                ? 'Pending version updated. Activate it from Form Builder when ready.'
                : `Pending v${payload.Version ?? '?'} created. Activate it from Form Builder when ready.`);
        this.notifications.CreateSimpleNotification(note, 'success', 4000);
        return {
            Success: true,
            Mode: mode,
            OverrideID: payload.OverrideID as string | undefined,
            ComponentID: payload.ComponentID as string | undefined,
            Version: payload.Version as string | undefined,
            Message: result.Message,
        };
    }

    private fail(message: string): InteractiveFormApplyResult {
        this.notifications.CreateSimpleNotification(`Apply failed: ${message}`, 'error', 5000);
        return { Success: false, Message: message };
    }
}

/** Minimal HTML escape — the dialog content goes through `[innerHTML]` upstream. */
function escape(s: string): string {
    return s.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] ?? c));
}
