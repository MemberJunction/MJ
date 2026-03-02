import { Component } from '@angular/core';
import { MJListEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Lists') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjlist-form',
    templateUrl: './mjlist.form.component.html'
})
export class MJListFormComponent extends BaseFormComponent {
    public record!: MJListEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'listDefinition', sectionName: 'List Definition', isExpanded: true },
            { sectionKey: 'associations', sectionName: 'Associations', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJDuplicateRuns', sectionName: 'Duplicate Runs', isExpanded: false },
            { sectionKey: 'mJListDetails', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'mJListInvitations', sectionName: 'List Invitations', isExpanded: false },
            { sectionKey: 'mJListShares', sectionName: 'List Shares', isExpanded: false }
        ]);
    }
}

