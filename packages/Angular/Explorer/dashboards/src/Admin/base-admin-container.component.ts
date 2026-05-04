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

    protected currentRef: ComponentRef<unknown> | null = null;

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
        this.currentRef?.destroy();
        this.currentRef = null;
        super.ngOnDestroy();
    }

    public override async GetResourceDisplayName(): Promise<string> { return this.ContainerTitle; }
    public override async GetResourceIconClass(): Promise<string> { return this.ContainerIcon; }

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
        // Tear down any previously rendered sub-component
        this.contentHost.clear();
        this.currentRef?.destroy();
        this.currentRef = null;

        if (section.source.kind === 'resource') {
            await this.renderResource(section.source.driverClass);
        } else {
            await this.renderDashboard(section.source.dashboardName);
        }
    }

    private async renderResource(driverClass: string): Promise<void> {
        const reg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(BaseResourceComponent, driverClass);
        if (!reg) {
            this.LoadError = `Component "${driverClass}" is not registered. Make sure its module is imported.`;
            return;
        }
        const ref = this.contentHost.createComponent(reg.SubClass as Type<BaseResourceComponent>);
        const instance = ref.instance as BaseResourceComponent;
        // Pass the container's ResourceData through so sub-components that look at it have something
        if (this.Data) {
            instance.Data = this.Data;
        }
        this.applyHostSizing(ref);
        this.currentRef = ref;
    }

    private async renderDashboard(dashboardName: string): Promise<void> {
        await DashboardEngine.Instance.Config(false);
        const dashboard = DashboardEngine.Instance.Dashboards.find(d => d.Name === dashboardName);
        if (!dashboard) {
            this.LoadError = `Dashboard "${dashboardName}" was not found in metadata.`;
            return;
        }
        if (dashboard.Type !== 'Code') {
            this.LoadError = `Dashboard "${dashboardName}" has type "${dashboard.Type}" — only Code dashboards can be embedded here.`;
            return;
        }
        if (!dashboard.DriverClass) {
            this.LoadError = `Dashboard "${dashboardName}" has no DriverClass set.`;
            return;
        }
        const reg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(BaseDashboard, dashboard.DriverClass);
        if (!reg) {
            this.LoadError = `Driver class "${dashboard.DriverClass}" is not registered against BaseDashboard.`;
            return;
        }
        const ref = this.contentHost.createComponent(reg.SubClass as Type<BaseDashboard>);
        const instance = ref.instance as BaseDashboard;
        instance.Config = { dashboard, userState: undefined };
        instance.Refresh();
        this.applyHostSizing(ref);
        this.currentRef = ref;
    }

    /**
     * Force the rendered sub-component's host element to fill the container
     * cell. Mirrors what `tab-container` does for top-level resources — many
     * dashboards rely on inline `height: 100%` to bound their internal layout
     * (so their own `overflow-y: auto` regions actually scroll).
     */
    private applyHostSizing(ref: ComponentRef<unknown>): void {
        const hostEl = (ref.hostView as unknown as { rootNodes: HTMLElement[] }).rootNodes[0];
        if (!hostEl || !(hostEl instanceof HTMLElement)) return;
        hostEl.style.height = '100%';
        hostEl.style.minHeight = '0';
        hostEl.style.display = 'flex';
        hostEl.style.flexDirection = 'column';
        hostEl.style.flex = '1 1 auto';
    }

    private findSection(id: string | undefined | null): AdminSection | undefined {
        if (!id) return undefined;
        return this.Sections.find(s => s.id === id);
    }
}
