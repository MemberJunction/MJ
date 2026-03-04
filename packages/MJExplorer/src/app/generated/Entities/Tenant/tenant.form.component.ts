import { Component } from '@angular/core';
import { TenantEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Tenants') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-tenant-form',
    templateUrl: './tenant.form.component.html'
})
export class TenantFormComponent extends BaseFormComponent {
    public record!: TenantEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'leases', sectionName: 'Leases', isExpanded: false },
            { sectionKey: 'maintenanceRequests', sectionName: 'Maintenance Requests', isExpanded: false }
        ]);
    }
}

