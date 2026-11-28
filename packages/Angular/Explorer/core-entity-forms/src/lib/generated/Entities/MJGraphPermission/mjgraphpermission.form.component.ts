import { Component } from '@angular/core';
import { MJGraphPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Graph Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgraphpermission-form',
    templateUrl: './mjgraphpermission.form.component.html'
})
export class MJGraphPermissionFormComponent extends BaseFormComponent {
    public record!: MJGraphPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'permissionDetails', sectionName: 'Permission Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

