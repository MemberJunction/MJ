import { Component } from '@angular/core';
import { MJRecommendationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Recommendations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecommendation-form',
    templateUrl: './mjrecommendation.form.component.html'
})
export class MJRecommendationFormComponent extends BaseFormComponent {
    public record!: MJRecommendationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recommendationCore', sectionName: 'Recommendation Core', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJRecommendationItems', sectionName: 'Recommendation Items', isExpanded: false }
        ]);
    }
}

