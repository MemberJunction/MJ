import { Component } from '@angular/core';
import { CredentialTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Credential Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-credentialtype-form',
    templateUrl: './credentialtype.form.component.html'
})
export class CredentialTypeFormComponent extends BaseFormComponent {
    public record!: CredentialTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'credentialTypeDetails', sectionName: 'Credential Type Details', isExpanded: true },
            { sectionKey: 'technicalSpecification', sectionName: 'Technical Specification', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'credentials', sectionName: 'Credentials', isExpanded: false }
        ]);
    }
}

export function LoadCredentialTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
