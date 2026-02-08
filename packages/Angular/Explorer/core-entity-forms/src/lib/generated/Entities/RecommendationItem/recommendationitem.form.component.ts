import { Component } from '@angular/core';
import { RecommendationItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Recommendation Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-recommendationitem-form',
    templateUrl: './recommendationitem.form.component.html'
})
export class RecommendationItemFormComponent extends BaseFormComponent {
    public record!: RecommendationItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalIdentifiers', sectionName: 'Technical Identifiers', isExpanded: true },
            { sectionKey: 'recommendationData', sectionName: 'Recommendation Data', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

