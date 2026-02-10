import { Component } from '@angular/core';
import { RecommendationProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Recommendation Providers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-recommendationprovider-form',
    templateUrl: './recommendationprovider.form.component.html'
})
export class RecommendationProviderFormComponent extends BaseFormComponent {
    public record!: RecommendationProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerInformation', sectionName: 'Provider Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'recommendationRuns', sectionName: 'Recommendation Runs', isExpanded: false }
        ]);
    }
}

