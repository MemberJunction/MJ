import { Component } from '@angular/core';
import { MJAuthorizationRolesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Authorization Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjauthorizationroles-form',
    templateUrl: './mjauthorizationroles.form.component.html'
})
export class MJAuthorizationRolesFormComponent extends BaseFormComponent {
    public record!: MJAuthorizationRolesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'referenceKeys', sectionName: 'Reference Keys', isExpanded: true },
            { sectionKey: 'accessSettings', sectionName: 'Access Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

