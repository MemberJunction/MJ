import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJAIAgentSessionBridgeEntity } from '@memberjunction/core-entities';
import { MJAIAgentSessionBridgeFormComponent } from '../../generated/Entities/MJAIAgentSessionBridge/mjaiagentsessionbridge.form.component';

type BridgeStatus = MJAIAgentSessionBridgeEntity['Status'];

/** One node in the lifecycle timeline header. */
export interface BridgeTimelineStep {
    /** The status this step represents. */
    status: BridgeStatus;
    label: string;
    icon: string;
    /** The timestamp field that marks this step reached, if any. */
    timestamp: Date | null;
    /** 'done' = passed, 'current' = the record's current status, 'pending' = not yet reached. */
    state: 'done' | 'current' | 'pending';
}

/** The canonical happy-path lifecycle order for index comparison. */
const LIFECYCLE_ORDER: BridgeStatus[] = [
    'Scheduled', 'Pending', 'Connecting', 'Connected', 'Disconnecting', 'Disconnected',
];

/**
 * Custom form for 'MJ: AI Agent Session Bridges' (Pattern 2). The live /
 * historical view of a single bridge leg: a readable lifecycle timeline
 * (Scheduled/Pending → Connecting → Connected → Disconnecting → Disconnected,
 * or Failed) built from the status + lifecycle timestamps, then the connection
 * details (Direction / JoinMethod / TurnMode / Address / ExternalConnectionID)
 * and the related participant grid. Mostly read-oriented — these rows are
 * written by the realtime engine, not hand-edited.
 */
@RegisterClass(BaseFormComponent, 'MJ: AI Agent Session Bridges')
@Component({
    standalone: false,
    selector: 'mj-ai-agent-session-bridge-form',
    templateUrl: './session-bridge-form.component.html',
    styleUrls: ['./session-bridge-form.component.css'],
})
export class MJAIAgentSessionBridgeFormComponentExtended extends MJAIAgentSessionBridgeFormComponent {
    public override record!: MJAIAgentSessionBridgeEntity;

    /** Register section state including the custom lifecycle timeline panel. */
    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'lifecycleTimeline', sectionName: 'Lifecycle', isExpanded: true },
            { sectionKey: 'sessionContext', sectionName: 'Session Context', isExpanded: true },
            { sectionKey: 'connectionDetails', sectionName: 'Connection Details', isExpanded: true },
            { sectionKey: 'lifecycleAndTiming', sectionName: 'Lifecycle and Timing', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentSessionBridgeParticipants', sectionName: 'Participants', isExpanded: false },
        ]);
    }

    /** True when the bridge ended abnormally — surfaced distinctly in the timeline. */
    public get IsFailed(): boolean {
        return this.record?.Status === 'Failed';
    }

    /**
     * The lifecycle timeline steps with per-step state (done / current /
     * pending) and the timestamp that marks each step reached.
     */
    public get TimelineSteps(): BridgeTimelineStep[] {
        const r = this.record;
        if (!r) return [];

        const currentIndex = LIFECYCLE_ORDER.indexOf(r.Status as BridgeStatus);
        // 'Failed' / 'Scheduled' aren't on the linear path past 'Connecting';
        // treat unknown/terminal-abnormal as "everything up to Connecting is moot".
        const effectiveIndex = currentIndex >= 0 ? currentIndex : -1;

        const defs: Array<{ status: BridgeStatus; label: string; icon: string; timestamp: Date | null }> = [
            { status: 'Scheduled', label: 'Scheduled', icon: 'fa-calendar', timestamp: r.ScheduledStartTime ?? null },
            { status: 'Pending', label: 'Pending', icon: 'fa-clock', timestamp: null },
            { status: 'Connecting', label: 'Connecting', icon: 'fa-plug-circle-bolt', timestamp: null },
            { status: 'Connected', label: 'Connected', icon: 'fa-plug-circle-check', timestamp: r.ConnectedAt ?? null },
            { status: 'Disconnecting', label: 'Disconnecting', icon: 'fa-plug-circle-xmark', timestamp: null },
            { status: 'Disconnected', label: 'Disconnected', icon: 'fa-circle-stop', timestamp: r.DisconnectedAt ?? null },
        ];

        return defs.map((d) => {
            const idx = LIFECYCLE_ORDER.indexOf(d.status);
            let state: BridgeTimelineStep['state'];
            if (effectiveIndex < 0) {
                state = 'pending';
            } else if (idx < effectiveIndex) {
                state = 'done';
            } else if (idx === effectiveIndex) {
                state = 'current';
            } else {
                state = 'pending';
            }
            return { ...d, state };
        });
    }

    public GetStatusIcon(status: string | null): string {
        switch (status) {
            case 'Connected': return 'fa-plug-circle-check';
            case 'Connecting': return 'fa-plug-circle-bolt';
            case 'Disconnecting': return 'fa-plug-circle-xmark';
            case 'Disconnected': return 'fa-circle-stop';
            case 'Failed': return 'fa-triangle-exclamation';
            case 'Pending': return 'fa-clock';
            case 'Scheduled': return 'fa-calendar';
            default: return 'fa-question-circle';
        }
    }
}

/** Tree-shake guard — invoked from the custom-forms module loader. */
export function LoadMJAIAgentSessionBridgeFormComponentExtended(): void {
    /* no-op marker */
}
