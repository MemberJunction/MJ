import { Component } from '@angular/core';
import { CustomerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Customers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-customer-form',
    templateUrl: './customer.form.component.html'
})
export class CustomerFormComponent extends BaseFormComponent {
    public record!: CustomerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'personalInformation', sectionName: 'Personal Information', isExpanded: true },
            { sectionKey: 'accountDetails', sectionName: 'Account Details', isExpanded: true },
            { sectionKey: 'location', sectionName: 'Location', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'orders', sectionName: 'Orders', isExpanded: false }
        ]);
    }
}

