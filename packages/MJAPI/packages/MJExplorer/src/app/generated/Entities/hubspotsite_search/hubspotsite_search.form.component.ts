import { Component } from '@angular/core';
import { hubspotsite_searchEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Site Searches') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotsite_search-form',
    templateUrl: './hubspotsite_search.form.component.html'
})
export class hubspotsite_searchFormComponent extends BaseFormComponent {
    public record!: hubspotsite_searchEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contentClassification', sectionName: 'Content Classification', isExpanded: true },
            { sectionKey: 'searchResultDetails', sectionName: 'Search Result Details', isExpanded: true },
            { sectionKey: 'performanceMetrics', sectionName: 'Performance Metrics', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

