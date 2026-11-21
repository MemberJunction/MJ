import { LogError } from '@memberjunction/core';
import { MjRecordLinksComponent } from '../../links/record-links.component';
import {
    BaseFormToolbarAction,
    FormToolbarActionLifecycleContext,
    RegisterFormToolbarAction
} from '../base-form-toolbar-action';

/**
 * Built-in pluggable toolbar action for the Bidirectional Record Links drawer (`Key: 'links'`).
 *
 * Demonstrates the {@link BaseFormToolbarAction} lifecycle contract:
 * - Registered globally (`EntityScope: '*'`) and pinnable (`Pinnable: true`).
 * - During {@link OnPrewarm}, always computes the zero-cost in-memory outgoing links summary
 *   from the record's FK / polymorphic-FK fields, and **only** executes the network
 *   `GetRecordDependencies` pre-warm when the user has pinned the `Links` button (`ctx.IsPinned`)
 *   or when the button is visible on the main toolbar (`ctx.IsVisibleOnBar`).
 * - If the user pins the `Links` button mid-session, {@link OnPinStateChanged} immediately
 *   triggers {@link OnPrewarm} so the badge count populates right away.
 */
@RegisterFormToolbarAction({
    Key: 'links',
    EntityScope: '*',
    MenuLabel: 'Links',
    Description: 'View linked records',
    Icon: 'fa-solid fa-diagram-project',
    Mode: 'read',
    Placement: 'actions',
    Order: 65,
    Pinnable: true
})
export class RecordLinksToolbarAction extends BaseFormToolbarAction {
    public override IsApplicable(ctx: FormToolbarActionLifecycleContext): boolean {
        return Boolean(ctx.Record?.IsSaved && ctx.EntityInfo);
    }

    public override async OnPrewarm(ctx: FormToolbarActionLifecycleContext): Promise<void> {
        const record = ctx.Record;
        if (!record?.IsSaved || !record.EntityInfo) {
            ctx.SetBadge(undefined);
            return;
        }

        // 1. Always compute the zero-cost in-memory outgoing links summary
        const outgoingSummary = MjRecordLinksComponent.BuildOutgoingLinksSummary(record, ctx.Provider);
        ctx.SetLinksSummary({
            TotalCount: outgoingSummary.TotalCount,
            OutgoingCount: outgoingSummary.OutgoingCount,
            IncomingCount: outgoingSummary.IncomingCount,
            ByEntity: outgoingSummary.ByEntity
        });
        ctx.SetBadge(outgoingSummary.TotalCount > 0 ? outgoingSummary.TotalCount : undefined);

        // 2. Only pre-warm incoming GetRecordDependencies over the network if the button is pinned or visible on bar
        if (!ctx.IsPinned && !ctx.IsVisibleOnBar) {
            ctx.RequestChangeDetection();
            return;
        }

        try {
            const summary = await MjRecordLinksComponent.PrewarmRecordLinkCount(record, ctx.Provider);
            ctx.SetLinksSummary({
                TotalCount: summary.TotalCount,
                OutgoingCount: summary.OutgoingCount,
                IncomingCount: summary.IncomingCount,
                ByEntity: summary.ByEntity
            });
            ctx.SetBadge(summary.TotalCount > 0 ? summary.TotalCount : undefined);
            ctx.RequestChangeDetection();
        } catch (e) {
            LogError(`RecordLinksToolbarAction.OnPrewarm failed for ${record.EntityInfo.Name}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    public override async OnPinStateChanged(
        ctx: FormToolbarActionLifecycleContext,
        isPinned: boolean
    ): Promise<void> {
        if (isPinned) {
            await this.OnPrewarm(ctx);
        }
    }

    public override async OnRecordRefreshed(ctx: FormToolbarActionLifecycleContext): Promise<void> {
        await this.OnPrewarm(ctx);
    }

    public override OnExecute(ctx: FormToolbarActionLifecycleContext): void {
        const nextOpen = !ctx.IsRecordLinksDrawerOpen();
        ctx.SetRecordLinksDrawerOpen(nextOpen);
        ctx.SetActive(nextOpen);
        ctx.RequestChangeDetection();
    }
}
