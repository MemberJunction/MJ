import { Component } from '@angular/core';
import { MJMLFindingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Findings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlfinding-form',
    templateUrl: './mjmlfinding.form.component.html'
})
export class MJMLFindingFormComponent extends BaseFormComponent {
    public record!: MJMLFindingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'findingOverview', sectionName: 'Finding Overview', isExpanded: true },
            { sectionKey: 'modelContext', sectionName: 'Model Context', isExpanded: true },
            { sectionKey: 'epistemicStatus', sectionName: 'Epistemic Status', isExpanded: true },
            { sectionKey: 'measurementData', sectionName: 'Measurement Data', isExpanded: true },
            { sectionKey: 'validationMetrics', sectionName: 'Validation Metrics', isExpanded: true },
            { sectionKey: 'searchability', sectionName: 'Searchability', isExpanded: true },
            { sectionKey: 'lifecycleManagement', sectionName: 'Lifecycle Management', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLFindings', sectionName: 'ML Findings', isExpanded: false }
        ]);
    }
}

