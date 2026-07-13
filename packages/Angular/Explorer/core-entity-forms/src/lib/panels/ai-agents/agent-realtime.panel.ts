import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { RegisterClassEx, UUIDsEqual } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJAIAgentEntity } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';

/** Read-only co-agent pairing row for the summary list. */
interface CoAgentPairingRow {
    ID: string;
    CoAgentID: string;
    CoAgent: string | null;
    TargetAgentID: string | null;
    TargetAgent: string | null;
    Type: string;
    IsDefault: boolean;
    Sequence: number;
    Status: string;
    /** 'as-coagent' = this agent IS the co-agent; 'as-target' = this agent is the voiced target. */
    role: 'as-coagent' | 'as-target';
}

/** Read-only bridge identity row for the summary list. */
interface BridgeIdentityRow {
    ID: string;
    IdentityType: string;
    IdentityValue: string;
    DisplayName: string | null;
    Provider: string;
    IsActive: boolean;
}

/**
 * AI Agent "Realtime" panel (Pattern 1 — BaseFormPanel slot). A read-only
 * summary that puts an agent's realtime / bridge setup in one place:
 *   - its co-agent pairings (rows where this agent is the co-agent OR the
 *     voiced target, from 'MJ: AI Agent Co Agents'),
 *   - its `TypeConfiguration` (the agent's typed realtime config layer),
 *   - its bridge agent identities ('MJ: AI Bridge Agent Identities' for this
 *     agent).
 *
 * Registers against the 'AI Agents' entity, `after-fields` slot. The AI Agent
 * form is a full custom override whose template doesn't emit the `after-fields`
 * marker, so this panel falls through to the container's always-present
 * `after-everything` slot and mounts at the bottom of the form — functional,
 * just lower than ideal until the custom form emits the slot marker.
 *
 * Provider-correct: all RunViews are scoped to the host form's `ProviderToUse`.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'ai-agents:realtime',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'AI Agents',
        slot: 'after-fields',
        sortKey: 40,
    },
})
@Component({
    standalone: false,
    selector: 'mj-ai-agent-realtime-panel',
    templateUrl: './agent-realtime.panel.html',
    styleUrls: ['./agent-realtime.panel.css'],
})
export class AgentRealtimePanel extends BaseFormPanel<MJAIAgentEntity> implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    public Loading = false;
    public LoadError: string | null = null;
    public Pairings: CoAgentPairingRow[] = [];
    public Identities: BridgeIdentityRow[] = [];

    private prettyTypeConfigCache: string | null | undefined = undefined;

    async ngOnInit(): Promise<void> {
        await this.loadData();
    }

    /** Pretty-printed TypeConfiguration JSON (cached, falls back to raw on parse error). */
    public get PrettyTypeConfiguration(): string | null {
        if (this.prettyTypeConfigCache !== undefined) return this.prettyTypeConfigCache;
        const raw = this.Record?.TypeConfiguration ?? null;
        if (!raw) {
            this.prettyTypeConfigCache = null;
            return null;
        }
        try {
            this.prettyTypeConfigCache = JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
            this.prettyTypeConfigCache = raw;
        }
        return this.prettyTypeConfigCache;
    }

    public get HasAnything(): boolean {
        return this.Pairings.length > 0 || this.Identities.length > 0 || this.PrettyTypeConfiguration != null;
    }

    /**
     * Loads the agent's pairings + bridge identities in one batched round trip,
     * scoped to the host form's provider. TypeConfiguration is read straight off
     * the already-loaded record (no query needed).
     */
    private async loadData(): Promise<void> {
        const agentId = this.Record?.ID;
        if (!agentId) return;

        this.Loading = true;
        this.LoadError = null;
        try {
            const rv = RunView.FromMetadataProvider(this.FormComponent.ProviderToUse);
            const results = await rv.RunViews([
                {
                    EntityName: 'MJ: AI Agent Co Agents',
                    Fields: ['ID', 'CoAgentID', 'CoAgent', 'TargetAgentID', 'TargetAgent', 'Type', 'IsDefault', 'Sequence', 'Status'],
                    ExtraFilter: `CoAgentID='${agentId}' OR TargetAgentID='${agentId}'`,
                    OrderBy: 'Sequence ASC',
                    ResultType: 'simple',
                },
                {
                    EntityName: 'MJ: AI Bridge Agent Identities',
                    Fields: ['ID', 'IdentityType', 'IdentityValue', 'DisplayName', 'Provider', 'IsActive'],
                    ExtraFilter: `AgentID='${agentId}'`,
                    OrderBy: 'Provider ASC',
                    ResultType: 'simple',
                },
            ]);

            const pairings = (results[0]?.Success ? results[0].Results : []) as Array<Omit<CoAgentPairingRow, 'role'>>;
            this.Pairings = pairings.map((p) => ({
                ...p,
                role: UUIDsEqual(p.CoAgentID, agentId) ? 'as-coagent' : 'as-target',
            }));
            this.Identities = (results[1]?.Success ? results[1].Results : []) as BridgeIdentityRow[];
        } catch (error) {
            console.error('Error loading agent realtime panel data:', error);
            this.LoadError = 'Failed to load realtime setup.';
        } finally {
            this.Loading = false;
            this.cdr.markForCheck();
        }
    }

    public PairingTypeIcon(type: string): string {
        switch (type) {
            case 'CoAgent': return 'fa-microphone-lines';
            case 'Delegate': return 'fa-share-from-square';
            case 'Fallback': return 'fa-life-ring';
            case 'Observer': return 'fa-eye';
            case 'Peer': return 'fa-people-arrows';
            case 'Reviewer': return 'fa-clipboard-check';
            default: return 'fa-link';
        }
    }

    public IdentityTypeIcon(type: string): string {
        switch (type) {
            case 'Email': return 'fa-envelope';
            case 'PhoneNumber': return 'fa-phone';
            case 'AccountID': return 'fa-id-badge';
            default: return 'fa-id-card';
        }
    }

    /** The "other" agent in a pairing (the one that isn't the agent on this form). */
    public OtherAgentName(p: CoAgentPairingRow): string {
        return p.role === 'as-coagent' ? (p.TargetAgent ?? 'this agent') : (p.CoAgent ?? 'unknown co-agent');
    }

    public OpenPairing(p: CoAgentPairingRow): void {
        SharedService.Instance.OpenEntityRecord('MJ: AI Agent Co Agents', CompositeKey.FromID(p.ID));
    }

    public OpenIdentity(i: BridgeIdentityRow): void {
        SharedService.Instance.OpenEntityRecord('MJ: AI Bridge Agent Identities', CompositeKey.FromID(i.ID));
    }
}

/** Tree-shake guard — invoked from the panels module loader. */
export function LoadAgentRealtimePanel(): void {
    /* no-op marker */
}
