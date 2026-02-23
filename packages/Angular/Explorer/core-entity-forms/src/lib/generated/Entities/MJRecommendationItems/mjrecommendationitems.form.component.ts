import { Component } from '@angular/core';
import { MJRecommendationItemsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Recommendation Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecommendationitems-form',
    templateUrl: './mjrecommendationitems.form.component.html'
})
export class MJRecommendationItemsFormComponent extends BaseFormComponent {
    public record!: MJRecommendationItemsEntity;

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

