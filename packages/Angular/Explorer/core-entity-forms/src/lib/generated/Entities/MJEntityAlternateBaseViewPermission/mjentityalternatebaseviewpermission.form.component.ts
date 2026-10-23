import { Component } from '@angular/core';
import { MJEntityAlternateBaseViewPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Alternate Base View Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityalternatebaseviewpermission-form',
    templateUrl: './mjentityalternatebaseviewpermission.form.component.html'
})
export class MJEntityAlternateBaseViewPermissionFormComponent extends BaseFormComponent {
    public record!: MJEntityAlternateBaseViewPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'viewPermissions', sectionName: 'View Permissions', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

