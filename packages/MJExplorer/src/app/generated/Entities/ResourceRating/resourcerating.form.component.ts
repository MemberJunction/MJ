import { Component } from '@angular/core';
import { ResourceRatingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Resource Ratings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resourcerating-form',
    templateUrl: './resourcerating.form.component.html'
})
export class ResourceRatingFormComponent extends BaseFormComponent {
    public record!: ResourceRatingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'resourceContext', sectionName: 'Resource Context', isExpanded: true },
            { sectionKey: 'ratingFeedback', sectionName: 'Rating Feedback', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadResourceRatingFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
