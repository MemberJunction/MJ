import { Component } from '@angular/core';
import { hubspotuser_rolesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'User Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotuser_roles-form',
    templateUrl: './hubspotuser_roles.form.component.html'
})
export class hubspotuser_rolesFormComponent extends BaseFormComponent {
    public record!: hubspotuser_rolesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'roleDefinition', sectionName: 'Role Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

