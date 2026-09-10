import { Component } from '@angular/core';
import { MJAdopterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Adopters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjadopter-form',
    templateUrl: './mjadopter.form.component.html'
})
export class MJAdopterFormComponent extends BaseFormComponent {
    public record!: MJAdopterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'personalInformation', sectionName: 'Personal Information', isExpanded: true },
            { sectionKey: 'homeAndLifestyle', sectionName: 'Home and Lifestyle', isExpanded: true },
            { sectionKey: 'statusAndScreening', sectionName: 'Status and Screening', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAdoptions', sectionName: 'Adoptions', isExpanded: false }
        ]);
    }
}

