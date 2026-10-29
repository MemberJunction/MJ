import { Directive, Input, Type } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJGlobal } from '@memberjunction/global';
import type { AgentContextRecord } from './chief-of-staff-agent-context';

/**
 * Extension point for the Chief of Staff cockpit.
 *
 * The core cockpit shows only what core entities hold: governance, wake routines and the
 * approvals queue. An Open App adds its own data (for example priorities and to-dos from a
 * task app) by registering a panel:
 *
 * ```typescript
 * @RegisterClassEx(BaseChiefOfStaffPanel, {
 *     key: 'my-app:priorities',
 *     skipNullKeyWarning: true,
 *     metadata: { placement: 'tab', panelKey: 'priorities', label: 'Priorities & OKRs', icon: 'fa-solid fa-bullseye', sortKey: 10 },
 * })
 * @Component({ standalone: false, selector: 'my-app-cos-priorities', templateUrl: '...' })
 * export class MyPrioritiesPanel extends BaseChiefOfStaffPanel {
 *     protected async LoadPanelData(): Promise<void> { ... }
 * }
 * ```
 *
 * A `tab` panel gets its own cockpit tab; an `overview` panel renders in the Overview tab's
 * extension column. The cockpit mounts every registered panel, passes it a
 * {@link ChiefOfStaffPanelContext}, and bumps `RefreshToken` whenever it reloads.
 */

/** Where a panel renders in the cockpit. */
export type ChiefOfStaffPanelPlacement = 'tab' | 'overview';

/** The metadata every `BaseChiefOfStaffPanel` registration attaches via `RegisterClassEx`. */
export interface ChiefOfStaffPanelRegistrationMetadata {
    placement: ChiefOfStaffPanelPlacement;
    /** Unique key; for a tab panel it is also the tab key used in the URL (`?tab=`). */
    panelKey: string;
    label: string;
    /** Font Awesome class. */
    icon?: string;
    /** Lower sorts first; core tabs come before extension tabs. Default 100. */
    sortKey?: number;
    /** Entity names whose saves and remote invalidations should reload the cockpit. */
    liveEntities?: string[];
}

/** A registered panel, ready to mount. */
export interface ChiefOfStaffPanelRegistration {
    Metadata: ChiefOfStaffPanelRegistrationMetadata;
    Component: Type<BaseChiefOfStaffPanel>;
}

/** What the cockpit hands every panel. */
export interface ChiefOfStaffPanelContext {
    /** Increments each time the cockpit reloads; a panel reloads when it changes. */
    RefreshToken: number;
    /** The cockpit's search text, for panels that filter their lists. */
    SearchText: string;
    /** The resolved Chief of Staff agent's ID. */
    AgentID: string | null;
    /** Report fields for the agent context; replaces this panel's previous report. */
    ReportAgentContext: (panelKey: string, fields: AgentContextRecord) => void;
    /** Show the cockpit's feedback banner. */
    ShowBanner: (type: 'success' | 'error', message: string) => void;
}

@Directive()
export abstract class BaseChiefOfStaffPanel extends BaseAngularComponent {
    private _context: ChiefOfStaffPanelContext | null = null;
    private lastRefreshToken: number | null = null;

    /** The metadata the panel was registered with. */
    @Input() Registration: ChiefOfStaffPanelRegistrationMetadata | null = null;

    @Input()
    set Context(value: ChiefOfStaffPanelContext | null) {
        const previous = this._context;
        this._context = value;
        if (!value) {
            return;
        }
        if (value.RefreshToken !== this.lastRefreshToken) {
            this.lastRefreshToken = value.RefreshToken;
            void this.LoadPanelData();
        }
        if (previous && previous.SearchText !== value.SearchText) {
            this.OnSearchTextChanged(value.SearchText);
        }
    }
    get Context(): ChiefOfStaffPanelContext | null {
        return this._context;
    }

    /** Load (or reload) the panel's data. Called on mount and whenever the cockpit reloads. */
    protected abstract LoadPanelData(): Promise<void>;

    /** Called when the cockpit's search text changes; override to filter. */
    protected OnSearchTextChanged(_searchText: string): void {
        // default: no filtering
    }

    /** Report this panel's agent-context fields under its registration key. */
    protected ReportAgentContext(fields: AgentContextRecord): void {
        if (this._context && this.Registration) {
            this._context.ReportAgentContext(this.Registration.panelKey, fields);
        }
    }
}

/**
 * Every registered cockpit panel, sorted by `sortKey` then label. Registrations without valid
 * metadata are ignored. When two registrations share a `panelKey`, the higher-priority one wins
 * (the later-loaded registration, per ClassFactory's auto-priority).
 */
export function CollectChiefOfStaffPanels(): ChiefOfStaffPanelRegistration[] {
    const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrationsByMetadata(
        BaseChiefOfStaffPanel,
        (metadata) => IsChiefOfStaffPanelMetadata(metadata),
    );
    const byKey = new Map<string, { metadata: ChiefOfStaffPanelRegistrationMetadata; component: Type<BaseChiefOfStaffPanel>; priority: number }>();
    for (const registration of registrations) {
        const metadata = registration.Metadata as unknown as ChiefOfStaffPanelRegistrationMetadata;
        const existing = byKey.get(metadata.panelKey);
        if (!existing || registration.Priority >= existing.priority) {
            byKey.set(metadata.panelKey, {
                metadata,
                component: registration.SubClass as Type<BaseChiefOfStaffPanel>,
                priority: registration.Priority,
            });
        }
    }
    return [...byKey.values()]
        .map((r) => ({ Metadata: r.metadata, Component: r.component }))
        .sort((a, b) => (a.Metadata.sortKey ?? 100) - (b.Metadata.sortKey ?? 100) || a.Metadata.label.localeCompare(b.Metadata.label));
}

/** True when a registration's metadata has the shape a cockpit panel needs. */
export function IsChiefOfStaffPanelMetadata(metadata: Record<string, unknown> | undefined): boolean {
    if (!metadata) {
        return false;
    }
    const placement = metadata['placement'];
    return (placement === 'tab' || placement === 'overview')
        && typeof metadata['panelKey'] === 'string' && (metadata['panelKey'] as string).trim().length > 0
        && typeof metadata['label'] === 'string';
}
