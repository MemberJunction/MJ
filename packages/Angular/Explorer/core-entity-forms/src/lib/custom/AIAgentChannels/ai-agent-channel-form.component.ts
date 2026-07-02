import { Component } from '@angular/core';
import { MJAIAgentChannelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJAIAgentChannelFormComponent } from '../../generated/Entities/MJAIAgentChannel/mjaiagentchannel.form.component';

/**
 * Custom form for 'MJ: AI Agent Channels' — the pluggable channel-definition
 * registry for realtime agent sessions. A light enhancement over the generated
 * form: a clean header (channel icon, transport pill, active badge) above the
 * standard generated field panels, with the ConfigSchema rendered as code.
 */
@RegisterClass(BaseFormComponent, 'MJ: AI Agent Channels')
@Component({
    standalone: false,
    selector: 'mj-ai-agent-channel-form',
    templateUrl: './ai-agent-channel-form.component.html',
    styleUrls: ['./ai-agent-channel-form.component.css']
})
export class MJAIAgentChannelFormComponentExtended extends MJAIAgentChannelFormComponent {
    public record!: MJAIAgentChannelEntity;

    /** Font Awesome icon for well-known channel definitions, generic plug otherwise. */
    public get ChannelIcon(): string {
        switch (this.record?.Name) {
            case 'VoiceAudio': return 'fa-microphone-lines';
            case 'TextChat': return 'fa-comment';
            case 'ClientControl': return 'fa-sliders';
            case 'Whiteboard': return 'fa-chalkboard';
            case 'Video': return 'fa-video';
            default: return 'fa-plug';
        }
    }
}
