import { Component } from '@angular/core';
import { RecommendationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Recommendations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-recommendation-form',
    templateUrl: './recommendation.form.component.html'
})
export class RecommendationFormComponent extends BaseFormComponent {
    public record!: RecommendationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recommendationCore', sectionName: 'Recommendation Core', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'recommendationItems', sectionName: 'Recommendation Items', isExpanded: false }
        ]);
    }
}

