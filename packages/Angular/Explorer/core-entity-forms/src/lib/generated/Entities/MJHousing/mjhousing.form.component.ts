import { Component } from '@angular/core';
import { MJHousingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Housings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjhousing-form',
    templateUrl: './mjhousing.form.component.html'
})
export class MJHousingFormComponent extends BaseFormComponent {
    public record!: MJHousingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'housingDetails', sectionName: 'Housing Details', isExpanded: true },
            { sectionKey: 'operationalRules', sectionName: 'Operational Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAnimals', sectionName: 'Animals', isExpanded: false }
        ]);
    }
}

