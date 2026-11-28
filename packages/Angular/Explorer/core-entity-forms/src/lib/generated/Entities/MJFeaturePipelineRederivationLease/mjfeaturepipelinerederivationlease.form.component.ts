import { Component } from '@angular/core';
import { MJFeaturePipelineRederivationLeaseEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Feature Pipeline Rederivation Leases') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjfeaturepipelinerederivationlease-form',
    templateUrl: './mjfeaturepipelinerederivationlease.form.component.html'
})
export class MJFeaturePipelineRederivationLeaseFormComponent extends BaseFormComponent {
    public record!: MJFeaturePipelineRederivationLeaseEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'leaseDetails', sectionName: 'Lease Details', isExpanded: true },
            { sectionKey: 'leaseTimeline', sectionName: 'Lease Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

