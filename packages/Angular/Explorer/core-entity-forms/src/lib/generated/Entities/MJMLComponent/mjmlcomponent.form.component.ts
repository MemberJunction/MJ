import { Component } from '@angular/core';
import { MJMLComponentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Components') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlcomponent-form',
    templateUrl: './mjmlcomponent.form.component.html'
})
export class MJMLComponentFormComponent extends BaseFormComponent {
    public record!: MJMLComponentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJMLCompositeMembershipsChildComponentID', sectionName: 'ML Composite Memberships (Child Component ID)', isExpanded: false },
            { sectionKey: 'mJMLCompositeMembershipsCompositeComponentID', sectionName: 'ML Composite Memberships (Composite Component ID)', isExpanded: false },
            { sectionKey: 'mJMLComponentSlots', sectionName: 'ML Component Slots', isExpanded: false },
            { sectionKey: 'mJMLComponentPorts', sectionName: 'ML Component Ports', isExpanded: false },
            { sectionKey: 'mJMLModels', sectionName: 'ML Models', isExpanded: false },
            { sectionKey: 'mJMLTrainingPipelines', sectionName: 'ML Training Pipelines', isExpanded: false }
        ]);
    }
}

