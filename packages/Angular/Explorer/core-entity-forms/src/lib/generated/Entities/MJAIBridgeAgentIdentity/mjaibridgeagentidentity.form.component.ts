import { Component } from '@angular/core';
import { MJAIBridgeAgentIdentityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Bridge Agent Identities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaibridgeagentidentity-form',
    templateUrl: './mjaibridgeagentidentity.form.component.html'
})
export class MJAIBridgeAgentIdentityFormComponent extends BaseFormComponent {
    public record!: MJAIBridgeAgentIdentityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identityAssignment', sectionName: 'Identity Assignment', isExpanded: true },
            { sectionKey: 'identityDetails', sectionName: 'Identity Details', isExpanded: true },
            { sectionKey: 'identityConfiguration', sectionName: 'Identity Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

