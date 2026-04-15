import { Component } from '@angular/core';
import { MJResourcePermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Resource Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjresourcepermission-form',
    templateUrl: './mjresourcepermission.form.component.html'
})
export class MJResourcePermissionFormComponent extends BaseFormComponent {
    public record!: MJResourcePermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'recipientAccessScope', sectionName: 'Recipient & Access Scope', isExpanded: true },
            { sectionKey: 'sharingScheduleStatus', sectionName: 'Sharing Schedule & Status', isExpanded: false },
            { sectionKey: 'resourceReference', sectionName: 'Resource Reference', isExpanded: false }
        ]);
    }
}

