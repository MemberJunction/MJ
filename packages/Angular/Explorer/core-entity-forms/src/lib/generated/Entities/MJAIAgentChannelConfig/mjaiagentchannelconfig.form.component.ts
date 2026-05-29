import { Component } from '@angular/core';
import { MJAIAgentChannelConfigEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Channel Configs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentchannelconfig-form',
    templateUrl: './mjaiagentchannelconfig.form.component.html'
})
export class MJAIAgentChannelConfigFormComponent extends BaseFormComponent {
    public record!: MJAIAgentChannelConfigEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentChannelMapping', sectionName: 'Agent Channel Mapping', isExpanded: true },
            { sectionKey: 'configurationSettings', sectionName: 'Configuration Settings', isExpanded: true },
            { sectionKey: 'voicePersona', sectionName: 'Voice Persona', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

