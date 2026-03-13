import { Component } from '@angular/core';
import { MJAIAgentRequestTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Request Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentrequesttype-form',
    templateUrl: './mjaiagentrequesttype.form.component.html'
})
export class MJAIAgentRequestTypeFormComponent extends BaseFormComponent {
    public record!: MJAIAgentRequestTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'requestTypeConfiguration', sectionName: 'Request Type Configuration', isExpanded: true },
            { sectionKey: 'defaultRequestSettings', sectionName: 'Default Request Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentRequests', sectionName: 'AI Agent Requests', isExpanded: false }
        ]);
    }
}

