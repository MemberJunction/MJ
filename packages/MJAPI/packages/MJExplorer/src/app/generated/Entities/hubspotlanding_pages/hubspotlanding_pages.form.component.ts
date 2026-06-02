import { Component } from '@angular/core';
import { hubspotlanding_pagesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Landing Pages') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotlanding_pages-form',
    templateUrl: './hubspotlanding_pages.form.component.html'
})
export class hubspotlanding_pagesFormComponent extends BaseFormComponent {
    public record!: hubspotlanding_pagesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'uRLAndRouting', sectionName: 'URL and Routing', isExpanded: true },
            { sectionKey: 'publicationStatus', sectionName: 'Publication Status', isExpanded: true },
            { sectionKey: 'designAndConfiguration', sectionName: 'Design and Configuration', isExpanded: false },
            { sectionKey: 'sEOAndMetadata', sectionName: 'SEO and Metadata', isExpanded: false },
            { sectionKey: 'pageInformation', sectionName: 'Page Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

