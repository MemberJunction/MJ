import { Component } from '@angular/core';
import { MJListsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Lists') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjlists-form',
    templateUrl: './mjlists.form.component.html'
})
export class MJListsFormComponent extends BaseFormComponent {
    public record!: MJListsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'listDefinition', sectionName: 'List Definition', isExpanded: true },
            { sectionKey: 'associations', sectionName: 'Associations', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'duplicateRuns', sectionName: 'Duplicate Runs', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'mJListInvitations', sectionName: 'MJ: List Invitations', isExpanded: false },
            { sectionKey: 'mJListShares', sectionName: 'MJ: List Shares', isExpanded: false }
        ]);
    }
}

