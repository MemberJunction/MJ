import type { RemoteOpResult } from '@memberjunction/core';
import {
    DiagnosticsReactivateSenderOperation,
    DiagnosticsRevokeSenderOperation,
    type MJDiagnosticSenderRegistrationEntity,
} from '@memberjunction/core-entities';
import {
    BaseFormToolbarAction,
    FormToolbarActionLifecycleContext,
    RegisterFormToolbarAction,
} from '@memberjunction/ng-base-forms';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';

const SENDER_REGISTRATIONS_ENTITY = 'MJ: Diagnostic Sender Registrations';
const SUCCESS_DURATION_MS = 3000;
const ERROR_DURATION_MS = 6000;

/** Shared run, notify and reload flow for the sender registration status actions. */
abstract class SenderRegistrationStatusAction extends BaseFormToolbarAction {
    /** Returns the form's record as a sender registration. */
    protected RegistrationOf(ctx: FormToolbarActionLifecycleContext): MJDiagnosticSenderRegistrationEntity {
        return ctx.Record as MJDiagnosticSenderRegistrationEntity;
    }

    /**
     * Runs `call` with the button in its loading state. On success, reloads the record and shows
     * `successMessage`, or a warning to reload when the reload fails. On failure, shows the
     * server's error and leaves the record unchanged.
     */
    protected async RunOperation(
        ctx: FormToolbarActionLifecycleContext,
        call: () => Promise<RemoteOpResult<object>>,
        successMessage: string,
        failureMessage: string
    ): Promise<void> {
        ctx.SetLoading(true);
        ctx.RequestChangeDetection();
        try {
            const result = await call();
            if (!result.Success) {
                notify(result.ErrorMessage || failureMessage, 'error', ERROR_DURATION_MS);
                return;
            }
            if (await reloadRecord(ctx)) {
                notify(successMessage, 'success', SUCCESS_DURATION_MS);
            } else {
                notify(`${successMessage} Reload the record to see the new status.`, 'warning', ERROR_DURATION_MS);
            }
        } catch (e) {
            notify(e instanceof Error && e.message ? e.message : failureMessage, 'error', ERROR_DURATION_MS);
        } finally {
            ctx.SetLoading(false);
            ctx.RequestChangeDetection();
        }
    }
}

/** Resolves MJConfirmService from the form container's injector, or null when it cannot. */
function confirmServiceOf(ctx: FormToolbarActionLifecycleContext): MJConfirmService | null {
    try {
        return ctx.Injector?.get(MJConfirmService, null, { optional: true }) ?? null;
    } catch {
        return null;
    }
}

function notify(message: string, style: 'success' | 'warning' | 'error', duration: number): void {
    MJNotificationService.Instance.CreateSimpleNotification(message, style, duration);
}

/**
 * Reloads the record through the form, so the form and its toolbar show the new status. The
 * form's own "Record refreshed" notification is skipped. Returns false when the reload fails.
 */
async function reloadRecord(ctx: FormToolbarActionLifecycleContext): Promise<boolean> {
    if (ctx.FormComponent) {
        return ctx.FormComponent.RefreshRecord({ ShowSuccessNotification: false });
    }
    return ctx.Record.Refresh();
}

/**
 * Revoke button on the sender registration form. Shown on a saved registration that is not
 * Revoked. Asks for confirmation through `MJConfirmService` from `ctx.Injector`, then calls
 * `Diagnostics.RevokeSender`. Without a confirm service it shows an error and makes no call.
 */
@RegisterFormToolbarAction({
    Key: 'diagnostics-revoke-sender',
    EntityScope: SENDER_REGISTRATIONS_ENTITY,
    Text: 'Revoke',
    Description: 'Revoke this sender so it can no longer send bundles',
    Icon: 'fa-solid fa-ban',
    Variant: 'danger',
    Mode: 'read',
    Placement: 'actions',
    Order: 40,
    Pinnable: false,
})
export class DiagnosticsRevokeSenderToolbarAction extends SenderRegistrationStatusAction {
    public override IsApplicable(ctx: FormToolbarActionLifecycleContext): boolean {
        const registration = this.RegistrationOf(ctx);
        return Boolean(registration?.IsSaved && registration.Status !== 'Revoked');
    }

    public override async OnExecute(ctx: FormToolbarActionLifecycleContext): Promise<void> {
        if (this.IsLoading) return;
        const confirmService = confirmServiceOf(ctx);
        if (!confirmService) {
            notify('Cannot open the confirmation dialog, so the sender was not revoked.', 'error', ERROR_DURATION_MS);
            return;
        }
        const registration = this.RegistrationOf(ctx);
        const confirmed = await confirmService.Confirm({
            title: 'Revoke sender',
            message: `Revoke the sender registration for '${registration.InstallID}'?`,
            detail: 'The collector refuses bundles from this sender. A sender with an enrolled key can be reactivated later.',
            type: 'danger',
            confirmText: 'Revoke',
        });
        if (!confirmed) return;
        await this.RunOperation(
            ctx,
            () => new DiagnosticsRevokeSenderOperation().Execute({ RegistrationID: registration.ID }, { provider: ctx.Provider }),
            'Sender revoked.',
            'Could not revoke the sender.'
        );
    }
}

/**
 * Reactivate button on the sender registration form. Shown on a saved Revoked registration that
 * has an enrolled key. Calls `Diagnostics.ReactivateSender`.
 */
@RegisterFormToolbarAction({
    Key: 'diagnostics-reactivate-sender',
    EntityScope: SENDER_REGISTRATIONS_ENTITY,
    Text: 'Reactivate',
    Description: 'Set this revoked sender back to Active',
    Icon: 'fa-solid fa-rotate-left',
    Mode: 'read',
    Placement: 'actions',
    Order: 41,
    Pinnable: false,
})
export class DiagnosticsReactivateSenderToolbarAction extends SenderRegistrationStatusAction {
    public override IsApplicable(ctx: FormToolbarActionLifecycleContext): boolean {
        const registration = this.RegistrationOf(ctx);
        return Boolean(
            registration?.IsSaved &&
            registration.Status === 'Revoked' &&
            registration.KeyID &&
            registration.PublicKeyBase64
        );
    }

    public override async OnExecute(ctx: FormToolbarActionLifecycleContext): Promise<void> {
        if (this.IsLoading) return;
        const registration = this.RegistrationOf(ctx);
        await this.RunOperation(
            ctx,
            () => new DiagnosticsReactivateSenderOperation().Execute({ RegistrationID: registration.ID }, { provider: ctx.Provider }),
            'Sender reactivated.',
            'Could not reactivate the sender.'
        );
    }
}

/** Keeps this file in the bundle so its toolbar actions register. */
export function LoadDiagnosticSenderRegistrationToolbarActions(): void {
    /* no-op marker */
}
