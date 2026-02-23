import { Component } from '@angular/core';
import { MJEmployeeRolesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Employee Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjemployeeroles-form',
    templateUrl: './mjemployeeroles.form.component.html'
})
export class MJEmployeeRolesFormComponent extends BaseFormComponent {
    public record!: MJEmployeeRolesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entityKeys', sectionName: 'Entity Keys', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'roleAssignment', sectionName: 'Role Assignment', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

