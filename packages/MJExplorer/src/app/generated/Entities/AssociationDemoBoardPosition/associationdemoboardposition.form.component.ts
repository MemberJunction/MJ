import { Component } from '@angular/core';
import { AssociationDemoBoardPositionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Board Positions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoboardposition-form',
    templateUrl: './associationdemoboardposition.form.component.html'
})
export class AssociationDemoBoardPositionFormComponent extends BaseFormComponent {
    public record!: AssociationDemoBoardPositionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'positionDetails', sectionName: 'Position Details', isExpanded: true },
            { sectionKey: 'governanceSettings', sectionName: 'Governance Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'boardMembers', sectionName: 'Board Members', isExpanded: false }
        ]);
    }
}

