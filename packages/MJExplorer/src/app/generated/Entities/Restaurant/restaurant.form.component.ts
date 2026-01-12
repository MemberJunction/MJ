import { Component } from '@angular/core';
import { RestaurantEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Restaurants') // Tell MemberJunction about this class
@Component({
    selector: 'gen-restaurant-form',
    templateUrl: './restaurant.form.component.html'
})
export class RestaurantFormComponent extends BaseFormComponent {
    public record!: RestaurantEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'restaurantOverview', sectionName: 'Restaurant Overview', isExpanded: true },
            { sectionKey: 'locationDetails', sectionName: 'Location Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'groupVisits', sectionName: 'Group Visits', isExpanded: false },
            { sectionKey: 'restaurantTags', sectionName: 'Restaurant Tags', isExpanded: false },
            { sectionKey: 'restaurantVisits', sectionName: 'Restaurant Visits', isExpanded: false },
            { sectionKey: 'wishLists', sectionName: 'Wish Lists', isExpanded: false }
        ]);
    }
}

export function LoadRestaurantFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
