import { Component } from '@angular/core';
import { MJRecommendationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Recommendations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecommendations-form',
    templateUrl: './mjrecommendations.form.component.html'
})
export class MJRecommendationsFormComponent extends BaseFormComponent {
    public record!: MJRecommendationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recommendationCore', sectionName: 'Recommendation Core', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'recommendationItems', sectionName: 'Recommendation Items', isExpanded: false }
        ]);
    }
}

