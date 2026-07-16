import { Component } from '@angular/core';
import { constantcontactaccount_physical_addressEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Account Physical Addresses') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactaccount_physical_address-form',
    templateUrl: './constantcontactaccount_physical_address.form.component.html'
})
export class constantcontactaccount_physical_addressFormComponent extends BaseFormComponent {
    public record!: constantcontactaccount_physical_addressEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

