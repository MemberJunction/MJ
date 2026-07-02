import { Component } from '@angular/core';
import { MJAIBridgeProviderChannelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Bridge Provider Channels') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaibridgeproviderchannel-form',
    templateUrl: './mjaibridgeproviderchannel.form.component.html'
})
export class MJAIBridgeProviderChannelFormComponent extends BaseFormComponent {
    public record!: MJAIBridgeProviderChannelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'bridgeRelationships', sectionName: 'Bridge Relationships', isExpanded: true },
            { sectionKey: 'channelConfiguration', sectionName: 'Channel Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

