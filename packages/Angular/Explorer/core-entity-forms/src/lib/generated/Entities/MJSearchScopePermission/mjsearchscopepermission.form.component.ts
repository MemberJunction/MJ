import { Component } from '@angular/core';
import { MJSearchScopePermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Search Scope Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsearchscopepermission-form',
    templateUrl: './mjsearchscopepermission.form.component.html'
})
export class MJSearchScopePermissionFormComponent extends BaseFormComponent {
    public record!: MJSearchScopePermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

