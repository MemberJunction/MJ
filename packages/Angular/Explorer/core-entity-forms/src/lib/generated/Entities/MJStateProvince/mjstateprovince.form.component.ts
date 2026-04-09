import { Component } from '@angular/core';
import { MJStateProvinceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: State Provinces') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjstateprovince-form',
    templateUrl: './mjstateprovince.form.component.html'
})
export class MJStateProvinceFormComponent extends BaseFormComponent {
    public record!: MJStateProvinceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJRecordGeoCodes', sectionName: 'Record Geo Codes', isExpanded: false }
        ]);
    }
}

