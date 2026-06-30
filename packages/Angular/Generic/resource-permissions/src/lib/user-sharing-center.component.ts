import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnInit,
    Output,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    BaseEntity,
    CompositeKey,
    LogError,
    NormalizedPermission,
    PermissionAction,
} from '@memberjunction/core';
import { PermissionEngine } from '@memberjunction/core-entities';
import { MJDialogAction, MJDialogService, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/** Which tab the Sharing Center is currently displaying. */
export type SharingCenterTab = 'shared-with-me' | 'shared-by-me';

/**
 * One collapsible domain section rendered by {@link UserSharingCenterComponent}.
 * Exported because consumers occasionally want to render their own custom layout
 * around the same shape.
 */
export interface SharingCenterDomainGroup {
    DomainName: string;
    Icon: string;
    Rows: NormalizedPermission[];
    Expanded: boolean;
}

/**
 * Default domain → entity-name mapping used by the Sharing Center to load and
 * delete the underlying permission record on Revoke. Apps with custom permission
 * domains can pass a replacement function via `SharingEntityResolver`.
 */
export const DefaultSharingEntityResolver = (domainName: string): string | null => {
    switch (domainName) {
        case 'Dashboard Permissions':
            return 'MJ: Dashboard Permissions';
        case 'Artifact Permissions':
            return 'MJ: Artifact Permissions';
        case 'Collection Permissions':
            return 'MJ: Collection Permissions';
        case 'Access Control Rules':
            return 'MJ: Access Control Rules';
        case 'Resource Permissions':
            return 'MJ: Resource Permissions';
        default:
            return null;
    }
};

/**
 * **Generic, framework-agnostic Sharing Center.** Renders two tabs:
 *
 *  - **Shared with me** — every resource the current user has direct (non-role)
 *    access to, grouped by permission domain. Each row is clickable and emits
 *    `ResourceClicked` so the embedding app can route to the resource. The Generic
 *    component never imports Angular Router / NavigationService — the parent
 *    decides how to navigate.
 *
 *  - **Shared by me** — every permission record where the current user is the
 *    grantor. Each row has a Revoke button that deletes the underlying permission
 *    record through `Metadata.GetEntityObject().Delete()` (so audit captures the
 *    revoke and BaseEntity event-driven cache invalidation runs).
 *
 * Inputs / Outputs are designed so the component drops cleanly into a dialog,
 * a side panel, an embedded widget, or a full-page route.
 *
 * @example
 * ```html
 * <mj-user-sharing-center
 *     [ActiveTab]="tab"
 *     (ActiveTabChange)="tab = $event"
 *     (ResourceClicked)="OnResourceClicked($event)"
 *     (CloseRequested)="dialogRef.Close()">
 * </mj-user-sharing-center>
 * ```
 */
@Component({
    standalone: true,
    selector: 'mj-user-sharing-center',
    imports: [CommonModule, MJEmptyStateComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './user-sharing-center.component.html',
    styleUrls: ['./user-sharing-center.component.css'],
})
export class UserSharingCenterComponent extends BaseAngularComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly dialogService = inject(MJDialogService);

    // ─── Inputs ────────────────────────────────────────────────────────────────

    /** Which tab is shown initially. Two-way bindable via `ActiveTabChange`. */
    @Input() ActiveTab: SharingCenterTab = 'shared-with-me';

    /**
     * When true, the close button is rendered in the tab strip. Hide it when the
     * embedding container provides its own close affordance.
     */
    @Input() ShowCloseButton = true;

    /** Title text displayed in the confirm-revoke dialog. */
    @Input() RevokeConfirmTitle = 'Revoke access';

    /**
     * Maps a permission domain name (e.g. `"Dashboard Permissions"`) to the entity
     * name used to load and delete the underlying record on Revoke. Replace to add
     * support for custom domains. Defaults to {@link DefaultSharingEntityResolver}.
     */
    @Input() SharingEntityResolver: (domainName: string) => string | null = DefaultSharingEntityResolver;

    // ─── Outputs ───────────────────────────────────────────────────────────────

    /** Two-way binding partner for `ActiveTab`. */
    @Output() ActiveTabChange = new EventEmitter<SharingCenterTab>();

    /** Fired when a row in the "Shared with me" tab is clicked. */
    @Output() ResourceClicked = new EventEmitter<NormalizedPermission>();

    /** Fired when the user clicks the close button. Parent should close the host dialog/panel. */
    @Output() CloseRequested = new EventEmitter<void>();

    /** Fired after a permission has been successfully revoked. */
    @Output() PermissionRevoked = new EventEmitter<NormalizedPermission>();

    /** Fired whenever an error is shown to the user. Useful for parent telemetry. */
    @Output() ErrorOccurred = new EventEmitter<string>();

    // ─── Public state (read by template) ───────────────────────────────────────

    SharedWithMe: SharingCenterDomainGroup[] = [];
    SharedByMe: SharingCenterDomainGroup[] = [];

    IsLoadingWithMe = false;
    IsLoadingByMe = false;

    ErrorMessage: string | null = null;

    async ngOnInit(): Promise<void> {
        await this.loadTab(this.ActiveTab);
    }

    // ─── Public methods (callable from parent via @ViewChild) ──────────────────

    /** Switch to a tab and load its data if not already loaded. */
    public async SwitchTab(tab: SharingCenterTab): Promise<void> {
        if (this.ActiveTab === tab) return;
        this.ActiveTab = tab;
        this.ActiveTabChange.emit(tab);
        await this.loadTab(tab);
    }

    /** Force-refresh the currently active tab. */
    public async Refresh(): Promise<void> {
        if (this.ActiveTab === 'shared-with-me') {
            this.SharedWithMe = [];
            await this.loadSharedWithMe();
        } else {
            this.SharedByMe = [];
            await this.loadSharedByMe();
        }
    }

    // ─── Template event handlers ───────────────────────────────────────────────

    OnTabClick(tab: SharingCenterTab): Promise<void> {
        return this.SwitchTab(tab);
    }

    OnRowClick(row: NormalizedPermission): void {
        this.ResourceClicked.emit(row);
    }

    OnClose(): void {
        this.CloseRequested.emit();
    }

    async OnRevoke(row: NormalizedPermission, event: Event): Promise<void> {
        event.stopPropagation();
        if (!row.SourceRecordID) return;

        const entityName = this.SharingEntityResolver(row.DomainName);
        if (!entityName) return;

        const confirmed = await this.confirmRevoke(row);
        if (!confirmed) return;

        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<BaseEntity>(entityName, md.CurrentUser);
            const key = new CompositeKey();
            key.KeyValuePairs.push({ FieldName: 'ID', Value: row.SourceRecordID });
            const loaded = await entity.InnerLoad(key);
            if (!loaded) {
                this.setError('Could not load the permission record.');
                return;
            }
            const deleted = await entity.Delete();
            if (!deleted) {
                this.setError(`Revoke failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                return;
            }
            this.PermissionRevoked.emit(row);
            await this.Refresh();
        } catch (e) {
            this.setError(`Revoke failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    ToggleGroup(group: SharingCenterDomainGroup): void {
        group.Expanded = !group.Expanded;
        this.cdr.detectChanges();
    }

    ActionsLabel(actions: PermissionAction[]): string {
        return actions.join(', ');
    }

    TrackByDomain(_idx: number, g: SharingCenterDomainGroup): string {
        return g.DomainName;
    }

    TrackByRow(_idx: number, r: NormalizedPermission): string {
        return r.SourceRecordID ?? `${r.DomainName}|${r.ResourceID ?? ''}|${r.GranteeID ?? ''}`;
    }

    // ─── Internal helpers ──────────────────────────────────────────────────────

    private async loadTab(tab: SharingCenterTab): Promise<void> {
        if (tab === 'shared-with-me') {
            if (this.SharedWithMe.length === 0 && !this.IsLoadingWithMe) {
                await this.loadSharedWithMe();
            }
        } else {
            if (this.SharedByMe.length === 0 && !this.IsLoadingByMe) {
                await this.loadSharedByMe();
            }
        }
    }

    private async loadSharedWithMe(): Promise<void> {
        const user = this.ProviderToUse.CurrentUser;
        if (!user) return;

        this.IsLoadingWithMe = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();
        try {
            const rows = await PermissionEngine.Instance.GetPermissionsSharedWithUser(user);
            this.SharedWithMe = this.groupByDomain(rows);
        } catch (e) {
            this.setError(`Failed to load shares: ${e instanceof Error ? e.message : String(e)}`);
        }
        this.IsLoadingWithMe = false;
        this.cdr.detectChanges();
    }

    private async loadSharedByMe(): Promise<void> {
        const user = this.ProviderToUse.CurrentUser;
        if (!user) return;

        this.IsLoadingByMe = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();
        try {
            const rows = await PermissionEngine.Instance.GetPermissionsGrantedByUser(user);
            this.SharedByMe = this.groupByDomain(rows);
        } catch (e) {
            this.setError(`Failed to load grants: ${e instanceof Error ? e.message : String(e)}`);
        }
        this.IsLoadingByMe = false;
        this.cdr.detectChanges();
    }

    private groupByDomain(rows: NormalizedPermission[]): SharingCenterDomainGroup[] {
        const bucket = new Map<string, NormalizedPermission[]>();
        for (const r of rows) {
            const list = bucket.get(r.DomainName) ?? [];
            list.push(r);
            bucket.set(r.DomainName, list);
        }
        const groups: SharingCenterDomainGroup[] = [];
        for (const [domainName, list] of bucket) {
            groups.push({
                DomainName: domainName,
                Icon: PermissionEngine.DomainIconFor(domainName),
                Rows: list.sort((a, b) => (a.ResourceName ?? '').localeCompare(b.ResourceName ?? '')),
                Expanded: list.length <= 10,
            });
        }
        return groups.sort((a, b) => a.DomainName.localeCompare(b.DomainName));
    }

    private setError(message: string): void {
        this.ErrorMessage = message;
        this.ErrorOccurred.emit(message);
        LogError(message);
        this.cdr.detectChanges();
    }

    private confirmRevoke(row: NormalizedPermission): Promise<boolean> {
        const resourceLabel = row.ResourceName ? `"${row.ResourceName}"` : 'this resource';
        const granteeLabel = row.GranteeName ?? 'this user';
        const message = `Revoke access to ${resourceLabel} for ${granteeLabel}? This cannot be undone.`;

        return new Promise<boolean>((resolve) => {
            const ref = this.dialogService.open({
                title: this.RevokeConfirmTitle,
                content: message,
                actions: [
                    { text: 'Revoke', primary: true, themeColor: 'error' },
                    { text: 'Cancel', primary: false },
                ],
                width: 420,
                minWidth: 300,
            });

            ref.Result.subscribe((result) => {
                const action = result as MJDialogAction | undefined;
                resolve(!!action && 'text' in action && action.text === 'Revoke');
            });
        });
    }
}
