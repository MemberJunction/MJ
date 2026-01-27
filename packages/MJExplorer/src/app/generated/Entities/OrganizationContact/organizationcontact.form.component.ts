import { Component } from '@angular/core';
import { OrganizationContactEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Organization Contacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-organizationcontact-form',
    templateUrl: './organizationcontact.form.component.html'
})
export class OrganizationContactFormComponent extends BaseFormComponent {
    public record!: OrganizationContactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'linkedEntities', sectionName: 'Linked Entities', isExpanded: true },
            { sectionKey: 'membershipDetails', sectionName: 'Membership Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadOrganizationContactFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
