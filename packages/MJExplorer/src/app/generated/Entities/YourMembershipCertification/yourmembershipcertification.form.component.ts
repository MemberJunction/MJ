import { Component } from '@angular/core';
import { YourMembershipCertificationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Certifications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipcertification-form',
    templateUrl: './yourmembershipcertification.form.component.html'
})
export class YourMembershipCertificationFormComponent extends BaseFormComponent {
    public record!: YourMembershipCertificationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'certificationDetails', sectionName: 'Certification Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'eventCEUAwards', sectionName: 'Event CEU Awards', isExpanded: false }
        ]);
    }
}

