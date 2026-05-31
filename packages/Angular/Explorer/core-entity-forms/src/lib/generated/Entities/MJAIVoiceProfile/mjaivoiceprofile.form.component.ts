import { Component } from '@angular/core';
import { MJAIVoiceProfileEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Voice Profiles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaivoiceprofile-form',
    templateUrl: './mjaivoiceprofile.form.component.html'
})
export class MJAIVoiceProfileFormComponent extends BaseFormComponent {
    public record!: MJAIVoiceProfileEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'profileIdentity', sectionName: 'Profile Identity', isExpanded: true },
            { sectionKey: 'voiceConfiguration', sectionName: 'Voice Configuration', isExpanded: true },
            { sectionKey: 'providerSettings', sectionName: 'Provider Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentChannelConfigs', sectionName: 'AI Agent Channel Configs', isExpanded: false }
        ]);
    }
}

