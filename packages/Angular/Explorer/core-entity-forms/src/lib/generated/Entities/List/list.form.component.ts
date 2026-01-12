import { Component } from '@angular/core';
import { ListEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Lists') // Tell MemberJunction about this class
@Component({
    selector: 'gen-list-form',
    templateUrl: './list.form.component.html'
})
export class ListFormComponent extends BaseFormComponent {
    public record!: ListEntity;

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

export function LoadListFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
