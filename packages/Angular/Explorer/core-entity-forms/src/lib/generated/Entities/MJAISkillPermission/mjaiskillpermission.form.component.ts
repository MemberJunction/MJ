import { Component } from '@angular/core';
import { MJAISkillPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Skill Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiskillpermission-form',
    templateUrl: './mjaiskillpermission.form.component.html'
})
export class MJAISkillPermissionFormComponent extends BaseFormComponent {
    public record!: MJAISkillPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'permissionAssignment', sectionName: 'Permission Assignment', isExpanded: true },
            { sectionKey: 'accessRights', sectionName: 'Access Rights', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

