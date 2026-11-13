import {
    BaseFormToolbarAction,
    FormToolbarActionLifecycleContext,
    RegisterFormToolbarAction
} from '../base-form-toolbar-action';

/**
 * Built-in pluggable toolbar action for the Anchored Record Comments drawer (`Key: 'comments'`).
 *
 * - Registered globally (`EntityScope: '*'`) and pinnable (`Pinnable: true`).
 * - Available in both `'read'` and `'edit'` modes (`Mode: 'both'`) so collaborators can read
 *   and reply to field/section comments while editing a record.
 * - Badge count reflects the number of open (unresolved) anchored comment threads on the record,
 *   pre-warmed by {@link FormRecordCommentsCoordinatorService}.
 */
@RegisterFormToolbarAction({
    Key: 'comments',
    EntityScope: '*',
    MenuLabel: 'Notes & suggestions',
    Description: 'View notes and field suggestions on this record',
    Icon: 'fa-regular fa-comment-dots',
    Mode: 'read',
    Placement: 'actions',
    Order: 62,
    Pinnable: true
})
export class RecordCommentsToolbarAction extends BaseFormToolbarAction {
    public override IsApplicable(ctx: FormToolbarActionLifecycleContext): boolean {
        return Boolean(
            ctx.Record?.IsSaved &&
            ctx.EntityInfo &&
            ctx.EntityInfo.AllowRecordComments !== false
        );
    }

    public override OnPrewarm(ctx: FormToolbarActionLifecycleContext): void {
        const count = ctx.GetRecordCommentCount?.() ?? 0;
        ctx.SetBadge(count > 0 ? count : undefined);
        ctx.SetActive(Boolean(ctx.IsRecordCommentsDrawerOpen?.()));
    }

    public override OnRecordRefreshed(ctx: FormToolbarActionLifecycleContext): void {
        this.OnPrewarm(ctx);
    }

    public override OnExecute(ctx: FormToolbarActionLifecycleContext): void {
        const nextOpen = !(ctx.IsRecordCommentsDrawerOpen?.() ?? false);
        ctx.SetRecordCommentsDrawerOpen?.(nextOpen);
        ctx.SetActive(nextOpen);
        ctx.RequestChangeDetection();
    }
}
