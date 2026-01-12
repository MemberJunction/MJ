import { Component } from '@angular/core';
import { RestaurantVisitEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Restaurant Visits') // Tell MemberJunction about this class
@Component({
    selector: 'gen-restaurantvisit-form',
    templateUrl: './restaurantvisit.form.component.html'
})
export class RestaurantVisitFormComponent extends BaseFormComponent {
    public record!: RestaurantVisitEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'visitInformation', sectionName: 'Visit Information', isExpanded: true },
            { sectionKey: 'reviewFeedback', sectionName: 'Review & Feedback', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadRestaurantVisitFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
