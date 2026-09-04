import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { CompositeKey, RunView } from '@memberjunction/core';
import { RecordOpenedEvent, ViewRelatedRecordNavigation } from '@memberjunction/ng-entity-viewer';
import type { MJLeftNavItem, MJLeftNavSection } from '@memberjunction/ng-ui-components';

/**
 * One item in a category's rail, and what the body shows when it is selected.
 *
 * `kind` exists because the two page shapes need different components: an entity page renders
 * <mj-entity-viewer>, a query page renders <mj-query-viewer>. Keeping it a discriminated field
 * rather than two parallel arrays means the rail order and the body switch cannot drift apart.
 */
export interface ShelterCategoryPage {
    id: string;
    label: string;
    icon: string;
    kind: 'entity' | 'query' | 'pending';
    /** kind 'entity' — the entity whose grid to show. */
    entityName?: string;
    /** kind 'query' — resolved to an ID at runtime; see ResolveQueryIds. */
    queryName?: string;
    /** kind 'pending' — what is not built yet, named honestly on screen. */
    pendingNote?: string;
}

/**
 * MJ Academy — the shared shell for a TOP-BAR category that owns a side rail.
 *
 * WHY THIS EXISTS. MJ's nav metadata is FLAT: `MJApplicationEntity_IDefaultNavItem` is
 * `{ Label, Icon, ResourceType, RecordID, DriverClass, isDefault }` and has no children field. So a
 * two-level navigation -- four top-bar categories, each with its own sub-pages -- cannot be
 * expressed as metadata. The platform's answer, and what bizapps-accounting does across nine
 * shells, is that each top-bar item is a `Custom` resource whose COMPONENT owns a rail and swaps
 * its own body.
 *
 * Everything the rail is made of ships with MJ: <mj-page-layout>, <mj-page-header>, <mj-page-body>,
 * <mj-left-nav> and <mj-left-nav-content> are all in @memberjunction/ng-ui-components. We supply
 * the page list and nothing else -- no bespoke rail CSS, which is exactly what those components
 * exist to prevent.
 *
 * Each subclass is thin: a title, an icon, and its pages. It must ALSO carry its own
 * @RegisterClass DriverClass -- sharing one class across nav items makes the shell highlight every
 * item using it (learned in module 4).
 */
@Component({ template: '' })
export abstract class ShelterCategoryBase extends BaseResourceComponent {
    protected cdr = inject(ChangeDetectorRef);

    /** Shown in the page header and as the rail's mobile title. */
    public abstract get CategoryTitle(): string;
    public abstract get CategoryIcon(): string;
    /** The rail, in display order. The first entry is the landing page. */
    public abstract get Pages(): ShelterCategoryPage[];

    public ActivePageId = '';
    /** Query name -> ID, resolved once so <mj-query-viewer> can be pointed at it. */
    public QueryIds: Record<string, string> = {};

    public override ngOnInit(): void {
        super.ngOnInit();
        this.ActivePageId = this.Pages[0]?.id ?? '';
        void this.resolveQueryIds();
    }

    /** The rail. One unlabelled section -- a header above three items would be noise. */
    public get RailSections(): MJLeftNavSection[] {
        const items: MJLeftNavItem[] = this.Pages.map((p) => ({
            id: p.id,
            label: p.label,
            icon: p.icon,
            disabled: p.kind === 'pending',
        }));
        return [{ items }];
    }

    public get ActivePage(): ShelterCategoryPage | undefined {
        return this.Pages.find((p) => p.id === this.ActivePageId);
    }

    public OnRailItemClicked(event: { id: string } | string): void {
        const id = typeof event === 'string' ? event : event?.id;
        if (id) {
            this.ActivePageId = id;
            this.cdr.markForCheck();
        }
    }

    /**
     * Turns query NAMES into IDs. <mj-query-viewer> takes a QueryId, and hardcoding a metadata UUID
     * into a component would couple the code to a specific database; the name is the stable
     * contract. One read for every query in the category.
     */
    private async resolveQueryIds(): Promise<void> {
        const names = this.Pages.filter((p) => p.kind === 'query' && p.queryName).map((p) => p.queryName!);
        if (names.length === 0) return;
        try {
            const quoted = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<{ ID: string; Name: string }>(
                {
                    EntityName: 'MJ: Queries',
                    ExtraFilter: `Name IN (${quoted})`,
                    Fields: ['ID', 'Name'],
                    ResultType: 'simple',
                },
                this.ProviderToUse.CurrentUser,
            );
            if (res.Success) {
                for (const row of res.Results ?? []) this.QueryIds[row.Name] = row.ID;
                this.cdr.markForCheck();
            }
        } catch {
            // A missing ID leaves the query page empty rather than breaking the whole category.
        }
    }

    // ── Grid wiring. mj-entity-viewer only EMITS; a host that ignores these gets a grid whose
    //    New button and row clicks silently do nothing (module 4). ──────────────────────────
    public onCreateNewRecord(entityName: string): void {
        this.navigationService.OpenNewEntityRecord(entityName);
    }

    public onRecordOpened(event: RecordOpenedEvent): void {
        if (event?.entity && event.compositeKey) {
            this.navigationService.OpenEntityRecord(event.entity.Name, event.compositeKey);
        }
    }

    /** A link inside a cell -- a separate output from RecordOpened, so wiring one leaves the other dead. */
    public onOpenRelatedRecord(nav: ViewRelatedRecordNavigation): void {
        if (nav?.entityName && nav.recordKey != null) {
            this.navigationService.OpenEntityRecord(nav.entityName, CompositeKey.FromID(String(nav.recordKey)));
        }
    }

    override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return this.CategoryTitle;
    }

    override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return this.CategoryIcon;
    }
}
