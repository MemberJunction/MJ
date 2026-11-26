import { Component } from '@angular/core';
import { MJMLBuildApprovalClaimEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Build Approval Claims') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlbuildapprovalclaim-form',
    templateUrl: './mjmlbuildapprovalclaim.form.component.html'
})
export class MJMLBuildApprovalClaimFormComponent extends BaseFormComponent {
    public record!: MJMLBuildApprovalClaimEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'claimDetails', sectionName: 'Claim Details', isExpanded: true },
            { sectionKey: 'pipelineDetails', sectionName: 'Pipeline Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

