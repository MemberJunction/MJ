import { Component, ChangeDetectorRef } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseConfigPanel } from './base-config-panel';
import { PanelConfig } from '../models/dashboard-types';
import { COMPONENT_NAME_KEY, COMPONENT_NAMESPACE_KEY, COMPONENT_VERSION_KEY } from '../models/dashboard-part-interfaces';

/** One registered component version, as the picker lists it. */
export interface ComponentPickerItem {
    Name: string;
    Namespace: string | null;
    Version: string;
    Title: string | null;
}

/** The most components the picker lists for one search. */
const MAX_LISTED = 200;

/**
 * Configuration panel for Interactive Component parts: pick a registered component (`MJ: Components`)
 * by name, and optionally pin a version (otherwise the part shows the highest version).
 * Loads only the light columns, never the large Specification.
 */
@RegisterClass(BaseConfigPanel, 'ComponentPanelConfigDialog')
@Component({
    standalone: false,
    selector: 'mj-component-config-panel',
    templateUrl: './component-config-panel.component.html',
    styleUrls: ['./config-panel.component.css']
})
export class ComponentConfigPanelComponent extends BaseConfigPanel {
    public Title = '';
    public ComponentName = '';
    public ComponentNamespace: string | null = null;
    /** A pinned version, or '' for the highest. */
    public ComponentVersion = '';
    public SearchText = '';
    public Components: ComponentPickerItem[] = [];
    public IsLoadingList = false;
    public ComponentError = '';

    private loaded = false;

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    /** The distinct components matching the search, one entry per namespace and name. */
    public get Matches(): ComponentPickerItem[] {
        const text = this.SearchText.trim().toLowerCase();
        const seen = new Set<string>();
        return this.Components.filter(c => {
            const key = `${c.Namespace ?? ''}/${c.Name}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return !text || [c.Name, c.Title ?? '', c.Namespace ?? ''].some(v => v.toLowerCase().includes(text));
        }).slice(0, MAX_LISTED);
    }

    /** The versions of the chosen component, highest first. */
    public get Versions(): string[] {
        return this.Components.filter(c => c.Name === this.ComponentName && (c.Namespace ?? null) === this.ComponentNamespace).map(c => c.Version);
    }

    public initFromConfig(config: PanelConfig | null): void {
        const own = config?.type === 'Component' ? config : null;
        this.ComponentName = (own?.[COMPONENT_NAME_KEY] as string) || '';
        this.ComponentNamespace = (own?.[COMPONENT_NAMESPACE_KEY] as string) || null;
        this.ComponentVersion = (own?.[COMPONENT_VERSION_KEY] as string) || '';
        this.Title = this.panel?.title || '';
        this.ComponentError = '';
        void this.loadComponents();
        this.cdr.detectChanges();
    }

    public buildConfig(): PanelConfig {
        return {
            type: 'Component',
            [COMPONENT_NAME_KEY]: this.ComponentName || undefined,
            [COMPONENT_NAMESPACE_KEY]: this.ComponentNamespace || undefined,
            [COMPONENT_VERSION_KEY]: this.ComponentVersion || undefined,
        };
    }

    public override validate(): { valid: boolean; errors: string[] } {
        this.ComponentError = this.ComponentName ? '' : 'Please select a component';
        return { valid: !this.ComponentError, errors: this.ComponentError ? [this.ComponentError] : [] };
    }

    public getDefaultTitle(): string {
        const chosen = this.Components.find(c => c.Name === this.ComponentName && (c.Namespace ?? null) === this.ComponentNamespace);
        return chosen?.Title || this.ComponentName || 'Component';
    }

    public getTitle(): string {
        return this.Title || this.getDefaultTitle();
    }

    /** True when the item is the chosen component. */
    public IsChosen(item: ComponentPickerItem): boolean {
        return item.Name === this.ComponentName && (item.Namespace ?? null) === this.ComponentNamespace;
    }

    /** Chooses a component; its version goes back to the highest. */
    public Choose(item: ComponentPickerItem): void {
        this.ComponentName = item.Name;
        this.ComponentNamespace = item.Namespace ?? null;
        this.ComponentVersion = '';
        this.ComponentError = '';
        this.emitConfigChanged();
    }

    public OnVersionChange(): void {
        this.emitConfigChanged();
    }

    /** Loads the light list of components once. */
    private async loadComponents(): Promise<void> {
        if (this.loaded) return;
        this.loaded = true;
        this.IsLoadingList = true;
        const p = this.ProviderToUse;
        const result = await RunView.FromMetadataProvider(p).RunView<ComponentPickerItem>({
            EntityName: 'MJ: Components',
            Fields: ['ID', 'Name', 'Namespace', 'Version', 'Title'],
            OrderBy: 'Namespace, Name, VersionSequence DESC',
            ResultType: 'simple',
        }, p.CurrentUser);
        this.Components = result.Success ? result.Results : [];
        this.ComponentError = result.Success ? this.ComponentError : (result.ErrorMessage || 'Components could not be loaded');
        this.IsLoadingList = false;
        this.cdr.detectChanges();
    }
}
