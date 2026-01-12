import { Component } from '@angular/core';
import { Member__FoodieEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Members__Foodie') // Tell MemberJunction about this class
@Component({
    selector: 'gen-member__foodie-form',
    templateUrl: './member__foodie.form.component.html'
})
export class Member__FoodieFormComponent extends BaseFormComponent {
    public record!: Member__FoodieEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'memberProfile', sectionName: 'Member Profile', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'groupVisitMembers', sectionName: 'Group Visit Members', isExpanded: false },
            { sectionKey: 'restaurantVisits', sectionName: 'Restaurant Visits', isExpanded: false },
            { sectionKey: 'wishLists', sectionName: 'Wish Lists', isExpanded: false }
        ]);
    }
}

export function LoadMember__FoodieFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
