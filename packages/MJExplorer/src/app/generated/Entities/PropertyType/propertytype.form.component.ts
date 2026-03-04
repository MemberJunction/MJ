import { Component } from '@angular/core';
import { PropertyTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Property Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-propertytype-form',
    templateUrl: './propertytype.form.component.html'
})
export class PropertyTypeFormComponent extends BaseFormComponent {
    public record!: PropertyTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'properties', sectionName: 'Properties', isExpanded: false }
        ]);
    }
}

