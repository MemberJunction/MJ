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
            { sectionKey: 'mJMLComponentBindings', sectionName: 'ML Component Bindings', isExpanded: false },
            { sectionKey: 'mJMLComponentsSourceComponentID', sectionName: 'ML Components (Source Component ID)', isExpanded: false },
            { sectionKey: 'mJMLComponentsParentComponentID', sectionName: 'ML Components (Parent Component ID)', isExpanded: false },
            { sectionKey: 'mJMLModels', sectionName: 'ML Models', isExpanded: false },
            { sectionKey: 'mJMLFindings', sectionName: 'ML Findings', isExpanded: false }
        ]);
    }
}

