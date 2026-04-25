import { Component } from '@angular/core';
import { MJCountryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Countries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcountry-form',
    templateUrl: './mjcountry.form.component.html'
})
export class MJCountryFormComponent extends BaseFormComponent {
    public record!: MJCountryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'countryIdentification', sectionName: 'Country Identification', isExpanded: true },
            { sectionKey: 'geographicData', sectionName: 'Geographic Data', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJStateProvinces', sectionName: 'State Provinces', isExpanded: false },
            { sectionKey: 'mJRecordGeoCodes', sectionName: 'Record Geo Codes', isExpanded: false }
        ]);
    }
}

