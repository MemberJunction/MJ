import { Component } from '@angular/core';
import { MJTourStepTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Tour Step Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtoursteptype-form',
    templateUrl: './mjtoursteptype.form.component.html'
})
export class MJTourStepTypeFormComponent extends BaseFormComponent {
    public record!: MJTourStepTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'stepTypeDetails', sectionName: 'Step Type Details', isExpanded: true },
            { sectionKey: 'implementationRuntime', sectionName: 'Implementation & Runtime', isExpanded: true },
            { sectionKey: 'configurationCapabilities', sectionName: 'Configuration & Capabilities', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTourSteps', sectionName: 'Tour Steps', isExpanded: false }
        ]);
    }
}

