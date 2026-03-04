import { Component } from '@angular/core';
import { MaintenanceRequestEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Maintenance Requests') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-maintenancerequest-form',
    templateUrl: './maintenancerequest.form.component.html'
})
export class MaintenanceRequestFormComponent extends BaseFormComponent {
    public record!: MaintenanceRequestEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

