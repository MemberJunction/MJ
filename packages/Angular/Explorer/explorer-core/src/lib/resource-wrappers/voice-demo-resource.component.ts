import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { LoadVoiceWidget, VoiceWidgetComponent } from '@memberjunction/ng-voice-widget';

// Reference the tree-shake-prevention symbol so the bundler keeps the widget
// in the final bundle. Cheap call; intentional no-op.
LoadVoiceWidget();

/**
 * Voice Demo resource wrapper — surfaces the `<mj-voice-widget>` inside MJ
 * Explorer's tab/nav system.
 *
 * Why this exists (and why a dedicated resource component rather than a
 * button on the Agent form): per `plans/audio-agent-architecture.md §1(g)`,
 * the voice widget is the canonical UI surface for voice channels. A nav-
 * surfaced resource component is the lightest integration — users open
 * Explorer normally (MSAL auth, no query-string tokens), navigate to "Voice
 * Demo", and talk to Sage immediately.
 *
 * The agent ID below is Sage's well-known ID from the dev metadata. When the
 * voice channels feature graduates beyond demo, this component should pick
 * the target agent from `Data.Configuration` (a query-string-driven `agentId`)
 * rather than hard-coding.
 */
@RegisterClass(BaseResourceComponent, 'VoiceDemoResource')
@Component({
    standalone: false,
    selector: 'mj-voice-demo-resource',
    template: `
        <div class="voice-demo-resource">
            <mj-voice-widget [AgentID]="AgentID" [ChannelName]="'voice-cascaded'"></mj-voice-widget>
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }
            .voice-demo-resource {
                display: flex;
                width: 100%;
                height: 100%;
                padding: 16px;
                background: var(--mj-bg-page);
                box-sizing: border-box;
            }
            .voice-demo-resource > mj-voice-widget {
                flex: 1;
                min-height: 0;
            }
        `,
    ],
})
export class VoiceDemoResource extends BaseResourceComponent implements OnInit {
    /**
     * Sage agent ID — the canonical demo target. Resolved from
     * `Data.Configuration['agentId']` when present, otherwise falls back to the
     * hard-coded dev metadata ID from `plans/audio-agent-architecture.md`.
     */
    public AgentID = '3AB78346-897F-4238-AA6A-F10A131CC691';

    public override ngOnInit(): void {
        super.ngOnInit();

        // Allow override from nav config (e.g. a future "Voice Channels" app
        // that wants to talk to a non-Sage agent).
        const configured = this.Data?.Configuration?.['agentId'];
        if (typeof configured === 'string' && configured.length > 0) {
            this.AgentID = configured;
        }

        this.NotifyLoadComplete();
    }

    public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Voice Demo';
    }

    public async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-microphone';
    }
}
