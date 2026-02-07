import { Component } from '@angular/core';
import { CredentialCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Credential Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-credentialcategory-form',
    templateUrl: './credentialcategory.form.component.html'
})
export class CredentialCategoryFormComponent extends BaseFormComponent {
    public record!: CredentialCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchy', sectionName: 'Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJCredentialCategories', sectionName: 'MJ: Credential Categories', isExpanded: false },
            { sectionKey: 'mJCredentials', sectionName: 'MJ: Credentials', isExpanded: false }
        ]);
    }
}

export function LoadCredentialCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
