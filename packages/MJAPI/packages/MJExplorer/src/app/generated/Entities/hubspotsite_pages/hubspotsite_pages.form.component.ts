import { Component } from '@angular/core';
import { hubspotsite_pagesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Site Pages') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotsite_pages-form',
    templateUrl: './hubspotsite_pages.form.component.html'
})
export class hubspotsite_pagesFormComponent extends BaseFormComponent {
    public record!: hubspotsite_pagesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'redirectSettings', sectionName: 'Redirect Settings', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'sEOAndMetadata', sectionName: 'SEO and Metadata', isExpanded: false },
            { sectionKey: 'publicationStatus', sectionName: 'Publication Status', isExpanded: false },
            { sectionKey: 'pageIdentity', sectionName: 'Page Identity', isExpanded: false },
            { sectionKey: 'organization', sectionName: 'Organization', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

