import { Component } from '@angular/core';
import { PropertyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Properties') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-property-form',
    templateUrl: './property.form.component.html'
})
export class PropertyFormComponent extends BaseFormComponent {
    public record!: PropertyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'propertyImages', sectionName: 'Property Images', isExpanded: false },
            { sectionKey: 'offers', sectionName: 'Offers', isExpanded: false },
            { sectionKey: 'openHouses', sectionName: 'Open Houses', isExpanded: false },
            { sectionKey: 'showings', sectionName: 'Showings', isExpanded: false },
            { sectionKey: 'transactions', sectionName: 'Transactions', isExpanded: false }
        ]);
    }
}

