import {
    Directive,
    OnInit,
    OnDestroy,
    ChangeDetectorRef,
    ViewChild,
    ViewContainerRef,
    ComponentRef,
    Type,
    inject
} from '@angular/core';
import { BaseResourceComponent, BaseDashboard } from '@memberjunction/ng-shared';
import { MJGlobal } from '@memberjunction/global';
import { DashboardEngine } from '@memberjunction/core-entities';
import { MJLeftNavItem, MJLeftNavSection } from '@memberjunction/ng-ui-components';

/** A single sub-section inside an admin container's left-nav. */
export interface AdminSection {
    /** Stable identifier — used in the URL `?section=` deep-link. */
    id: string;
    label: string;
    icon: string;
    description: string;
    source: AdminSectionSource;
}

/**
 * How to resolve and instantiate the component for this sub-section.
 *
 * - `resource`: looks up `@RegisterClass(BaseResourceComponent, driverClass)` and renders it directly.
 * - `dashboard`: looks up the MJ Dashboard record by name, then renders its `DriverClass` via the
 *   BaseDashboard registry with a synthetic `{ dashboard }` config (mirrors the shell's flow for
 *   `ResourceType: "Dashboards"` nav items).
 */
export type AdminSectionSource =
    | { kind: 'resource'; driverClass: string }
    | { kind: 'dashboard'; dashboardName: string };

/**
 * Shared base for all Admin app container resources. Subclasses declare:
 *   - ContainerTitle / ContainerIcon / ContainerSubtitle
 *   - Sections[]
 *   - @RegisterClass(BaseResourceComponent, '...')
 *
 * The base handles: left-nav state, URL deep-linking via NavigationService,
 * dynamic component instantiation for both resource and dashboard sections,
 * teardown on switch.
 */
@Directive()
export abstract class BaseAdminContainerComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public abstract readonly ContainerTitle: string;
    public abstract readonly ContainerIcon: string;
    public abstract readonly ContainerSubtitle: string;
    public abstract readonly Sections: AdminSection[];

    @ViewChild('contentHost', { read: ViewContainerRef, static: true })
    protected contentHost!: ViewContainerRef;

    public ActiveSection = '';
    public LoadError: string | null = null;
    public IsLoading = false;

    /**
     * Cache of section.id → ComponentRef. Once a sub-section is rendered we
     * keep its component alive across switches by detaching + reattaching the
     * view (instead of destroying + recreating). This preserves state — Event
     * Monitor's captured events, GraphQL Console's history, query inputs,
     * scroll position, etc. — and avoids expensive re-init.
     */
    protected cache = new Map<string, ComponentRef<unknown>>();
    protected currentSectionId: string | null = null;

    protected readonly cdr = inject(ChangeDetectorRef);

    public override async ngOnInit(): Promise<void> {
        super.ngOnInit();

        const params = this.GetQueryParams();
        const requested = params['section'];
        const initial = this.findSection(requested)?.id ?? this.Sections[0]?.id ?? '';
        const target = this.findSection(initial);
        if (target) {
            await this.selectSection(target, /*syncUrl*/ false);
        }

        if (!requested && this.ActiveSection) {
            this.UpdateQueryParams({ section: this.ActiveSection });
        }

        this.NotifyLoadComplete();
    }

    public override ngOnDestroy(): void {
        for (const ref of this.cache.values()) {
            try { ref.destroy(); } catch { /* ignore */ }
        }
        this.cache.clear();
        this.currentSectionId = null;
        super.ngOnDestroy();
    }

    public override async GetResourceDisplayName(): Promise<string> { return this.ContainerTitle; }
    public override async GetResourceIconClass(): Promise<string> { return this.ContainerIcon; }

    /**
     * Single-section view of `Sections` shaped for `<mj-left-nav>`. AdminSection
     * already has the required id / label / icon / description fields, so it's
     * structurally compatible with MJLeftNavItem.
     */
    public get NavSections(): MJLeftNavSection[] {
        return [{ items: this.Sections }];
    }

    /** Adapter from `<mj-left-nav>`'s ItemClicked event back to `selectSection`. */
    public OnNavItemClicked(item: MJLeftNavItem): void {
        const section = this.Sections.find(s => s.id === item.id);
        if (section) {
            void this.OnSectionClick(section);
        }
    }

    /** Called by the framework on browser back/forward + deep-link entry. */
    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        const section = params['section'];
        if (!section || section === this.ActiveSection) return;
        const target = this.findSection(section);
        if (target) {
            void this.selectSection(target, /*syncUrl*/ false);
        }
    }

    public async OnSectionClick(section: AdminSection): Promise<void> {
        if (section.id === this.ActiveSection) return;
        await this.selectSection(section, /*syncUrl*/ true);
    }

    // ---------- protected ----------

    private async selectSection(section: AdminSection, syncUrl: boolean): Promise<void> {
        // Guard against duplicate calls for the same section. Without this,
        // ngOnInit's own GetQueryParams read races with the workspace stream's
        // synchronous replay through OnQueryParamsChanged on first mount —
        // both call selectSection with the same target, both reach
        // createComponent, and two instances of the sub-page end up mounted
        // in the contentHost. OnSectionClick + OnQueryParamsChanged each
        // guard their own call site, but defense-in-depth here covers any
        // future caller (and the ngOnInit ↔ stream-replay race specifically).
        if (section.id === this.ActiveSection) {
            return;
        }
        this.ActiveSection = section.id;
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();

        if (syncUrl) {
            this.UpdateQueryParams({ section: section.id });
        }

        try {
            await this.renderSection(section);
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    private async renderSection(section: AdminSection): Promise<void> {
        // Detach (don't destroy) the currently visible sub-component so it
        // stays alive in memory with its state intact.
        this.detachCurrent();

        // Reattach if cached
        const cached = this.cache.get(section.id);
        if (cached) {
            this.contentHost.insert(cached.hostView);
            this.currentSectionId = section.id;
            return;
        }

        // Otherwise, create fresh
        const ref = section.source.kind === 'resource'
            ? await this.createResourceRef(section.source.driverClass)
            : await this.createDashboardRef(section.source.dashboardName);

        if (ref) {
            this.cache.set(section.id, ref);
            this.currentSectionId = section.id;
        }
    }

    private detachCurrent(): void {
        if (!this.currentSectionId) return;
        const cur = this.cache.get(this.currentSectionId);
        if (!cur) return;
        const idx = this.contentHost.indexOf(cur.hostView);
        if (idx >= 0) this.contentHost.detach(idx);
    }

    private async createResourceRef(driverClass: string): Promise<ComponentRef<unknown> | null> {
        const reg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(BaseResourceComponent, driverClass);
        if (!reg) {
            this.LoadError = `Component "${driverClass}" is not registered. Make sure its module is imported.`;
            return null;
        }
        const ref = this.contentHost.createComponent(reg.SubClass as Type<BaseResourceComponent>);
        const instance = ref.instance as BaseResourceComponent;
        if (this.Data) instance.Data = this.Data;
        return ref;
    }

    private async createDashboardRef(dashboardName: string): Promise<ComponentRef<unknown> | null> {
        await DashboardEngine.Instance.Config(false);
        const dashboard = DashboardEngine.Instance.Dashboards.find(d => d.Name === dashboardName);
        if (!dashboard) {
            this.LoadError = `Dashboard "${dashboardName}" was not found in metadata.`;
            return null;
        }
        if (dashboard.Type !== 'Code') {
            this.LoadError = `Dashboard "${dashboardName}" has type "${dashboard.Type}" — only Code dashboards can be embedded here.`;
            return null;
        }
        if (!dashboard.DriverClass) {
            this.LoadError = `Dashboard "${dashboardName}" has no DriverClass set.`;
            return null;
        }
        const reg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(BaseDashboard, dashboard.DriverClass);
        if (!reg) {
            this.LoadError = `Driver class "${dashboard.DriverClass}" is not registered against BaseDashboard.`;
            return null;
        }
        const ref = this.contentHost.createComponent(reg.SubClass as Type<BaseDashboard>);
        const instance = ref.instance as BaseDashboard;
        instance.Config = { dashboard, userState: undefined };
        instance.Refresh();
        return ref;
    }

    private findSection(id: string | undefined | null): AdminSection | undefined {
        if (!id) return undefined;
        return this.Sections.find(s => s.id === id);
    }
}
