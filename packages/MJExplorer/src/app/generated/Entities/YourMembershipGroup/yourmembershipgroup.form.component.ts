import { Component } from '@angular/core';
import { YourMembershipGroupEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Groups') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipgroup-form',
    templateUrl: './yourmembershipgroup.form.component.html'
})
export class YourMembershipGroupFormComponent extends BaseFormComponent {
    public record!: YourMembershipGroupEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'groupDetails', sectionName: 'Group Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'memberGroups', sectionName: 'Member Groups', isExpanded: false },
            { sectionKey: 'memberGroupBulks', sectionName: 'Member Group Bulks', isExpanded: false }
        ]);
    }
}

