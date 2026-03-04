import { Component } from '@angular/core';
import { PropertyType__sample_propertyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Property Types__sample_property') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-propertytype__sample_property-form',
    templateUrl: './propertytype__sample_property.form.component.html'
})
export class PropertyType__sample_propertyFormComponent extends BaseFormComponent {
    public record!: PropertyType__sample_propertyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'propertiessampleProperty', sectionName: 'Properties__sample_property', isExpanded: false }
        ]);
    }
}

