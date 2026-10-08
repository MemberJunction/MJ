import { Component } from '@angular/core';
import { MJConversationBranchEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Conversation Branches') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationbranch-form',
    templateUrl: './mjconversationbranch.form.component.html'
})
export class MJConversationBranchFormComponent extends BaseFormComponent {
    public record!: MJConversationBranchEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'branchDetails', sectionName: 'Branch Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJConversationBranches', sectionName: 'Conversation Branches', isExpanded: false },
            { sectionKey: 'mJConversationDetails', sectionName: 'Conversation Details', isExpanded: false }
        ]);
    }
}

