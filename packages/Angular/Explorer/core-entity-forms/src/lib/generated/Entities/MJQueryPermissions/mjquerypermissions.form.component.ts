import { Component } from '@angular/core';
import { MJQueryPermissionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Query Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjquerypermissions-form',
    templateUrl: './mjquerypermissions.form.component.html'
})
export class MJQueryPermissionsFormComponent extends BaseFormComponent {
    public record!: MJQueryPermissionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'permissionRecord', sectionName: 'Permission Record', isExpanded: true },
            { sectionKey: 'descriptiveLabels', sectionName: 'Descriptive Labels', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

