import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass, MJGlobal } from '@memberjunction/global';
import { DevToolsPrefs } from './dev-tools-prefs';

/** Local mirror of MJGlobal's ClassRegistration shape (avoids importing the type). */
interface ClassRegistration {
    BaseClass: { name?: string };
    SubClass: { name?: string };
    Key: string | null;
    Priority: number;
}

interface RegistrationGroup {
    baseClassName: string;
    count: number;
    registrations: ClassRegistration[];
    expanded: boolean;
    /** Number of distinct keys (some keys can have multiple registrations at different priorities). */
    uniqueKeys: number;
    /** True when at least one key in this group has multiple registrations (priority resolution applies). */
    hasOverrides: boolean;
}

/**
 * Class Registry Browser — read-only inspector of every `@RegisterClass`
 * registration tracked by `MJGlobal.Instance.ClassFactory`. Groups by base
 * class, surfaces priority/override conflicts, supports search + copy.
 */
@RegisterClass(BaseResourceComponent, 'ClassRegistryInspector')
@Component({
    standalone: false,
    selector: 'mj-class-registry-inspector',
    templateUrl: './class-registry.component.html',
    styleUrls: ['./inspector-shared.css', './class-registry.component.css']
})
export class ClassRegistryInspectorComponent extends BaseResourceComponent implements OnInit, OnDestroy {

    public Groups: RegistrationGroup[] = [];
    public Stats = { total: 0, baseClasses: 0, withOverrides: 0 };
    public SearchQuery = '';
    public CopyConfirmed = false;
    public LastRefreshed = new Date();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    public ngOnInit(): void {
        const prefs = DevToolsPrefs.Get<{ search?: string; expanded?: string[] }>('classRegistry');
        if (prefs?.search) this.SearchQuery = prefs.search;
        this.refresh();
        // Restore expansion after groups are built
        if (prefs?.expanded) {
            for (const g of this.Groups) {
                g.expanded = prefs.expanded.includes(g.baseClassName);
            }
        }
        this.NotifyLoadComplete();
    }

    public override ngOnDestroy(): void {
        this.savePrefs();
        super.ngOnDestroy();
    }

    public PersistPrefs(): void {
        this.savePrefs();
    }

    private savePrefs(): void {
        DevToolsPrefs.Save('classRegistry', {
            search: this.SearchQuery,
            expanded: this.Groups.filter(g => g.expanded).map(g => g.baseClassName)
        });
    }

    public override async GetResourceDisplayName(): Promise<string> { return 'Class Registry'; }
    public override async GetResourceIconClass(): Promise<string> { return 'fa-solid fa-cubes'; }

    public refresh(): void {
        const factory = MJGlobal.Instance.ClassFactory as unknown as { _registrations: ClassRegistration[] };
        const all = factory._registrations ?? [];

        // Group by base class name
        const byBase = new Map<string, ClassRegistration[]>();
        for (const reg of all) {
            const baseName = reg.BaseClass?.name ?? '(unknown)';
            const arr = byBase.get(baseName) ?? [];
            arr.push(reg);
            byBase.set(baseName, arr);
        }

        // Build groups
        const groups: RegistrationGroup[] = [];
        for (const [baseClassName, registrations] of byBase) {
            const keyCounts = new Map<string, number>();
            for (const r of registrations) {
                const k = r.Key ?? '';
                keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
            }
            let hasOverrides = false;
            for (const c of keyCounts.values()) {
                if (c > 1) { hasOverrides = true; break; }
            }
            groups.push({
                baseClassName,
                count: registrations.length,
                registrations: registrations.sort((a, b) => {
                    const ak = a.Key ?? '';
                    const bk = b.Key ?? '';
                    if (ak !== bk) return ak.localeCompare(bk);
                    return b.Priority - a.Priority;
                }),
                expanded: false,
                uniqueKeys: keyCounts.size,
                hasOverrides
            });
        }

        this.Groups = groups.sort((a, b) => b.count - a.count);

        this.Stats = {
            total: all.length,
            baseClasses: byBase.size,
            withOverrides: groups.filter(g => g.hasOverrides).length
        };

        this.LastRefreshed = new Date();
        this.cdr.markForCheck();
    }

    public ToggleGroup(group: RegistrationGroup): void {
        group.expanded = !group.expanded;
        this.savePrefs();
    }

    public ExpandAll(): void {
        for (const g of this.FilteredGroups) g.expanded = true;
        this.savePrefs();
    }

    public CollapseAll(): void {
        for (const g of this.Groups) g.expanded = false;
        this.savePrefs();
    }

    public OnSearchChange(value: string): void {
        this.SearchQuery = value;
        this.savePrefs();
    }

    public get FilteredGroups(): RegistrationGroup[] {
        const q = this.SearchQuery.trim().toLowerCase();
        if (!q) return this.Groups;
        return this.Groups
            .map(g => ({
                ...g,
                expanded: true,
                registrations: g.registrations.filter(r => {
                    const sub = r.SubClass?.name?.toLowerCase() ?? '';
                    const key = r.Key?.toLowerCase() ?? '';
                    return g.baseClassName.toLowerCase().includes(q) || sub.includes(q) || key.includes(q);
                })
            }))
            .filter(g => g.registrations.length > 0);
    }

    public IsConflictRow(group: RegistrationGroup, reg: ClassRegistration): boolean {
        if (!group.hasOverrides) return false;
        const sameKey = group.registrations.filter(r => (r.Key ?? '') === (reg.Key ?? ''));
        return sameKey.length > 1;
    }

    public IsWinningRow(group: RegistrationGroup, reg: ClassRegistration): boolean {
        const sameKey = group.registrations.filter(r => (r.Key ?? '') === (reg.Key ?? ''));
        if (sameKey.length === 1) return false;
        const max = Math.max(...sameKey.map(r => r.Priority));
        // If multiple share max priority, the LAST registered wins (matches ClassFactory behavior).
        const top = sameKey.filter(r => r.Priority === max);
        return top[top.length - 1] === reg;
    }

    public async OnCopy(): Promise<void> {
        const payload = {
            stats: this.Stats,
            groups: this.FilteredGroups.map(g => ({
                baseClass: g.baseClassName,
                count: g.count,
                registrations: g.registrations.map(r => ({
                    key: r.Key,
                    subClass: r.SubClass?.name ?? '(anonymous)',
                    priority: r.Priority
                }))
            }))
        };
        try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            this.CopyConfirmed = true;
            this.cdr.markForCheck();
            setTimeout(() => { this.CopyConfirmed = false; this.cdr.markForCheck(); }, 1800);
        } catch {
            // clipboard unavailable
        }
    }

    public get LastRefreshedLabel(): string {
        return this.LastRefreshed.toLocaleTimeString();
    }

    public TrackByBase = (_i: number, g: RegistrationGroup) => g.baseClassName;
    public TrackByReg = (_i: number, r: ClassRegistration) => `${r.SubClass?.name ?? ''}|${r.Key ?? ''}|${r.Priority}`;
}
