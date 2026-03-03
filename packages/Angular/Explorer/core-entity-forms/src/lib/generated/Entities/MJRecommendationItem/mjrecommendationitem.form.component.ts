import { Component } from '@angular/core';
import { MJRecommendationItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Recommendation Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecommendationitem-form',
    templateUrl: './mjrecommendationitem.form.component.html'
})
export class MJRecommendationItemFormComponent extends BaseFormComponent {
    public record!: MJRecommendationItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalIdentifiers', sectionName: 'Technical Identifiers', isExpanded: true },
            { sectionKey: 'recommendationData', sectionName: 'Recommendation Data', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

