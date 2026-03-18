import { Component } from '@angular/core';
import { YourMembershipCountryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Countries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipcountry-form',
    templateUrl: './yourmembershipcountry.form.component.html'
})
export class YourMembershipCountryFormComponent extends BaseFormComponent {
    public record!: YourMembershipCountryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'countryDetails', sectionName: 'Country Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'members', sectionName: 'Members', isExpanded: false },
            { sectionKey: 'locations', sectionName: 'Locations', isExpanded: false }
        ]);
    }
}

