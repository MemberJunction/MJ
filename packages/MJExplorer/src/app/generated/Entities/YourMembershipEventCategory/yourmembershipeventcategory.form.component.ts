import { Component } from '@angular/core';
import { YourMembershipEventCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Event Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipeventcategory-form',
    templateUrl: './yourmembershipeventcategory.form.component.html'
})
export class YourMembershipEventCategoryFormComponent extends BaseFormComponent {
    public record!: YourMembershipEventCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'eventTickets', sectionName: 'Event Tickets', isExpanded: false }
        ]);
    }
}

