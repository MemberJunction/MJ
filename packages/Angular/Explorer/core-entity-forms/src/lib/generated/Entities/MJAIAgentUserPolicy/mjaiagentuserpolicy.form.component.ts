import { Component } from '@angular/core';
import { MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent User Policies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentuserpolicy-form',
    templateUrl: './mjaiagentuserpolicy.form.component.html'
})
export class MJAIAgentUserPolicyFormComponent extends BaseFormComponent {
    public record!: MJAIAgentUserPolicyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'policyConfiguration', sectionName: 'Policy Configuration', isExpanded: true },
            { sectionKey: 'personalization', sectionName: 'Personalization', isExpanded: true },
            { sectionKey: 'onboarding', sectionName: 'Onboarding', isExpanded: true },
            { sectionKey: 'securityAndAccessControl', sectionName: 'Security and Access Control', isExpanded: true },
            { sectionKey: 'channelPermissions', sectionName: 'Channel Permissions', isExpanded: true },
            { sectionKey: 'approvalGates', sectionName: 'Approval Gates', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

