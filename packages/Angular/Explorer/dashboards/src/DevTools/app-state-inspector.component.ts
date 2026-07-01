import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { TabConfig } from '@memberjunction/ng-ui-components';
import { DevToolsPrefs } from './dev-tools-prefs';
import { buildAppStateInspectorAgentContext } from './dev-tools-agent-context';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { WorkspaceStateManager } from '@memberjunction/ng-base-application';
import { DeveloperModeService } from '@memberjunction/ng-shared';

interface InspectorSection {
    id: string;
    label: string;
    icon: string;
    enabled: boolean;
    description?: string;
}

/**
 * App State Inspector — read-only structured view of the Explorer's runtime
 * state. Replaces the legacy "Inspect App State" user-menu item which only
 * dumped to console. Lives in the Admin app's dev tools area.
 */
@RegisterClass(BaseResourceComponent, 'AppStateInspector')
@Component({
    standalone: false,
    selector: 'mj-app-state-inspector',
    templateUrl: './app-state-inspector.component.html',
    styleUrls: ['./inspector-shared.css']
})
export class AppStateInspectorComponent extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {

    public Sections: InspectorSection[] = [
        { id: 'user',     label: 'Current User',         icon: 'fa-solid fa-user',           enabled: true, description: 'Identity, roles, email' },
        { id: 'provider', label: 'Provider',             icon: 'fa-solid fa-plug',           enabled: true, description: 'API URL, entities loaded' },
        { id: 'workspace',label: 'Workspace',            icon: 'fa-solid fa-table-columns',  enabled: true, description: 'Tabs, layout, active state' },
        { id: 'app',      label: 'Active Application',   icon: 'fa-solid fa-th-large',       enabled: true, description: 'Current app + nav items' },
        { id: 'dev',      label: 'Developer Mode',       icon: 'fa-solid fa-code',           enabled: true, description: 'Dev mode flag, eligibility' },
        { id: 'browser',  label: 'Browser & Session',    icon: 'fa-solid fa-window-maximize',enabled: true, description: 'User agent, viewport, URL' }
    ];

    public ActiveSection = 'user';
    public StateJson = '{}';
    public SearchQuery = '';
    public CopyConfirmed = false;
    public LastRefreshed = new Date();

    constructor(
        private cdr: ChangeDetectorRef,
        private workspace: WorkspaceStateManager,
        private devMode: DeveloperModeService
    ) {
        super();
    }

    public ngOnInit(): void {
        const p = DevToolsPrefs.Get<{ activeSection?: string }>('appStateInspector');
        if (p?.activeSection && this.Sections.some(s => s.id === p.activeSection)) {
            this.ActiveSection = p.activeSection;
        }
        this.refresh();
        this.NotifyLoadComplete();
    }

    public ngAfterViewInit(): void {
        // Publish initial agent context. Re-emit happens in refresh() (section change).
        // 🔒 METADATA-ONLY surface — NO client tools are registered (see SAFETY note below).
        this.publishAgentContext();
    }

    public override ngOnDestroy(): void {
        DevToolsPrefs.Save('appStateInspector', { activeSection: this.ActiveSection });
        super.ngOnDestroy();
    }

    public override async GetResourceDisplayName(): Promise<string> { return 'App State Inspector'; }
    public override async GetResourceIconClass(): Promise<string> { return 'fa-solid fa-magnifying-glass-chart'; }

    /** Sections rendered as horizontal tabs in the chrome's [toolbar] slot. */
    public get tabsConfig(): TabConfig[] {
        return this.Sections.map(s => ({
            key: s.id,
            label: s.label,
            icon: s.icon
        }));
    }

    /** Adapter for `<mj-tab-nav>`'s string-typed `(TabChange)` output. */
    public onTabChange(key: string): void {
        const section = this.Sections.find(s => s.id === key);
        if (section) {
            this.OnSectionClick(section);
        }
    }

    public OnSectionClick(section: InspectorSection): void {
        if (this.ActiveSection === section.id) return;
        this.ActiveSection = section.id;
        DevToolsPrefs.Save('appStateInspector', { activeSection: this.ActiveSection });
        this.refresh();
    }

    public refresh(): void {
        this.StateJson = JSON.stringify(this.computeSectionData(this.ActiveSection), this.jsonReplacer, 2);
        this.LastRefreshed = new Date();
        this.cdr.markForCheck();
        this.publishAgentContext();
    }

    public async OnCopy(): Promise<void> {
        try {
            await navigator.clipboard.writeText(this.StateJson);
            this.CopyConfirmed = true;
            this.cdr.markForCheck();
            setTimeout(() => {
                this.CopyConfirmed = false;
                this.cdr.markForCheck();
            }, 1800);
        } catch {
            // clipboard unavailable
        }
    }

    public OnDownload(): void {
        const blob = new Blob([this.StateJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mj-app-state-${this.ActiveSection}-${this.timestampSlug()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    public get LastRefreshedLabel(): string {
        return this.LastRefreshed.toLocaleTimeString();
    }

    public get SectionLabel(): string {
        return this.Sections.find(s => s.id === this.ActiveSection)?.label ?? '';
    }

    // ---------- private ----------

    private computeSectionData(section: string): unknown {
        switch (section) {
            case 'user':      return this.userData();
            case 'provider':  return this.providerData();
            case 'workspace': return this.workspaceData();
            case 'app':       return this.appData();
            case 'dev':       return this.devData();
            case 'browser':   return this.browserData();
            default:          return {};
        }
    }

    private userData(): unknown {
        const user = this.ProviderToUse?.CurrentUser;
        if (!user) return { error: 'No current user' };
        return {
            ID: user.ID,
            Name: user.Name,
            FirstName: user.FirstName,
            LastName: user.LastName,
            Email: user.Email,
            Type: user.Type,
            IsActive: user.IsActive,
            LinkedRecordType: user.LinkedRecordType,
            CreatedAt: user.__mj_CreatedAt,
            Roles: (user.UserRoles ?? []).map(r => ({ Role: r.Role, RoleID: r.RoleID }))
        };
    }

    private providerData(): unknown {
        const provider = this.ProviderToUse;
        if (!provider) return { error: 'No provider' };
        const data: Record<string, unknown> = {
            type: provider.constructor.name,
            EntitiesCount: provider.Entities?.length ?? 0,
            ApplicationsCount: provider.Applications?.length ?? 0,
            QueriesCount: provider.Queries?.length ?? 0,
            RolesCount: provider.Roles?.length ?? 0
        };
        if (provider instanceof GraphQLDataProvider) {
            data.URL = provider.ConfigData?.URL;
            data.WSURL = provider.ConfigData?.WSURL;
        }
        return data;
    }

    private workspaceData(): unknown {
        const config = this.workspace.GetConfiguration();
        return config;
    }

    private appData(): unknown {
        const config = this.workspace.GetConfiguration();
        if (!config) return { error: 'No workspace configuration' };
        const activeTab = config.tabs?.find(t => t.id === config.activeTabId);
        return {
            ActiveTabId: config.activeTabId,
            ActiveTab: activeTab,
            TabCount: config.tabs?.length ?? 0
        };
    }

    private devData(): unknown {
        return {
            IsEnabled: this.devMode.IsEnabled,
            IsDeveloper: this.devMode.IsDeveloper,
            EligibleRoles: ['Developer', 'Admin', 'System Administrator', 'Integration']
        };
    }

    private browserData(): unknown {
        return {
            UserAgent: navigator.userAgent,
            Language: navigator.language,
            Languages: navigator.languages,
            Platform: navigator.platform,
            Online: navigator.onLine,
            Viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
            URL: window.location.href,
            Origin: window.location.origin,
            Path: window.location.pathname + window.location.search,
            Memory: this.readMemory()
        };
    }

    private jsonReplacer(_key: string, value: unknown): unknown {
        if (value instanceof Date) return value.toISOString();
        if (value instanceof Map) return Object.fromEntries(value.entries());
        if (value instanceof Set) return Array.from(value);
        if (typeof value === 'function') return `[Function ${(value as { name: string }).name || 'anonymous'}]`;
        return value;
    }

    private readMemory(): { usedJSHeapSize: number; totalJSHeapSize: number } | undefined {
        const memory = (performance as Performance & {
            memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
        }).memory;
        if (!memory) return undefined;
        return { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize };
    }

    private timestampSlug(): string {
        const d = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    }

    // ========================================
    // AI AGENT CONTEXT (METADATA-ONLY)
    //
    // 🔒 SAFETY BOUNDARY — CLASSIFICATION: METADATA-ONLY.
    // The App State Inspector renders the Explorer's runtime state — which can
    // include auth/session details, provider URLs, and user PII. We therefore
    // expose to the AI agent ONLY metadata ABOUT the state (its serialized size,
    // the number of top-level keys in the active section, and the section label)
    // — NEVER the state VALUES themselves. For the same reason, NO client tools
    // are registered here: there is no value-returning operation the agent may
    // invoke against this surface.
    // ========================================

    /**
     * Publish METADATA-ONLY context for the App State Inspector. Reports the
     * size of the active section's serialized JSON, its top-level key count, the
     * section label/ids, and the top-level KEY NAMES (structural identifiers like
     * "Email"/"Roles" — never their values). See SAFETY BOUNDARY above.
     */
    private publishAgentContext(): void {
        const context = buildAppStateInspectorAgentContext({
            StateSize: this.StateJson.length,
            KeyCount: this.activeSectionKeys().length,
            ActiveSection: this.ActiveSection,
            ActiveSectionLabel: this.SectionLabel,
            SectionIds: this.Sections.map(s => s.id),
            // 🔒 KEY NAMES only — never values.
            TopLevelKeys: this.activeSectionKeys(),
        });
        this.navigationService.SetAgentContext(this, context);
    }

    /**
     * Top-level KEY NAMES of the active section's data — METADATA ONLY, never
     * any value. For an array, returns the numeric indices as strings.
     */
    private activeSectionKeys(): string[] {
        const data = this.computeSectionData(this.ActiveSection);
        if (data && typeof data === 'object') {
            return Array.isArray(data)
                ? data.map((_, i) => String(i))
                : Object.keys(data as Record<string, unknown>);
        }
        return [];
    }
}
