import { Component } from '@angular/core';
import { Contact__CRMEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contacts__CRM') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contact__crm-form',
    templateUrl: './contact__crm.form.component.html'
})
export class Contact__CRMFormComponent extends BaseFormComponent {
    public record!: Contact__CRMEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'personalInformation', sectionName: 'Personal Information', isExpanded: true },
            { sectionKey: 'communication', sectionName: 'Communication', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadContact__CRMFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
