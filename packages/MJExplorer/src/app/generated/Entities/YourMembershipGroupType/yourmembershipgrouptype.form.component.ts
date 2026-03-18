import { Component } from '@angular/core';
import { YourMembershipGroupTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Group Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipgrouptype-form',
    templateUrl: './yourmembershipgrouptype.form.component.html'
})
export class YourMembershipGroupTypeFormComponent extends BaseFormComponent {
    public record!: YourMembershipGroupTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'typeDetails', sectionName: 'Type Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'groups', sectionName: 'Groups', isExpanded: false },
            { sectionKey: 'memberGroups', sectionName: 'Member Groups', isExpanded: false }
        ]);
    }
}

