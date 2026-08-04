/**
 * @fileoverview Realtime management section — the whole realtime + bridge
 * surface (§11b of the Realtime Bridges architecture) in one place.
 *
 * Hosts an internal sub-tab rail across seven surfaces:
 *  1. Live Sessions   — active session bridges (Connecting/Connected) joined
 *                       with their session: agent, provider, turn mode,
 *                       participant count, started-at.
 *  2. Bridge Providers — the platform registry with a compact capability
 *                       summary derived from `SupportedFeaturesObject`.
 *  3. Agent Identities — which agents are reachable where (mailboxes, numbers).
 *  4. Channels         — the `MJ: AI Agent Channels` registry + which providers
 *                       contribute them.
 *  5. Co-Agents        — the `MJ: AI Agent Co Agents` pairing registry.
 *  6. Session History  — closed/terminal session bridges with close reason.
 *  7. Metrics          — client-side aggregates (by provider / status / agent;
 *                       bridges-over-time bucketed per day).
 *
 * Read-only for v1. Data loads once per `TimeRange` change via one batched
 * `RunViews` in {@link LoadRealtimeManagementDataset}; everything else is
 * in-memory aggregation. The selected sub-tab persists via `UserInfoEngine`
 * under `mj.realtimeDashboard.subTab`.
 */

import { Component, Input, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedService } from '@memberjunction/ng-shared';
import { UserInfoEngine } from '@memberjunction/core-entities';
import {
    RealtimeManagementDataset, LoadRealtimeManagementDataset,
    BridgeProviderRollup, SessionBridgeRollup, BridgeAgentIdentityRecord,
    AgentChannelRecord, BridgeProviderChannelRecord, AgentCoAgentRecord,
    SessionBridgeDayBucket, MetricSlice,
    BucketSessionBridgesByDay, SummarizeBridgesByProvider,
    SummarizeBridgesByStatus, SummarizeBridgesByAgent,
    BuildCapabilityChips, CapabilityChip, BridgeTypeIcon, IdentityTypeIcon,
    TransportTypeIcon, FormatBridgeDuration, FormatBridgeStart
} from './realtime-management-data';

/** The seven management sub-tabs. */
type RealtimeSubTab =
    | 'live-sessions' | 'providers' | 'identities'
    | 'channels' | 'co-agents' | 'history' | 'metrics';

interface SubTabDef {
    Key: RealtimeSubTab;
    Label: string;
    Icon: string;
}

/** Persisted preferences shape (UserInfoEngine: `mj.realtimeDashboard.*`). */
interface RealtimeManagementPrefs {
    subTab?: RealtimeSubTab;
}

const SUB_TAB_PREF_KEY = 'mj.realtimeDashboard.subTab';

@Component({
    standalone: false,
    selector: 'app-realtime-management',
    templateUrl: './realtime-management.component.html',
    styleUrls: ['./realtime-management.component.css']
})
export class RealtimeManagementComponent extends BaseAngularComponent implements OnInit {
    // ── Inputs ──

    private _timeRange = '7d';
    @Input()
    set TimeRange(value: string) {
        const prev = this._timeRange;
        this._timeRange = value;
        if (prev !== value && this.initialized) this.LoadData();
    }
    get TimeRange(): string { return this._timeRange; }

    // ── State ──

    private initialized = false;
    private cdr = inject(ChangeDetectorRef);
    private dataset: RealtimeManagementDataset | null = null;

    public IsLoading = false;
    public ActiveSubTab: RealtimeSubTab = 'live-sessions';

    public readonly SubTabs: SubTabDef[] = [
        { Key: 'live-sessions', Label: 'Live Sessions', Icon: 'fa-solid fa-tower-broadcast' },
        { Key: 'providers', Label: 'Bridge Providers', Icon: 'fa-solid fa-network-wired' },
        { Key: 'identities', Label: 'Agent Identities', Icon: 'fa-solid fa-id-badge' },
        { Key: 'channels', Label: 'Channels', Icon: 'fa-solid fa-satellite-dish' },
        { Key: 'co-agents', Label: 'Co-Agents', Icon: 'fa-solid fa-people-arrows' },
        { Key: 'history', Label: 'Session History', Icon: 'fa-solid fa-clock-rotate-left' },
        { Key: 'metrics', Label: 'Metrics', Icon: 'fa-solid fa-chart-column' }
    ];

    // ── View models (rebuilt on load) ──

    public LiveBridges: SessionBridgeRollup[] = [];
    public HistoryBridges: SessionBridgeRollup[] = [];
    public Providers: BridgeProviderRollup[] = [];
    public Identities: BridgeAgentIdentityRecord[] = [];
    public Channels: AgentChannelRecord[] = [];
    public ProviderChannels: BridgeProviderChannelRecord[] = [];
    public CoAgents: AgentCoAgentRecord[] = [];

    // Metrics
    public DayBuckets: SessionBridgeDayBucket[] = [];
    public ByProvider: MetricSlice[] = [];
    public ByStatus: MetricSlice[] = [];
    public ByAgent: MetricSlice[] = [];

    // ── Provider capability summary cache (chips + remainder) ──
    private capabilityChips = new Map<string, CapabilityChip[]>();

    // ── Lifecycle ──

    async ngOnInit(): Promise<void> {
        this.loadPrefs();
        this.initialized = true;
        await this.LoadData();
    }

    // ── Sub-tab navigation ──

    public SelectSubTab(key: RealtimeSubTab): void {
        if (key === this.ActiveSubTab) return;
        this.ActiveSubTab = key;
        this.savePrefs();
        this.cdr.detectChanges();
    }

    // ── Data loading ──

    /** Reloads the whole management surface for the current time range. */
    public async LoadData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();
        try {
            this.dataset = await LoadRealtimeManagementDataset(this.ProviderToUse, this.TimeRange);
            this.applyDataset(this.dataset);
        } catch (e) {
            console.error('Realtime management load error:', e);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    private applyDataset(ds: RealtimeManagementDataset): void {
        this.LiveBridges = ds.LiveBridges;
        this.HistoryBridges = ds.HistoryBridges;
        this.Providers = ds.Providers;
        this.Identities = ds.Identities;
        this.Channels = ds.Channels;
        this.ProviderChannels = ds.ProviderChannels;
        this.CoAgents = ds.CoAgents;

        this.capabilityChips.clear();
        for (const p of ds.Providers) {
            this.capabilityChips.set(p.Record.ID, BuildCapabilityChips(p.Features));
        }

        this.DayBuckets = BucketSessionBridgesByDay(ds.AllBridges, ds.WindowStart, new Date());
        this.ByProvider = SummarizeBridgesByProvider(ds.AllBridges);
        this.ByStatus = SummarizeBridgesByStatus(ds.AllBridges);
        this.ByAgent = SummarizeBridgesByAgent(ds.AllBridges);
    }

    // ── Drill-in ──

    /** Opens the AIAgentSession record behind a bridge via the shared record-open path. */
    public OpenSession(sessionId: string): void {
        const key = new CompositeKey();
        key.LoadFromSingleKeyValuePair('ID', sessionId);
        SharedService.Instance.OpenEntityRecord('MJ: AI Agent Sessions', key);
    }

    /** Opens a bridge provider record. */
    public OpenProvider(providerId: string): void {
        const key = new CompositeKey();
        key.LoadFromSingleKeyValuePair('ID', providerId);
        SharedService.Instance.OpenEntityRecord('MJ: AI Bridge Providers', key);
    }

    // ── Capability summary accessors (template helpers) ──

    /** First N capability chips for a provider (kept compact in the grid). */
    public CapabilityChipsFor(providerId: string, limit = 4): CapabilityChip[] {
        return (this.capabilityChips.get(providerId) ?? []).slice(0, limit);
    }

    /** Count of capability chips beyond the displayed `limit` (for a "+N" pill). */
    public CapabilityOverflowFor(providerId: string, limit = 4): number {
        const total = this.capabilityChips.get(providerId)?.length ?? 0;
        return Math.max(0, total - limit);
    }

    // ── Channel surface helpers ──

    /** Providers contributing a given channel (for the Channels grid). */
    public ProvidersForChannel(channelId: string): BridgeProviderChannelRecord[] {
        const target = channelId.toLowerCase();
        return this.ProviderChannels.filter(pc => pc.ChannelID.toLowerCase() === target);
    }

    // ── Co-agent helpers ──

    /** Human-readable pairing target — a specific agent or a whole agent type. */
    public CoAgentTargetLabel(row: AgentCoAgentRecord): string {
        if (row.TargetAgent) return row.TargetAgent;
        if (row.TargetAgentType) return `Type: ${row.TargetAgentType}`;
        return '—';
    }

    // ── Metric rendering helpers ──

    /** Max count across day buckets (for bar height scaling); min 1 to avoid /0. */
    public get MaxDayCount(): number {
        return Math.max(1, ...this.DayBuckets.map(b => b.Count));
    }

    /** Bar height percentage for a day bucket. */
    public DayBarHeight(count: number): number {
        return Math.round((count / this.MaxDayCount) * 100);
    }

    /** Max slice count (for horizontal bar scaling); min 1. */
    public maxSlice(slices: MetricSlice[]): number {
        return Math.max(1, ...slices.map(s => s.Count));
    }

    /** Bar width percentage for a metric slice. */
    public SliceBarWidth(slices: MetricSlice[], count: number): number {
        return Math.round((count / this.maxSlice(slices)) * 100);
    }

    // ── Summary getters ──

    public get LiveCount(): number { return this.LiveBridges.length; }
    public get HistoryCount(): number { return this.HistoryBridges.length; }
    public get ActiveProviderCount(): number {
        return this.Providers.filter(p => p.Record.Status === 'Active').length;
    }
    public get ActiveIdentityCount(): number {
        return this.Identities.filter(i => i.IsActive).length;
    }
    public get ActiveCoAgentCount(): number {
        return this.CoAgents.filter(c => c.Status === 'Active').length;
    }

    // ── Pure presentation helpers (delegated to the data module) ──

    public BridgeTypeIcon = BridgeTypeIcon;
    public IdentityTypeIcon = IdentityTypeIcon;
    public TransportTypeIcon = TransportTypeIcon;
    public FormatBridgeDuration = FormatBridgeDuration;
    public FormatBridgeStart = FormatBridgeStart;

    /** CSS class for a bridge status pill. */
    public BridgeStatusClass(status: string): string {
        switch (status) {
            case 'Connected': return 'status-pill status-connected';
            case 'Connecting':
            case 'Pending':
            case 'Scheduled': return 'status-pill status-pending';
            case 'Disconnecting': return 'status-pill status-pending';
            case 'Failed': return 'status-pill status-failed';
            default: return 'status-pill status-closed';
        }
    }

    /** CSS class for a session-bridge close-reason pill. */
    public CloseReasonClass(reason: string | null): string {
        switch (reason) {
            case 'Error': return 'reason-pill reason-error';
            case 'Janitor': return 'reason-pill reason-janitor';
            case 'HostEnded': return 'reason-pill reason-hostended';
            case 'Shutdown': return 'reason-pill reason-shutdown';
            case 'Explicit': return 'reason-pill reason-explicit';
            default: return 'reason-pill reason-unknown';
        }
    }

    // ── Preferences ──

    private loadPrefs(): void {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(SUB_TAB_PREF_KEY);
            if (raw) {
                const prefs = JSON.parse(raw) as RealtimeManagementPrefs;
                if (prefs.subTab && this.SubTabs.some(t => t.Key === prefs.subTab)) {
                    this.ActiveSubTab = prefs.subTab;
                }
            }
        } catch {
            // Use defaults on parse failure.
        }
    }

    private savePrefs(): void {
        const prefs: RealtimeManagementPrefs = { subTab: this.ActiveSubTab };
        UserInfoEngine.Instance.SetSettingDebounced(SUB_TAB_PREF_KEY, JSON.stringify(prefs));
    }
}

export function LoadRealtimeManagement() { /* tree-shaking prevention */ }
