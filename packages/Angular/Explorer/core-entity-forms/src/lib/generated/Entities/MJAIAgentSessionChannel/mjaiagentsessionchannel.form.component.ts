import { Component } from '@angular/core';
import { MJAIAgentSessionChannelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Session Channels') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentsessionchannel-form',
    templateUrl: './mjaiagentsessionchannel.form.component.html'
})
export class MJAIAgentSessionChannelFormComponent extends BaseFormComponent {
    public record!: MJAIAgentSessionChannelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sessionContext', sectionName: 'Session Context', isExpanded: true },
            { sectionKey: 'connectionStatus', sectionName: 'Connection Status', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

