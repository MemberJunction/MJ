import { Component } from '@angular/core';
import { MJUserViewEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: User Views') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserview-form',
    templateUrl: './mjuserview.form.component.html'
})
export class MJUserViewFormComponent extends BaseFormComponent {
    public record!: MJUserViewEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'userOwnership', sectionName: 'User & Ownership', isExpanded: true },
            { sectionKey: 'entityContext', sectionName: 'Entity Context', isExpanded: true },
            { sectionKey: 'viewDefinitionSettings', sectionName: 'View Definition & Settings', isExpanded: false },
            { sectionKey: 'filteringSmartSearch', sectionName: 'Filtering & Smart Search', isExpanded: false },
            { sectionKey: 'displaySettings', sectionName: 'Display Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJDataContextItems', sectionName: 'Data Context Items', isExpanded: false },
            { sectionKey: 'mJEntityRelationships', sectionName: 'Entity Relationships', isExpanded: false },
            { sectionKey: 'mJUserViewRuns', sectionName: 'User View Runs', isExpanded: false }
        ]);
    }
}

