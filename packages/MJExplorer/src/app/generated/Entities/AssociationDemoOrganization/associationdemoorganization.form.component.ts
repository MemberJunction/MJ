import { Component } from '@angular/core';
import { AssociationDemoOrganizationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Organizations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoorganization-form',
    templateUrl: './associationdemoorganization.form.component.html'
})
export class AssociationDemoOrganizationFormComponent extends BaseFormComponent {
    public record!: AssociationDemoOrganizationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'organizationProfile', sectionName: 'Organization Profile', isExpanded: true },
            { sectionKey: 'businessMetrics', sectionName: 'Business Metrics', isExpanded: true },
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'members', sectionName: 'Members', isExpanded: false }
        ]);
    }
}

