import { Component } from '@angular/core';
import { CompaniesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Companies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-companies-form',
    templateUrl: './companies.form.component.html'
})
export class CompaniesFormComponent extends BaseFormComponent {
    public record!: CompaniesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'companyTags', sectionName: 'Company Tags', isExpanded: false },
            { sectionKey: 'contacts', sectionName: 'Contacts', isExpanded: false },
            { sectionKey: 'deals', sectionName: 'Deals', isExpanded: false },
            { sectionKey: 'activities', sectionName: 'Activities', isExpanded: false }
        ]);
    }
}

