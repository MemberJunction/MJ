import { Component } from '@angular/core';
import { hubspottaxesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Taxes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspottaxes-form',
    templateUrl: './hubspottaxes.form.component.html'
})
export class hubspottaxesFormComponent extends BaseFormComponent {
    public record!: hubspottaxesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taxInformation', sectionName: 'Tax Information', isExpanded: true },
            { sectionKey: 'ownershipAndAssignment', sectionName: 'Ownership and Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

