import { Component } from '@angular/core';
import { MJAIAgentPermissionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentpermissions-form',
    templateUrl: './mjaiagentpermissions.form.component.html'
})
export class MJAIAgentPermissionsFormComponent extends BaseFormComponent {
    public record!: MJAIAgentPermissionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'administrativeMetadata', sectionName: 'Administrative Metadata', isExpanded: false },
            { sectionKey: 'assignmentTargets', sectionName: 'Assignment Targets', isExpanded: true },
            { sectionKey: 'permissionLevels', sectionName: 'Permission Levels', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

