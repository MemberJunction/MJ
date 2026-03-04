import { Component } from '@angular/core';
import { OwnerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Owners') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-owner-form',
    templateUrl: './owner.form.component.html'
})
export class OwnerFormComponent extends BaseFormComponent {
    public record!: OwnerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'propertiessampleProperty', sectionName: 'Properties__sample_property', isExpanded: false }
        ]);
    }
}

