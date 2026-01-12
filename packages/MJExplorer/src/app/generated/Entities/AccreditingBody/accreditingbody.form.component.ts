import { Component } from '@angular/core';
import { AccreditingBodyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Accrediting Bodies') // Tell MemberJunction about this class
@Component({
    selector: 'gen-accreditingbody-form',
    templateUrl: './accreditingbody.form.component.html'
})
export class AccreditingBodyFormComponent extends BaseFormComponent {
    public record!: AccreditingBodyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'contactOnline', sectionName: 'Contact & Online', isExpanded: true },
            { sectionKey: 'accreditationStatus', sectionName: 'Accreditation Status', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'certificationTypes', sectionName: 'Certification Types', isExpanded: false }
        ]);
    }
}

export function LoadAccreditingBodyFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
