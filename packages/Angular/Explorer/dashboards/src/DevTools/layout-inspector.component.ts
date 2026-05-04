import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { WorkspaceStateManager, GoldenLayoutManager } from '@memberjunction/ng-base-application';
import { DevToolsPrefs } from './dev-tools-prefs';

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
export class LayoutInspectorComponent extends BaseResourceComponent implements OnInit, OnDestroy {

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

    public override ngOnDestroy(): void {
        DevToolsPrefs.Save('layoutInspector', { activeSection: this.ActiveSection });
        super.ngOnDestroy();
    }

    public override async GetResourceDisplayName(): Promise<string> { return 'Layout Inspector'; }
    public override async GetResourceIconClass(): Promise<string> { return 'fa-solid fa-table-columns'; }

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
}
