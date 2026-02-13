import { Component } from '@angular/core';
import { MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Requests') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentrequest-form',
    templateUrl: './mjaiagentrequest.form.component.html'
})
export class MJAIAgentRequestFormComponent extends BaseFormComponent {
    public record!: MJAIAgentRequestEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'requestSummary', sectionName: 'Request Summary', isExpanded: true },
            { sectionKey: 'responseSummary', sectionName: 'Response Summary', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

