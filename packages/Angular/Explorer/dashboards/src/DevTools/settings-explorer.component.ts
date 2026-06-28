import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import {
    UserInfoEngine,
    InstanceConfigEngine,
    MJUserSettingEntity,
    MJInstanceConfigurationEntity
} from '@memberjunction/core-entities';
import { DevToolsPrefs } from './dev-tools-prefs';
import { buildSettingsExplorerAgentContext } from './dev-tools-agent-context';

interface SettingRow {
    key: string;
    rawValue: string;
    parsedValue: unknown;
    valueType: 'string' | 'number' | 'boolean' | 'json' | 'empty';
    /** Pretty preview shown in the table cell. */
    preview: string;
    /** Optional secondary metadata shown next to the key. */
    meta?: string;
    updated?: Date | null;
}

type SettingsScope = 'user' | 'instance';

/**
 * Settings Explorer — read-only browser for both `MJ: User Settings` (the
 * current user's per-app key/value bag) and `MJ: Instance Configurations`
 * (instance-level feature flags). Auto-detects JSON values, formats them
 * nicely, supports search + copy.
 */
@RegisterClass(BaseResourceComponent, 'SettingsExplorerInspector')
@Component({
    standalone: false,
    selector: 'mj-settings-explorer',
    templateUrl: './settings-explorer.component.html',
    styleUrls: ['./inspector-shared.css', './settings-explorer.component.css']
})
export class SettingsExplorerComponent extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {

    public Scope: SettingsScope = 'user';
    public UserRows: SettingRow[] = [];
    public InstanceRows: SettingRow[] = [];
    public SearchQuery = '';
    public Selected: SettingRow | null = null;
    public LastRefreshed = new Date();

    public Counts = { user: 0, instance: 0 };

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    public ngOnInit(): void {
        const p = DevToolsPrefs.Get<{ scope?: SettingsScope; search?: string }>('settingsExplorer');
        if (p?.scope) this.Scope = p.scope;
        if (p?.search) this.SearchQuery = p.search;
        this.refresh();
        this.NotifyLoadComplete();
    }

    public ngAfterViewInit(): void {
        // Publish initial agent context. Re-emit happens in refresh(), OnScopeChange,
        // and PersistPrefs (search ngModelChange).
        // 🔒 METADATA-ONLY surface — NO client tools are registered (see SAFETY note below).
        this.publishAgentContext();
    }

    public override ngOnDestroy(): void {
        DevToolsPrefs.Save('settingsExplorer', { scope: this.Scope, search: this.SearchQuery });
        super.ngOnDestroy();
    }

    public PersistPrefs(): void {
        DevToolsPrefs.Save('settingsExplorer', { scope: this.Scope, search: this.SearchQuery });
        this.publishAgentContext();
    }

    public override async GetResourceDisplayName(): Promise<string> { return 'Settings Explorer'; }
    public override async GetResourceIconClass(): Promise<string> { return 'fa-solid fa-sliders'; }

    public refresh(): void {
        const userSettings = UserInfoEngine.Instance.UserSettings ?? [];
        this.UserRows = userSettings.map(s => this.toRow(s.Setting ?? '(no key)', s.Value ?? '', s.User ? `User: ${s.User}` : undefined, s.__mj_UpdatedAt));

        const instanceConfigs = InstanceConfigEngine.Instance.InstanceConfigs ?? [];
        this.InstanceRows = instanceConfigs.map(c => this.toRow(
            c.FeatureKey ?? '(no key)',
            c.Value ?? '',
            this.buildInstanceMeta(c),
            c.__mj_UpdatedAt
        ));

        this.Counts = { user: this.UserRows.length, instance: this.InstanceRows.length };

        // Sort each list by key
        this.UserRows.sort((a, b) => a.key.localeCompare(b.key));
        this.InstanceRows.sort((a, b) => a.key.localeCompare(b.key));

        // Re-resolve selection if it still exists
        if (this.Selected) {
            const list = this.Scope === 'user' ? this.UserRows : this.InstanceRows;
            this.Selected = list.find(r => r.key === this.Selected!.key) ?? null;
        }

        this.LastRefreshed = new Date();
        this.cdr.markForCheck();
        this.publishAgentContext();
    }

    public OnScopeChange(scope: SettingsScope): void {
        this.Scope = scope;
        this.Selected = null;
        this.PersistPrefs();
    }

    public get FilteredRows(): SettingRow[] {
        const list = this.Scope === 'user' ? this.UserRows : this.InstanceRows;
        const q = this.SearchQuery.trim().toLowerCase();
        if (!q) return list;
        return list.filter(r => r.key.toLowerCase().includes(q) || r.rawValue.toLowerCase().includes(q));
    }

    public OnRowClick(row: SettingRow): void {
        this.Selected = this.Selected?.key === row.key ? null : row;
    }

    public async OnCopySelected(): Promise<void> {
        if (!this.Selected) return;
        const text = this.Selected.valueType === 'json'
            ? JSON.stringify(this.Selected.parsedValue, null, 2)
            : this.Selected.rawValue;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // unavailable
        }
    }

    public get LastRefreshedLabel(): string {
        return this.LastRefreshed.toLocaleTimeString();
    }

    public get FormattedSelected(): string {
        if (!this.Selected) return '';
        if (this.Selected.valueType === 'json') {
            return JSON.stringify(this.Selected.parsedValue, null, 2);
        }
        return this.Selected.rawValue;
    }

    public TrackByKey = (_i: number, r: SettingRow) => r.key;

    // ---------- private ----------

    private buildInstanceMeta(c: MJInstanceConfigurationEntity): string | undefined {
        const parts: string[] = [];
        if (c.Category) parts.push(c.Category);
        if (c.DisplayName && c.DisplayName !== c.FeatureKey) parts.push(c.DisplayName);
        return parts.length ? parts.join(' · ') : undefined;
    }

    private toRow(key: string, rawValue: string, meta: string | undefined, updated: Date | string | null | undefined): SettingRow {
        const raw = rawValue ?? '';
        let valueType: SettingRow['valueType'] = 'string';
        let parsedValue: unknown = raw;
        let preview = raw;

        if (raw === '') {
            valueType = 'empty';
            preview = '(empty)';
        } else if (raw === 'true' || raw === 'false') {
            valueType = 'boolean';
            parsedValue = raw === 'true';
        } else if (/^-?\d+(\.\d+)?$/.test(raw) && raw.length < 20) {
            valueType = 'number';
            parsedValue = Number(raw);
        } else if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
            try {
                parsedValue = JSON.parse(raw);
                valueType = 'json';
                preview = this.summarizeJson(parsedValue);
            } catch {
                // not actually JSON — leave as string
            }
        }

        if (preview.length > 80) preview = preview.slice(0, 77) + '…';

        return {
            key,
            rawValue: raw,
            parsedValue,
            valueType,
            preview,
            meta,
            updated: updated ? (updated instanceof Date ? updated : new Date(updated)) : null
        };
    }

    private summarizeJson(value: unknown): string {
        if (Array.isArray(value)) return `[ ${value.length} item${value.length === 1 ? '' : 's'} ]`;
        if (value && typeof value === 'object') {
            const keys = Object.keys(value as Record<string, unknown>);
            if (keys.length === 0) return '{ }';
            return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''} }`;
        }
        return String(value);
    }

    // ========================================
    // AI AGENT CONTEXT (METADATA-ONLY)
    //
    // 🔒 SAFETY BOUNDARY — CLASSIFICATION: METADATA-ONLY.
    // The Settings Explorer browses MJ: User Settings and MJ: Instance
    // Configurations, whose VALUES can include credentials, API keys, and other
    // secrets. We therefore expose to the AI agent ONLY metadata: how many
    // settings exist (per scope) and the search QUERY the user typed — NEVER the
    // setting values. For the same reason, NO client tools are registered here:
    // there is no value-returning operation the agent may invoke against this
    // surface.
    // ========================================

    /**
     * Publish METADATA-ONLY context for the Settings Explorer. Reports setting
     * counts (current scope + per-scope) and the active search term — never any
     * setting value. See SAFETY BOUNDARY above.
     */
    private publishAgentContext(): void {
        const currentScopeCount = this.Scope === 'user' ? this.Counts.user : this.Counts.instance;
        const context = buildSettingsExplorerAgentContext({
            SettingCount: currentScopeCount,
            UserSettingCount: this.Counts.user,
            InstanceSettingCount: this.Counts.instance,
            Scope: this.Scope,
            SearchTerm: this.SearchQuery,
        });
        this.navigationService.SetAgentContext(this, context);
    }
}
