import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { TabConfig } from '@memberjunction/ng-ui-components';
import { WorkspaceStateManager, GoldenLayoutManager } from '@memberjunction/ng-base-application';
import { DevToolsPrefs } from './dev-tools-prefs';
import { buildLayoutInspectorAgentContext } from './dev-tools-agent-context';
import { AgentToolResult, validateEnumParam } from '../shared/agent-tool-validation';

interface LayoutSection {
    id: 'workspace' | 'golden';
    label: string;
    icon: string;
    description: string;
}

/**
 * Layout Inspector — read-only view of the current workspace + Golden Layout
 * configuration. Replaces the legacy "Log Layout (Debug)" user-menu item that
 * only printed to console.
 */
@RegisterClass(BaseResourceComponent, 'LayoutInspector')
@Component({
    standalone: false,
    selector: 'mj-layout-inspector',
    templateUrl: './layout-inspector.component.html',
    styleUrls: ['./inspector-shared.css']
})
export class LayoutInspectorComponent extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {

    public Sections: LayoutSection[] = [
        { id: 'workspace', label: 'Workspace State',  icon: 'fa-solid fa-table-columns',  description: 'Tabs, active tab, app state' },
        { id: 'golden',    label: 'Golden Layout',    icon: 'fa-solid fa-window-restore', description: 'Active layout JSON config' }
    ];

    public ActiveSection: 'workspace' | 'golden' = 'workspace';
    public LayoutJson = '{}';
    public CopyConfirmed = false;
    public LastRefreshed = new Date();

    constructor(
        private cdr: ChangeDetectorRef,
        private workspace: WorkspaceStateManager,
        private layout: GoldenLayoutManager
    ) {
        super();
    }

    public ngOnInit(): void {
        const p = DevToolsPrefs.Get<{ activeSection?: 'workspace' | 'golden' }>('layoutInspector');
        if (p?.activeSection) this.ActiveSection = p.activeSection;
        this.refresh();
        this.NotifyLoadComplete();
    }

    public ngAfterViewInit(): void {
        // Publish initial agent context + register the read-only client tools.
        // Re-emit happens on every section change (OnSectionClick → refresh).
        this.publishAgentContext();
        this.registerAgentClientTools();
    }

    public override ngOnDestroy(): void {
        DevToolsPrefs.Save('layoutInspector', { activeSection: this.ActiveSection });
        super.ngOnDestroy();
    }

    public override async GetResourceDisplayName(): Promise<string> { return 'Layout Inspector'; }
    public override async GetResourceIconClass(): Promise<string> { return 'fa-solid fa-table-columns'; }

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

    public OnSectionClick(section: LayoutSection): void {
        if (this.ActiveSection === section.id) return;
        this.ActiveSection = section.id;
        DevToolsPrefs.Save('layoutInspector', { activeSection: this.ActiveSection });
        this.refresh();
    }

    public refresh(): void {
        this.LayoutJson = JSON.stringify(this.computeData(), this.jsonReplacer, 2);
        this.LastRefreshed = new Date();
        this.cdr.markForCheck();
        this.publishAgentContext();
    }

    public async OnCopy(): Promise<void> {
        try {
            await navigator.clipboard.writeText(this.LayoutJson);
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
        const blob = new Blob([this.LayoutJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `mj-layout-${this.ActiveSection}-${stamp}.json`;
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

    private computeData(): unknown {
        if (this.ActiveSection === 'workspace') {
            return this.workspace.GetConfiguration();
        }
        // Golden Layout: GoldenLayoutManager exposes its raw config when active
        const layoutAny = this.layout as unknown as { GetCurrentLayoutConfig?: () => unknown; CurrentConfig?: unknown };
        if (typeof layoutAny.GetCurrentLayoutConfig === 'function') {
            return layoutAny.GetCurrentLayoutConfig();
        }
        if (layoutAny.CurrentConfig !== undefined) {
            return layoutAny.CurrentConfig;
        }
        return { note: 'Golden Layout config is not currently exposed by GoldenLayoutManager.' };
    }

    private jsonReplacer(_key: string, value: unknown): unknown {
        if (value instanceof Date) return value.toISOString();
        if (value instanceof Map) return Object.fromEntries(value.entries());
        if (value instanceof Set) return Array.from(value);
        if (typeof value === 'function') return `[Function ${(value as { name: string }).name || 'anonymous'}]`;
        return value;
    }

    // ========================================
    // AI AGENT CONTEXT & CLIENT TOOLS
    //
    // 🔒 SAFETY BOUNDARY — CLASSIFICATION: SAFE developer diagnostic.
    // The Layout Inspector is a read-only view of the workspace + Golden Layout
    // configuration. Context reports which section is selected and how many
    // sections exist; tools only refresh the snapshot and switch the inspected
    // section. No application data is read or mutated.
    // ========================================

    /** Publish the current Layout Inspector selection to the AI agent. */
    private publishAgentContext(): void {
        const context = buildLayoutInspectorAgentContext({
            SelectedSection: this.ActiveSection,
            SelectedSectionLabel: this.SectionLabel,
            SectionCount: this.Sections.length,
        });
        this.navigationService.SetAgentContext(this, context);
    }

    /**
     * Register the read-only client tools the AI agent can invoke against the
     * Layout Inspector: RefreshLayoutSnapshot, InspectElement (switch section).
     */
    private registerAgentClientTools(): void {
        const sectionIds = this.Sections.map(s => s.id);
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'RefreshLayoutSnapshot',
                Description: 'Re-read the current workspace / Golden Layout configuration snapshot.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.refresh();
                    return { Success: true };
                },
            },
            {
                Name: 'InspectElement',
                Description: 'Switch the inspected layout section. One of: ' + sectionIds.join(', ') + '.',
                ParameterSchema: {
                    type: 'object',
                    properties: { section: { type: 'string', enum: sectionIds } },
                    required: ['section'],
                },
                Handler: async (params: Record<string, unknown>) => this.toolInspectElement(params),
            },
        ]);
    }

    /** Switch the inspected section (the inspector's "elements") by id. */
    private toolInspectElement(params: Record<string, unknown>): AgentToolResult {
        const validated = validateEnumParam<'workspace' | 'golden'>(
            params['section'],
            ['workspace', 'golden'],
            'section',
        );
        if (!validated.ok) {
            return validated.result;
        }
        const section = this.Sections.find(s => s.id === validated.value);
        if (!section) {
            return { Success: false, ErrorMessage: `Section "${validated.value}" is not available.` };
        }
        this.OnSectionClick(section);
        return { Success: true };
    }
}
