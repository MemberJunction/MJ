import { Component } from '@angular/core';
import { MJRemoteOperationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Remote Operations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjremoteoperation-form',
    templateUrl: './mjremoteoperation.form.component.html'
})
export class MJRemoteOperationFormComponent extends BaseFormComponent {
    public record!: MJRemoteOperationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'operationDetails', sectionName: 'Operation Details', isExpanded: true },
            { sectionKey: 'contractDefinition', sectionName: 'Contract Definition', isExpanded: true },
            { sectionKey: 'executionSettings', sectionName: 'Execution Settings', isExpanded: true },
            { sectionKey: 'implementationAndApproval', sectionName: 'Implementation and Approval', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

