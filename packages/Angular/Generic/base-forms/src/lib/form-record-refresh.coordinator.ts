import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { BaseEntity } from '@memberjunction/core';

/**
 * Per-form broadcast that the current record was reloaded from the database.
 *
 * Provided on `<mj-record-form-container>` (same pattern as
 * {@link FormChromeCoordinator} / {@link FormSlotCoordinator}) so projected
 * related-entity grids, slot-mounted panels, the IS-A side panel, and the
 * toolbar can all see it. `providers` (not `viewProviders`) is what makes
 * that visible to `ng-content`.
 *
 * Listeners MUST no-op when they have never loaded (e.g. a related grid still
 * waiting on `DeferLoadUntilVisible`). Parent refresh is not a license to
 * fan out RunView across every collapsed section.
 */
@Injectable()
export class FormRecordRefreshCoordinator {
    private readonly refreshed$ = new Subject<BaseEntity>();

    /** Emits the live parent record after a successful `RefreshRecord()`. */
    public readonly Refreshed$ = this.refreshed$.asObservable();

    /**
     * Push a successful parent-record refresh to in-form listeners.
     */
    public Notify(record: BaseEntity): void {
        this.refreshed$.next(record);
    }
}
