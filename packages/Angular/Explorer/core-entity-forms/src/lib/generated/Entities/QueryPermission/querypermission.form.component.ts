import { Component } from '@angular/core';
import { QueryPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Query Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-querypermission-form',
    templateUrl: './querypermission.form.component.html'
})
export class QueryPermissionFormComponent extends BaseFormComponent {
    public record!: QueryPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'permissionRecord', sectionName: 'Permission Record', isExpanded: true },
            { sectionKey: 'descriptiveLabels', sectionName: 'Descriptive Labels', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

