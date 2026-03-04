import { Component } from '@angular/core';
import { Property__sample_propertyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Properties__sample_property') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-property__sample_property-form',
    templateUrl: './property__sample_property.form.component.html'
})
export class Property__sample_propertyFormComponent extends BaseFormComponent {
    public record!: Property__sample_propertyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'inspections', sectionName: 'Inspections', isExpanded: false },
            { sectionKey: 'leases', sectionName: 'Leases', isExpanded: false },
            { sectionKey: 'maintenanceRequests', sectionName: 'Maintenance Requests', isExpanded: false }
        ]);
    }
}

