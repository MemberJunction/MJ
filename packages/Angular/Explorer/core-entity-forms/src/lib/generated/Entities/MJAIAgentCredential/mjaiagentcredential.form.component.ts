import { Component } from '@angular/core';
import { MJAIAgentCredentialEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Credentials') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentcredential-form',
    templateUrl: './mjaiagentcredential.form.component.html'
})
export class MJAIAgentCredentialFormComponent extends BaseFormComponent {
    public record!: MJAIAgentCredentialEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'credentialAssignment', sectionName: 'Credential Assignment', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

